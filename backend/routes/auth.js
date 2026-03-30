const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Hash SHA-256 du mot de passe admin (via variable d'environnement ou hash pré-calculé)
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 'a]m!n_h@sh_n0t_s3t';

// Tokens actifs en mémoire (simple pour ce projet)
const activeTokens = new Set();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { password } = req.body;

  if (password !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  activeTokens.add(token);

  res.json({ token });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) activeTokens.delete(token);
  res.json({ success: true });
});

// GET /api/auth/check — vérifier si le token est valide
router.get('/check', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token && activeTokens.has(token)) {
    return res.json({ authenticated: true });
  }
  res.status(401).json({ authenticated: false });
});

// Middleware pour protéger les routes admin
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  next();
}

module.exports = { router, requireAdmin };
