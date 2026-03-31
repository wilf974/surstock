const express = require('express');
const router = express.Router();
const { queryAll, run } = require('../db');
const { encrypt, sendTestEmail } = require('../email');

// GET /api/settings/smtp — Retourner la config SMTP (mot de passe masqué)
router.get('/smtp', (req, res) => {
  const rows = queryAll('SELECT key, value FROM settings WHERE key LIKE ?', ['smtp_%']);
  const settings = {};
  for (const row of rows) {
    const k = row.key.replace('smtp_', '');
    settings[k] = k === 'password' ? '****' : row.value;
  }
  res.json(settings);
});

// PUT /api/settings/smtp — Sauvegarder la config SMTP
router.put('/smtp', (req, res) => {
  const { host, port, encryption, user, password, from, to } = req.body;

  const fields = { host, port: String(port || '587'), encryption: encryption || 'STARTTLS', user, from, to };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) {
      run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [`smtp_${k}`, v]);
    }
  }

  // Ne mettre à jour le mot de passe que s'il a changé
  if (password && password !== '****') {
    run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['smtp_password', encrypt(password)]);
  }

  res.json({ success: true });
});

// POST /api/settings/smtp/test — Envoyer un email de test
router.post('/smtp/test', async (req, res) => {
  try {
    await sendTestEmail();
    res.json({ success: true, message: 'Email de test envoyé avec succès' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur lors de l\'envoi' });
  }
});

module.exports = router;
