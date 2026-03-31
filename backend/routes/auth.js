const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Hash SHA-256 des mots de passe (via variables d'environnement)
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 'not_set';
const STORE_PASSWORD_HASH = process.env.STORE_PASSWORD_HASH || 'not_set';
const DEPOT_PASSWORD_HASH = process.env.DEPOT_PASSWORD_HASH || 'not_set';

// Tokens actifs en mémoire : token -> role ('admin', 'store' ou 'depot')
const activeTokens = new Map();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { password, role } = req.body;

  let expectedHash;
  let tokenRole;

  if (role === 'store') {
    expectedHash = STORE_PASSWORD_HASH;
    tokenRole = 'store';
  } else if (role === 'depot') {
    expectedHash = DEPOT_PASSWORD_HASH;
    tokenRole = 'depot';
  } else {
    expectedHash = ADMIN_PASSWORD_HASH;
    tokenRole = 'admin';
  }

  if (password !== expectedHash) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  activeTokens.set(token, tokenRole);

  res.json({ token, role: tokenRole });
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
    return res.json({ authenticated: true, role: activeTokens.get(token) });
  }
  res.status(401).json({ authenticated: false });
});

// Middleware pour protéger les routes admin
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || activeTokens.get(token) !== 'admin') {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  next();
}

// Middleware pour protéger les routes magasin (admin OU store)
function requireStore(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const role = activeTokens.get(token);
  if (!token || !role || role === 'depot') {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  next();
}

// Middleware pour protéger les routes dépôt (admin OU depot)
function requireDepot(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const role = activeTokens.get(token);
  if (!token || (role !== 'depot' && role !== 'admin')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  next();
}

module.exports = { router, requireAdmin, requireStore, requireDepot };
