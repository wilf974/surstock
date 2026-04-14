const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { queryAll } = require('../db');

// Hash SHA-256 des mots de passe (via variables d'environnement)
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 'not_set';
const DEPOT_PASSWORD_HASH = process.env.DEPOT_PASSWORD_HASH || 'not_set';

// Tokens actifs en mémoire : token -> { role, magasinId }
const activeTokens = new Map();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { password, role } = req.body;

  if (role === 'store') {
    // Login magasin : chercher le magasin dont le hash correspond
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const magasins = queryAll('SELECT id, name, code, store_password_hash FROM magasins');
    const found = magasins.find(m => m.store_password_hash === hash);

    if (!found) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    activeTokens.set(token, { role: 'store', magasinId: found.id });
    return res.json({ token, role: 'store', magasinId: found.id, magasinName: found.name });

  } else if (role === 'depot') {
    if (password !== DEPOT_PASSWORD_HASH) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    activeTokens.set(token, { role: 'depot', magasinId: null });
    return res.json({ token, role: 'depot' });

  } else {
    // admin
    if (password !== ADMIN_PASSWORD_HASH) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    activeTokens.set(token, { role: 'admin', magasinId: null });
    return res.json({ token, role: 'admin' });
  }
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
    const { role, magasinId } = activeTokens.get(token);
    return res.json({ authenticated: true, role, magasinId });
  }
  res.status(401).json({ authenticated: false });
});

// Helper : extraire le rôle du token
function getRole(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !activeTokens.has(token)) return null;
  return activeTokens.get(token).role;
}

// Helper : extraire le magasinId du token
function getMagasinId(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !activeTokens.has(token)) return null;
  return activeTokens.get(token).magasinId;
}

// Middleware pour protéger les routes admin
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const entry = token ? activeTokens.get(token) : null;
  if (!entry || entry.role !== 'admin') {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  next();
}

// Middleware pour protéger les routes magasin (admin OU store)
function requireStore(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const entry = token ? activeTokens.get(token) : null;
  if (!entry || entry.role === 'depot') {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  next();
}

// Middleware pour protéger les routes dépôt (admin OU depot)
function requireDepot(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const entry = token ? activeTokens.get(token) : null;
  if (!entry || (entry.role !== 'depot' && entry.role !== 'admin')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  next();
}

// Middleware pour protéger les routes accessibles à tous les rôles authentifiés
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  next();
}

// Vérifier si un token est valide (pour SSE)
function checkToken(token) {
  return activeTokens.has(token);
}

module.exports = { router, requireAdmin, requireStore, requireDepot, requireAuth, checkToken, getMagasinId, getRole };
