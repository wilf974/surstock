const express = require('express');
const router = express.Router();
const { queryOne, run } = require('../db');
const { addNotification } = require('./notifications');
const { broadcast } = require('../events');

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

  const qtyVal = parseInt(qty_sent);
  if (qtyVal === 0) {
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
