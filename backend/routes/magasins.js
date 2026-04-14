const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { queryAll, queryOne, run } = require('../db');

// GET / — lister tous les magasins (sans le hash du mot de passe)
router.get('/', (req, res) => {
  try {
    const magasins = queryAll('SELECT id, name, code, created_at FROM magasins ORDER BY id');
    res.json(magasins);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /:id — détail d'un magasin
router.get('/:id', (req, res) => {
  try {
    const magasin = queryOne('SELECT id, name, code, created_at FROM magasins WHERE id = ?', [req.params.id]);
    if (!magasin) {
      return res.status(404).json({ error: 'Magasin introuvable' });
    }
    res.json(magasin);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST / — créer un magasin
router.post('/', (req, res) => {
  try {
    const { name, code, password } = req.body;
    if (!name || !code || !password) {
      return res.status(400).json({ error: 'Champs name, code et password requis' });
    }

    // Vérifier unicité du code
    const existing = queryOne('SELECT id FROM magasins WHERE code = ?', [code]);
    if (existing) {
      return res.status(409).json({ error: 'Un magasin avec ce code existe déjà' });
    }

    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const result = run(
      'INSERT INTO magasins (name, code, store_password_hash) VALUES (?, ?, ?)',
      [name, code, hash]
    );

    const magasin = queryOne('SELECT id, name, code, created_at FROM magasins WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(magasin);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /:id — modifier un magasin
router.put('/:id', (req, res) => {
  try {
    const { name, code, password } = req.body;
    const id = req.params.id;

    const magasin = queryOne('SELECT id FROM magasins WHERE id = ?', [id]);
    if (!magasin) {
      return res.status(404).json({ error: 'Magasin introuvable' });
    }

    if (!name || !code) {
      return res.status(400).json({ error: 'Champs name et code requis' });
    }

    // Vérifier unicité du code (exclure le magasin courant)
    const existing = queryOne('SELECT id FROM magasins WHERE code = ? AND id != ?', [code, id]);
    if (existing) {
      return res.status(409).json({ error: 'Un magasin avec ce code existe déjà' });
    }

    if (password) {
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      run('UPDATE magasins SET name = ?, code = ?, store_password_hash = ? WHERE id = ?', [name, code, hash, id]);
    } else {
      run('UPDATE magasins SET name = ?, code = ? WHERE id = ?', [name, code, id]);
    }

    const updated = queryOne('SELECT id, name, code, created_at FROM magasins WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /:id — supprimer un magasin
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (id === 1) {
      return res.status(400).json({ error: 'Impossible de supprimer le magasin par défaut' });
    }

    const magasin = queryOne('SELECT id FROM magasins WHERE id = ?', [id]);
    if (!magasin) {
      return res.status(404).json({ error: 'Magasin introuvable' });
    }

    // Vérifier qu'aucun produit n'est lié à ce magasin
    const productCount = queryOne('SELECT COUNT(*) as cnt FROM products WHERE magasin_id = ?', [id]);
    if (productCount && productCount.cnt > 0) {
      return res.status(400).json({ error: 'Impossible de supprimer : des produits sont liés à ce magasin' });
    }

    run('DELETE FROM magasins WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
