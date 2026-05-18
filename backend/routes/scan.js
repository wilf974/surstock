const express = require('express');
const router = express.Router();
const { queryOne, run } = require('../db');
const { addNotification } = require('./notifications');
const { broadcast } = require('../events');

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
      const codeRow = queryOne('SELECT id, used_at FROM zero_codes WHERE code = ?', [String(code).trim()]);
      if (!codeRow) {
        return res.status(401).json({ error: 'Code incorrect' });
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

module.exports = router;
