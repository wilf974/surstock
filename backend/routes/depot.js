const express = require('express');
const router = express.Router();
const { queryOne, queryAll, run } = require('../db');
const { sendDepotNotification } = require('../email');
const { addNotification } = require('./notifications');
const { broadcast } = require('../events');

// GET /api/depot/ean/:ean — Chercher un produit confirmé par le magasin (pour scan dépôt)
router.get('/ean/:ean', (req, res) => {
  const ean = req.params.ean.padStart(13, '0');
  const magId = req.query.magasin_id ? parseInt(req.query.magasin_id) : null;

  const magFilter = magId ? ' AND magasin_id = ?' : '';
  const magParams = magId ? [magId] : [];

  // Chercher un produit envoyé mais pas encore complètement réceptionné
  const product = queryOne(
    'SELECT * FROM products WHERE (ean = ? OR parkod = ?) AND qty_sent IS NOT NULL AND (qty_received IS NULL OR qty_received < qty_sent)' + magFilter + ' ORDER BY id ASC LIMIT 1',
    [ean, ean, ...magParams]
  );

  if (!product) {
    // Tous réceptionnés ?
    const allReceived = queryOne(
      'SELECT * FROM products WHERE (ean = ? OR parkod = ?) AND qty_received IS NOT NULL AND qty_received >= qty_sent' + magFilter + ' ORDER BY received_at DESC LIMIT 1',
      [ean, ean, ...magParams]
    );
    if (allReceived) {
      return res.status(409).json({ error: 'Tous les produits de ce code ont déjà été réceptionnés', product: allReceived });
    }

    const pending = queryOne(
      'SELECT * FROM products WHERE (ean = ? OR parkod = ?) AND qty_sent IS NULL' + magFilter + ' ORDER BY id ASC LIMIT 1',
      [ean, ean, ...magParams]
    );
    if (pending) {
      return res.status(400).json({ error: 'Ce produit n\'a pas encore été confirmé par le magasin' });
    }

    return res.status(404).json({ error: 'Produit non trouvé pour ce code' });
  }

  res.json(product);
});

// PATCH /api/depot/:id/scan — Incrémenter qty_received de 1 (chaque scan = +1)
router.patch('/:id/scan', async (req, res) => {
  const { id } = req.params;

  const product = queryOne('SELECT * FROM products WHERE id = ?', [parseInt(id)]);
  if (!product) {
    return res.status(404).json({ error: 'Produit non trouvé' });
  }
  if (product.qty_sent === null) {
    return res.status(400).json({ error: 'Ce produit n\'a pas encore été confirmé par le magasin' });
  }

  const currentReceived = product.qty_received || 0;
  const newReceived = currentReceived + 1;

  run(
    "UPDATE products SET qty_received = ?, received_at = datetime('now', 'localtime') WHERE id = ?",
    [newReceived, parseInt(id)]
  );

  const updated = queryOne('SELECT * FROM products WHERE id = ?', [parseInt(id)]);
  const mag = queryOne('SELECT name FROM magasins WHERE id = ?', [updated.magasin_id]);
  const magName = mag ? mag.name : '';

  // Envoyer notification à chaque scan
  console.log(`Depot scan: ${magName}: ${updated.label} - reçu ${newReceived}/${product.qty_sent}`);
  sendDepotNotification(updated).catch(err => console.error('Email error:', err.message));

  // Notification in-app
  if (newReceived !== product.qty_sent) {
    addNotification(
      `${magName}: ÉCART: ${updated.label} — reçu ${newReceived}/${product.qty_sent}`,
      newReceived > product.qty_sent ? 'error' : 'warning'
    );
  } else {
    addNotification(
      `${magName}: ${updated.label} scanné au dépôt (${newReceived}/${product.qty_sent})`,
      'info'
    );
  }

  broadcast('product-updated', updated);
  res.json(updated);
});

// PATCH /api/depot/:id/reset — Annuler réception (admin only)
router.patch('/:id/reset', (req, res) => {
  const { id } = req.params;

  run(
    'UPDATE products SET qty_received = NULL, received_at = NULL WHERE id = ?',
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
