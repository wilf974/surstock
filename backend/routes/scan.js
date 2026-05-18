const express = require('express');
const router = express.Router();
const { queryOne, queryAll, run } = require('../db');
const { addNotification } = require('./notifications');
const { broadcast } = require('../events');
const { getMagasinId, getRole } = require('./auth');

// PATCH /api/scan/:id/confirm - Confirmer la quantité envoyée
router.patch('/:id/confirm', (req, res) => {
  const { id } = req.params;
  const { qty_sent, code } = req.body;

  if (qty_sent === undefined || qty_sent === null) {
    return res.status(400).json({ error: 'La quantité envoyée est requise' });
  }

  const product = queryOne('SELECT * FROM products WHERE id = ?', [parseInt(id)]);

  if (!product) {
    return res.status(404).json({ error: 'Produit non trouvé' });
  }

  const qtyVal = parseInt(qty_sent);
  if (qtyVal === 0) {
    // Validation à 0 : exige un code à usage unique non utilisé (sauf si qty_requested == 0)
    if (product.qty_requested > 0) {
      if (!code) {
        return res.status(400).json({ error: 'Code de validation requis' });
      }
      const codeRow = queryOne('SELECT id, used_at, type FROM zero_codes WHERE code = ?', [String(code).trim()]);
      if (!codeRow) {
        return res.status(401).json({ error: 'Code incorrect' });
      }
      if (codeRow.type === 'bulk') {
        return res.status(401).json({ error: 'Ce code est un code lot. Utilisez le bouton "Tout valider d\'un coup".' });
      }
      if (codeRow.used_at) {
        return res.status(401).json({ error: 'Ce code a déjà été utilisé' });
      }
      // Consommer le code de manière atomique
      run(
        "UPDATE zero_codes SET used_at = datetime('now', 'localtime'), used_by_magasin_id = ?, used_for_product_id = ? WHERE id = ? AND used_at IS NULL",
        [product.magasin_id || null, parseInt(id), codeRow.id]
      );
      const reread = queryOne('SELECT used_at FROM zero_codes WHERE id = ?', [codeRow.id]);
      if (!reread || !reread.used_at) {
        return res.status(401).json({ error: 'Ce code a déjà été utilisé' });
      }
    }
    // Si envoyé 0, auto-valider aussi le dépôt
    run(
      "UPDATE products SET qty_sent = 0, scanned_at = datetime('now', 'localtime'), qty_received = 0, received_at = datetime('now', 'localtime') WHERE id = ?",
      [parseInt(id)]
    );
  } else {
    run(
      "UPDATE products SET qty_sent = ?, scanned_at = datetime('now', 'localtime') WHERE id = ?",
      [qtyVal, parseInt(id)]
    );
  }

  const updated = queryOne('SELECT * FROM products WHERE id = ?', [parseInt(id)]);
  const mag = queryOne('SELECT name FROM magasins WHERE id = ?', [updated.magasin_id]);
  const magName = mag ? mag.name : 'Magasin';

  // Notification in-app
  const diff = parseInt(qty_sent) - updated.qty_requested;
  if (diff !== 0) {
    addNotification(
      `${magName}: ${updated.label} — envoyé ${qty_sent} / demandé ${updated.qty_requested} (écart ${diff > 0 ? '+' : ''}${diff})`,
      'warning'
    );
  } else {
    addNotification(
      `${magName}: ${updated.label} — confirmé ${qty_sent} (OK)`,
      'info'
    );
  }

  broadcast('product-updated', updated);
  res.json(updated);
});

// PATCH /api/scan/:id/reset - Remettre un produit en attente
router.patch('/:id/reset', (req, res) => {
  const { id } = req.params;

  run(
    'UPDATE products SET qty_sent = NULL, scanned_at = NULL WHERE id = ?',
    [parseInt(id)]
  );

  const updated = queryOne('SELECT * FROM products WHERE id = ?', [parseInt(id)]);
  if (!updated) {
    return res.status(404).json({ error: 'Produit non trouvé' });
  }

  broadcast('product-updated', updated);
  res.json(updated);
});

// POST /api/scan/bulk-zero - Valider plusieurs produits à 0 avec un seul code lot
router.post('/bulk-zero', (req, res) => {
  const { ids, code } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Liste de produits requise' });
  }
  if (!code) {
    return res.status(400).json({ error: 'Code requis' });
  }

  const codeRow = queryOne('SELECT id, used_at, type FROM zero_codes WHERE code = ?', [String(code).trim()]);
  if (!codeRow) return res.status(401).json({ error: 'Code incorrect' });
  if (codeRow.type !== 'bulk') {
    return res.status(401).json({ error: 'Ce code est individuel. Utilisez un code "lot".' });
  }
  if (codeRow.used_at) return res.status(401).json({ error: 'Ce code a déjà été utilisé' });

  const role = getRole(req);
  const tokenMagasinId = getMagasinId(req);

  // Récupérer les produits éligibles (en attente, magasin du token si role=store)
  const idsInt = ids.map(i => parseInt(i)).filter(i => Number.isInteger(i));
  if (idsInt.length === 0) return res.status(400).json({ error: 'Aucun id valide' });

  const placeholders = idsInt.map(() => '?').join(',');
  let whereExtra = '';
  let extraParams = [];
  if (role === 'store') {
    whereExtra = ' AND magasin_id = ?';
    extraParams = [tokenMagasinId];
  }
  const eligibles = queryAll(
    `SELECT * FROM products WHERE id IN (${placeholders}) AND qty_sent IS NULL${whereExtra}`,
    [...idsInt, ...extraParams]
  );

  if (eligibles.length === 0) {
    return res.status(400).json({ error: 'Aucun produit éligible (déjà validés ou autre magasin)' });
  }

  // Consommation atomique du code lot
  const magasinIdForCode = eligibles[0].magasin_id || tokenMagasinId || null;
  run(
    "UPDATE zero_codes SET used_at = datetime('now', 'localtime'), used_by_magasin_id = ?, used_count = ? WHERE id = ? AND used_at IS NULL",
    [magasinIdForCode, eligibles.length, codeRow.id]
  );
  const reread = queryOne('SELECT used_at FROM zero_codes WHERE id = ?', [codeRow.id]);
  if (!reread || !reread.used_at) {
    return res.status(401).json({ error: 'Ce code a déjà été utilisé' });
  }

  // Valider chaque produit (qty_sent=0 + auto-réception)
  const updated = [];
  for (const p of eligibles) {
    run(
      "UPDATE products SET qty_sent = 0, scanned_at = datetime('now', 'localtime'), qty_received = 0, received_at = datetime('now', 'localtime') WHERE id = ?",
      [p.id]
    );
    const rerd = queryOne('SELECT * FROM products WHERE id = ?', [p.id]);
    updated.push(rerd);
    const mag = queryOne('SELECT name FROM magasins WHERE id = ?', [rerd.magasin_id]);
    const magName = mag ? mag.name : 'Magasin';
    addNotification(`${magName}: ${rerd.label} — validé à 0 (lot)`, 'info');
    broadcast('product-updated', rerd);
  }

  res.json({ success: true, count: updated.length, products: updated });
});

module.exports = router;
