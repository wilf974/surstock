const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { getDb } = require('./db');

const productsRoutes = require('./routes/products');
const scanRoutes = require('./routes/scan');
const dashboardRoutes = require('./routes/dashboard');
const { router: authRoutes, requireAdmin, requireStore } = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Sécurité : headers HTTP
app.use(helmet({
  contentSecurityPolicy: false // désactivé pour ne pas bloquer le frontend SPA
}));

// CORS : uniquement le domaine autorisé
const allowedOrigins = [
  'https://sur-stock.myorigines.tech',
  'http://localhost:5173'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS non autorisé'));
    }
  }
}));

// Rate limiting sur le login (anti brute force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 tentatives par IP
  message: { error: 'Trop de tentatives, réessayez dans 15 minutes' }
});

app.use(express.json({ limit: '10mb' }));

// Servir le frontend en production
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Routes API
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
// Products : GET protégé store, POST/DELETE protégés admin
app.use('/api/products', (req, res, next) => {
  if (req.method === 'GET') return requireStore(req, res, next);
  requireAdmin(req, res, next);
}, productsRoutes);
app.use('/api/scan/:id/reset', requireAdmin);
app.use('/api/scan', requireStore, scanRoutes);
app.use('/api/dashboard', requireAdmin, dashboardRoutes);

// Fallback vers le frontend pour les routes SPA
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  }
});

// Initialiser la DB puis démarrer le serveur
getDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Serveur Surstock démarré sur http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Erreur initialisation base de données:', err);
  process.exit(1);
});
