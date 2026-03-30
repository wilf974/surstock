const express = require('express');
const router = express.Router();
const { queryOne, run } = require('../db');

// PATCH /api/scan/:id/confirm - Confirmer la quantité envoyée
router.patch('/:id/confirm', (req, res) => {
  const { id } = req.params;
  const { qty_sent } = req.body;

  if (qty_sent === undefined || qty_sent === null) {
    return res.status(400).json({ error: 'La quantité envoyée est requise' });
  }

  const product = queryOne('SELECT * FROM products WHERE id = ?', [parseInt(id)]);

  if (!product) {
    return res.status(404).json({ error: 'Produit non trouvé' });
  }

  run(
    "UPDATE products SET qty_sent = ?, scanned_at = datetime('now', 'localtime') WHERE id = ?",
    [parseInt(qty_sent), parseInt(id)]
  );

  const updated = queryOne('SELECT * FROM products WHERE id = ?', [parseInt(id)]);
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

  res.json(updated);
});

module.exports = router;
