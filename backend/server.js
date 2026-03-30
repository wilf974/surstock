const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db');

const productsRoutes = require('./routes/products');
const scanRoutes = require('./routes/scan');
const dashboardRoutes = require('./routes/dashboard');
const { router: authRoutes, requireAdmin } = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Servir le frontend en production
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Routes API
app.use('/api/auth', authRoutes);
// Products : GET public (magasin), POST/DELETE protégés (admin)
app.use('/api/products', (req, res, next) => {
  if (req.method === 'GET') return next();
  requireAdmin(req, res, next);
}, productsRoutes);
app.use('/api/scan', scanRoutes);
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
