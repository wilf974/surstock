const express = require('express');
const router = express.Router();
const { queryAll, queryOne, run } = require('../db');

// GET /api/products - Liste tous les produits
router.get('/', (req, res) => {
  const { status } = req.query;

  let query = 'SELECT * FROM products';
  if (status === 'pending') {
    query += ' WHERE qty_sent IS NULL';
  } else if (status === 'confirmed') {
    query += ' WHERE qty_sent IS NOT NULL';
  }
  query += ' ORDER BY created_at DESC';

  const products = queryAll(query);
  res.json(products);
});

// GET /api/products/ean/:ean - Chercher un produit par EAN (pour le scanner)
router.get('/ean/:ean', (req, res) => {
  const { ean } = req.params;

  // Retourner le premier produit non confirmé avec cet EAN
  const product = queryOne(
    'SELECT * FROM products WHERE ean = ? AND qty_sent IS NULL ORDER BY id ASC LIMIT 1',
    [ean]
  );

  if (!product) {
    // Vérifier si le produit existe mais est déjà confirmé
    const confirmed = queryOne(
      'SELECT * FROM products WHERE ean = ? AND qty_sent IS NOT NULL ORDER BY scanned_at DESC LIMIT 1',
      [ean]
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

  if (!ean || !label || qty_requested === undefined) {
    return res.status(400).json({ error: 'EAN, libellé et quantité sont requis' });
  }

  const result = run(
    'INSERT INTO products (ean, parkod, label, qty_requested) VALUES (?, ?, ?, ?)',
    [ean.trim(), parkod ? parkod.trim() : null, label.trim(), parseInt(qty_requested)]
  );

  const product = queryOne('SELECT * FROM products WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json(product);
});

// POST /api/products/bulk - Ajouter plusieurs produits
router.post('/bulk', (req, res) => {
  const { products } = req.body;

  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Un tableau de produits est requis' });
  }

  let inserted = 0;
  for (const item of products) {
    if (!item.ean || !item.label || item.qty_requested === undefined) continue;
    run(
      'INSERT INTO products (ean, parkod, label, qty_requested) VALUES (?, ?, ?, ?)',
      [item.ean.trim(), item.parkod ? item.parkod.trim() : null, item.label.trim(), parseInt(item.qty_requested)]
    );
    inserted++;
  }

  res.status(201).json({ inserted });
});

// DELETE /api/products/:id - Supprimer un produit
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const result = run('DELETE FROM products WHERE id = ?', [parseInt(id)]);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Produit non trouvé' });
  }

  res.json({ success: true });
});

// DELETE /api/products - Réinitialiser tous les produits
router.delete('/', (req, res) => {
  run('DELETE FROM products');
  res.json({ success: true, message: 'Tous les produits ont été supprimés' });
});

module.exports = router;
