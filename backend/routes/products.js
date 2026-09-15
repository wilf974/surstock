const express = require('express');
const router = express.Router();
const { queryAll, queryOne, run } = require('../db');
const { broadcast } = require('../events');
const { getMagasinId, getRole } = require('./auth');

// Un EAN est exclusivement numerique. Cette validation rejette la ligne
// d'en-tete des fichiers XLSX ("Code EAN"), qui etait jusqu'ici inseree comme
// un produit : 5 en base, un par magasin. Verifie sur les 8 578 produits de
// production : tous ont un EAN de 13 chiffres, seules les 5 en-tetes echouent.
// Retourne l'EAN normalise sur 13 chiffres, ou null si l'entree est invalide.
function normaliserEan(brut) {
  if (brut === null || brut === undefined) return null;
  const ean = String(brut).trim();
  if (!/^\d+$/.test(ean)) return null;
  if (ean.length > 13) return null;
  return ean.padStart(13, '0');
}

// GET /api/products - Liste tous les produits
router.get('/', (req, res) => {
  const { status } = req.query;
  const role = getRole(req);
  const tokenMagasinId = getMagasinId(req);

  const conditions = [];
  const params = [];

  // Filtrage par magasin
  if (role === 'store') {
    // Un magasin ne voit que ses propres produits
    conditions.push('magasin_id = ?');
    params.push(tokenMagasinId);
  } else if (req.query.magasin_id) {
    // Admin/dépôt : filtre optionnel
    conditions.push('magasin_id = ?');
    params.push(parseInt(req.query.magasin_id));
  }

  // Filtrage par statut
  if (status === 'pending') {
    conditions.push('qty_sent IS NULL');
  } else if (status === 'confirmed') {
    conditions.push('qty_sent IS NOT NULL');
  } else if (status === 'awaiting_receipt') {
    conditions.push('qty_sent IS NOT NULL AND qty_received IS NULL');
  } else if (status === 'received') {
    conditions.push('qty_received IS NOT NULL');
  }

  let query = 'SELECT * FROM products';
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY created_at DESC';

  const products = queryAll(query, params);
  res.json(products);
});

// GET /api/products/ean/:ean - Chercher un produit par EAN (pour le scanner)
router.get('/ean/:ean', (req, res) => {
  const ean = req.params.ean.padStart(13, '0');
  const role = getRole(req);
  const tokenMagasinId = getMagasinId(req);

  // Déterminer le filtre magasin
  let magFilter = '';
  const magParams = [];
  if (role === 'store') {
    magFilter = ' AND magasin_id = ?';
    magParams.push(tokenMagasinId);
  } else if (req.query.magasin_id) {
    magFilter = ' AND magasin_id = ?';
    magParams.push(parseInt(req.query.magasin_id));
  }

  // Retourner le premier produit non confirmé avec cet EAN
  const product = queryOne(
    'SELECT * FROM products WHERE ean = ? AND qty_sent IS NULL' + magFilter + ' ORDER BY id ASC LIMIT 1',
    [ean, ...magParams]
  );

  if (!product) {
    // Vérifier si le produit existe mais est déjà confirmé
    const confirmed = queryOne(
      'SELECT * FROM products WHERE ean = ? AND qty_sent IS NOT NULL' + magFilter + ' ORDER BY scanned_at DESC LIMIT 1',
      [ean, ...magParams]
    );

    if (confirmed) {
      return res.status(409).json({
        error: 'Ce produit a déjà été scanné et confirmé',
        product: confirmed
      });
    }

    return res.status(404).json({ error: 'Produit non trouvé pour ce code EAN' });
  }

  res.json(product);
});

// POST /api/products - Ajouter un produit
router.post('/', (req, res) => {
  const { ean, parkod, label, qty_requested } = req.body;
  const magasinId = req.body.magasin_id || 1;

  if (!ean || !label || qty_requested === undefined) {
    return res.status(400).json({ error: 'EAN, libellé et quantité sont requis' });
  }

  const eanNormalise = normaliserEan(ean);
  if (!eanNormalise) {
    return res.status(400).json({ error: 'EAN invalide : uniquement des chiffres, 13 au maximum' });
  }

  const qty = parseInt(qty_requested);
  const now = qty === 0 ? new Date().toISOString() : null;
  const result = run(
    'INSERT INTO products (ean, parkod, label, qty_requested, qty_sent, scanned_at, qty_received, received_at, magasin_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [eanNormalise, parkod ? parkod.trim() : null, label.trim(), qty, qty === 0 ? 0 : null, now, qty === 0 ? 0 : null, now, magasinId]
  );

  const product = queryOne('SELECT * FROM products WHERE id = ?', [result.lastInsertRowid]);
  broadcast('products-changed', { action: 'reload' });
  res.status(201).json(product);
});

// POST /api/products/bulk - Ajouter plusieurs produits
router.post('/bulk', (req, res) => {
  const { products } = req.body;
  const magasinId = req.body.magasin_id || 1;

  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Un tableau de produits est requis' });
  }

  let inserted = 0;
  const rejetes = [];
  for (const item of products) {
    if (!item.ean || !item.label || item.qty_requested === undefined) {
      rejetes.push({ ean: item && item.ean ? String(item.ean) : '(vide)', motif: 'champ obligatoire manquant' });
      continue;
    }
    const eanNormalise = normaliserEan(item.ean);
    if (!eanNormalise) {
      rejetes.push({ ean: String(item.ean), motif: 'EAN non numérique' });
      continue;
    }
    const qty = parseInt(item.qty_requested);
    const now = qty === 0 ? new Date().toISOString() : null;
    run(
      'INSERT INTO products (ean, parkod, label, qty_requested, qty_sent, scanned_at, qty_received, received_at, magasin_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [eanNormalise, item.parkod ? item.parkod.trim() : null, item.label.trim(), qty, qty === 0 ? 0 : null, now, qty === 0 ? 0 : null, now, magasinId]
    );
    inserted++;
  }

  broadcast('products-changed', { action: 'reload' });
  // Les lignes rejetees sont remontees, jamais ecartees en silence : un import
  // partiel qui s'annonce complet est indetectable cote utilisateur.
  res.status(201).json({ inserted, rejetes: rejetes.length, details: rejetes.slice(0, 10) });
});

// PATCH /api/products/export - Marquer des produits comme traités (exportés)
router.patch('/export', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Liste d\'IDs requise' });
  }
  const placeholders = ids.map(() => '?').join(',');
  run(
    `UPDATE products SET exported_at = datetime('now', 'localtime') WHERE id IN (${placeholders})`,
    ids.map(id => parseInt(id))
  );
  broadcast('product-updated', {});
  res.json({ success: true, count: ids.length });
});

// PATCH /api/products/unexport - Remettre des produits comme non traités
router.patch('/unexport', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Liste d\'IDs requise' });
  }
  const placeholders = ids.map(() => '?').join(',');
  run(
    `UPDATE products SET exported_at = NULL WHERE id IN (${placeholders})`,
    ids.map(id => parseInt(id))
  );
  broadcast('product-updated', {});
  res.json({ success: true });
});

// DELETE /api/products/:id - Supprimer un produit
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const result = run('DELETE FROM products WHERE id = ?', [parseInt(id)]);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Produit non trouvé' });
  }

  broadcast('products-changed', { action: 'reload' });
  res.json({ success: true });
});

// DELETE /api/products - Réinitialiser tous les produits
router.delete('/', (req, res) => {
  run('DELETE FROM products');
  broadcast('products-changed', { action: 'reload' });
  res.json({ success: true, message: 'Tous les produits ont été supprimés' });
});

module.exports = router;
