const express = require('express');
const router = express.Router();
const { queryAll } = require('../db');

// GET /api/dashboard/summary - Résumé pour le tableau de bord admin
router.get('/summary', (req, res) => {
  const products = queryAll('SELECT * FROM products ORDER BY created_at DESC');

  const total = products.length;
  const confirmed = products.filter(p => p.qty_sent !== null).length;
  const pending = total - confirmed;
  const withDifference = products.filter(
    p => p.qty_sent !== null && p.qty_sent !== p.qty_requested
  ).length;

  const totalRequested = products.reduce((sum, p) => sum + p.qty_requested, 0);
  const totalSent = products
    .filter(p => p.qty_sent !== null)
    .reduce((sum, p) => sum + p.qty_sent, 0);

  res.json({
    total,
    confirmed,
    pending,
    withDifference,
    totalRequested,
    totalSent,
    products: products.map(p => ({
      ...p,
      diff: p.qty_sent !== null ? p.qty_sent - p.qty_requested : null
    }))
  });
});

module.exports = router;
