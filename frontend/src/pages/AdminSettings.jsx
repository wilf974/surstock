import { useState, useEffect } from 'react';
import { api } from '../api';

function AdminSettings() {
  const [smtp, setSmtp] = useState({ host: 'smtp.office365.com', port: '587', user: '', password: '', from: '', to: '' });
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getSmtpSettings();
      setSmtp(prev => ({
        host: data.host || prev.host,
        port: data.port || prev.port,
        user: data.user || '',
        password: data.password === '****' ? '****' : '',
        from: data.from || '',
        to: data.to || ''
      }));
    } catch (err) {
      console.error('Erreur chargement settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.saveSmtpSettings(smtp);
      showMsg('Configuration SMTP sauvegardée');
    } catch (err) {
      showMsg('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await api.testSmtp();
      showMsg('Email de test envoyé avec succès');
    } catch (err) {
      showMsg(err.error || 'Erreur lors de l\'envoi du test', 'error');
    } finally {
      setTesting(false);
    }
  };

  const update = (field) => (e) => setSmtp(prev => ({ ...prev, [field]: e.target.value }));

  if (loading) {
    return <div className="page"><p className="loading-text">Chargement...</p></div>;
  }

  return (
    <div className="page admin-settings">
      <h1 className="page-title">Réglages</h1>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <form onSubmit={handleSave} className="insert-form">
        <h2 style={{ marginBottom: 16, fontSize: 18 }}>Configuration SMTP (notifications email)</h2>

        <div className="form-row">
          <div className="form-group">
            <label>Serveur SMTP</label>
            <input type="text" value={smtp.host} onChange={update('host')} placeholder="smtp.office365.com" />
          </div>
          <div className="form-group">
            <label>Port</label>
            <input type="text" value={smtp.port} onChange={update('port')} placeholder="587" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Utilisateur</label>
            <input type="email" value={smtp.user} onChange={update('user')} placeholder="user@myorigines.com" />
          </div>
          <div className="form-group">
            <label>Mot de passe</label>
            <input type="password" value={smtp.password} onChange={update('password')} placeholder="Mot de passe SMTP" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Expéditeur (From)</label>
            <input type="email" value={smtp.from} onChange={update('from')} placeholder="surstock@myorigines.com" />
          </div>
          <div className="form-group">
            <label>Destinataire (To)</label>
            <input type="email" value={smtp.to} onChange={update('to')} placeholder="admin@myorigines.com" />
          </div>
        </div>

        <div className="bulk-buttons" style={{ marginTop: 16 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={testing}>
            {testing ? 'Envoi...' : 'Envoyer un email de test'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AdminSettings;
