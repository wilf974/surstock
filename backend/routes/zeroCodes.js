const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { queryAll, queryOne, run } = require('../db');

function generateUniqueCode() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const buf = crypto.randomBytes(4);
    const num = buf.readUInt32BE(0) % 1000000;
    const code = String(num).padStart(6, '0');
    const existing = queryOne('SELECT id FROM zero_codes WHERE code = ?', [code]);
    if (!existing) return code;
  }
  throw new Error('Impossible de générer un code unique');
}

// GET / — liste codes (actifs + utilisés, plus récents en premier)
router.get('/', (req, res) => {
  try {
    const codes = queryAll(`
      SELECT zc.id, zc.code, zc.type, zc.used_count, zc.created_at, zc.used_at,
             zc.used_by_magasin_id, zc.used_for_product_id,
             m.name as used_by_magasin_name, p.label as used_for_product_label
      FROM zero_codes zc
      LEFT JOIN magasins m ON m.id = zc.used_by_magasin_id
      LEFT JOIN products p ON p.id = zc.used_for_product_id
      ORDER BY zc.id DESC
    `);
    res.json(codes);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST / — générer un nouveau code (type 'single' ou 'bulk')
router.post('/', (req, res) => {
  try {
    const type = req.body && req.body.type === 'bulk' ? 'bulk' : 'single';
    const code = generateUniqueCode();
    const result = run('INSERT INTO zero_codes (code, type) VALUES (?, ?)', [code, type]);
    const created = queryOne('SELECT id, code, type, used_count, created_at, used_at FROM zero_codes WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

// DELETE /:id — révoquer un code non utilisé
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = queryOne('SELECT id, used_at FROM zero_codes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Code introuvable' });
    if (existing.used_at) {
      return res.status(400).json({ error: 'Impossible de supprimer un code déjà utilisé' });
    }
    run('DELETE FROM zero_codes WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
