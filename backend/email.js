const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { queryAll } = require('./db');

const SETTINGS_SECRET = process.env.SETTINGS_SECRET || '';

function encrypt(text) {
  if (!SETTINGS_SECRET || SETTINGS_SECRET.length < 16) return text;
  const key = crypto.createHash('sha256').update(SETTINGS_SECRET).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + encrypted + ':' + tag;
}

function decrypt(data) {
  if (!SETTINGS_SECRET || SETTINGS_SECRET.length < 16) return data;
  try {
    const parts = data.split(':');
    if (parts.length !== 3) return data;
    const key = crypto.createHash('sha256').update(SETTINGS_SECRET).digest();
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const tag = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return data;
  }
}

function getSmtpSettings() {
  const rows = queryAll('SELECT key, value FROM settings WHERE key LIKE ?', ['smtp_%']);
  const settings = {};
  for (const row of rows) {
    const k = row.key.replace('smtp_', '');
    settings[k] = k === 'password' ? decrypt(row.value) : row.value;
  }
  return settings;
}

async function sendDepotNotification(product) {
  try {
    const smtp = getSmtpSettings();
    if (!smtp.host || !smtp.user || !smtp.password || !smtp.to) return;

    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: parseInt(smtp.port) || 587,
      secure: false,
      auth: { user: smtp.user, pass: smtp.password },
      tls: { ciphers: 'SSLv3', rejectUnauthorized: false }
    });

    const hasDiscrepancy = product.qty_received !== product.qty_sent;
    const subject = hasDiscrepancy
      ? `⚠️ Surstock — ÉCART réception : ${product.label}`
      : `✅ Surstock — Réception complète : ${product.label}`;

    await transport.sendMail({
      from: smtp.from || smtp.user,
      to: smtp.to,
      subject,
      html: `
        <h2 style="color:${hasDiscrepancy ? '#d93025' : '#0f9d58'}">
          ${hasDiscrepancy ? 'Écart détecté à la réception' : 'Réception complète'}
        </h2>
        <table style="border-collapse:collapse;font-family:sans-serif;">
          <tr><td style="padding:6px 12px;font-weight:bold;">Produit</td><td style="padding:6px 12px;">${product.label}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;">EAN</td><td style="padding:6px 12px;">${product.ean}</td></tr>
          ${product.parkod ? `<tr><td style="padding:6px 12px;font-weight:bold;">PARKOD</td><td style="padding:6px 12px;">${product.parkod}</td></tr>` : ''}
          <tr><td style="padding:6px 12px;font-weight:bold;">Qté envoyée par magasin</td><td style="padding:6px 12px;">${product.qty_sent}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;${hasDiscrepancy ? 'color:#d93025' : ''}">Qté reçue au dépôt</td><td style="padding:6px 12px;font-weight:bold;${hasDiscrepancy ? 'color:#d93025' : ''}">${product.qty_received}</td></tr>
          ${hasDiscrepancy ? `<tr><td style="padding:6px 12px;font-weight:bold;color:#d93025;">Écart</td><td style="padding:6px 12px;font-weight:bold;color:#d93025;">${product.qty_received - product.qty_sent}</td></tr>` : ''}
        </table>
      `
    });
  } catch (err) {
    console.error('Email notification failed:', err.message);
  }
}

async function sendTestEmail() {
  const smtp = getSmtpSettings();
  if (!smtp.host || !smtp.user || !smtp.password || !smtp.to) {
    throw new Error('Configuration SMTP incomplète');
  }

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: parseInt(smtp.port) || 587,
    secure: false,
    auth: { user: smtp.user, pass: smtp.password },
    tls: { ciphers: 'SSLv3', rejectUnauthorized: false }
  });

  await transport.sendMail({
    from: smtp.from || smtp.user,
    to: smtp.to,
    subject: 'Surstock — Email de test',
    html: '<h2>Configuration SMTP OK</h2><p>Cet email confirme que la configuration SMTP de Surstock fonctionne correctement.</p>'
  });
}

module.exports = { encrypt, decrypt, getSmtpSettings, sendDepotNotification, sendTestEmail };
