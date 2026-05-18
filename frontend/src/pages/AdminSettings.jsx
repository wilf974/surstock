import { useState, useEffect } from 'react';
import { api } from '../api';

function AdminSettings() {
  const [smtp, setSmtp] = useState({
    host: 'smtp.office365.com',
    port: '587',
    encryption: 'STARTTLS',
    user: '',
    password: '',
    from: '',
    to: ''
  });
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [zeroCodes, setZeroCodes] = useState([]);
  const [generatingType, setGeneratingType] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => { loadSettings(); loadZeroCodes(); }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getSmtpSettings();
      setSmtp(prev => ({
        host: data.host || prev.host,
        port: data.port || prev.port,
        encryption: data.encryption || prev.encryption,
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

  const loadZeroCodes = async () => {
    try {
      const data = await api.listZeroCodes();
      setZeroCodes(data);
    } catch (err) {
      console.error('Erreur chargement codes:', err);
    }
  };

  const handleGenerate = async (type) => {
    setGeneratingType(type);
    try {
      await api.generateZeroCode(type);
      await loadZeroCodes();
      showMsg('Nouveau code généré');
    } catch (err) {
      showMsg(err.error || 'Erreur lors de la génération', 'error');
    } finally {
      setGeneratingType(null);
    }
  };

  const handleDeleteCode = async (id) => {
    if (!confirm('Supprimer ce code ?')) return;
    try {
      await api.deleteZeroCode(id);
      await loadZeroCodes();
    } catch (err) {
      showMsg(err.error || 'Erreur lors de la suppression', 'error');
    }
  };

  const handleCopyCode = async (id, code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      showMsg('Impossible de copier', 'error');
    }
  };

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
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
          <div className="form-group" style={{ flex: 2 }}>
            <label>Serveur SMTP</label>
            <input type="text" value={smtp.host} onChange={update('host')} placeholder="smtp.office365.com" />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Port</label>
            <input type="number" value={smtp.port} onChange={update('port')} placeholder="587" />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Chiffrement</label>
            <select value={smtp.encryption} onChange={update('encryption')}>
              <option value="STARTTLS">STARTTLS</option>
              <option value="SSL">SSL/TLS</option>
              <option value="NONE">Aucun</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Identifiant SMTP</label>
            <input type="text" value={smtp.user} onChange={update('user')} placeholder="user@myorigines.com" />
          </div>
          <div className="form-group">
            <label>Mot de passe SMTP</label>
            <input type="password" value={smtp.password} onChange={update('password')}
              onFocus={(e) => { if (e.target.value === '****') setSmtp(prev => ({ ...prev, password: '' })); }}
              placeholder="Mot de passe" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Expéditeur (From)</label>
            <input type="email" value={smtp.from} onChange={update('from')} placeholder="surstock@myorigines.com" />
          </div>
          <div className="form-group">
            <label>Destinataire (To)</label>
            <input type="text" value={smtp.to} onChange={update('to')} placeholder="admin@myorigines.com" />
          </div>
        </div>

        <div className="bulk-buttons" style={{ marginTop: 16 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={testing}>
            {testing ? 'Envoi en cours...' : 'Envoyer un email de test'}
          </button>
        </div>
      </form>

      <div className="insert-form" style={{ marginTop: 32 }}>
        <h2 style={{ marginBottom: 16, fontSize: 18 }}>Codes "Valider à 0" (usage unique)</h2>

        {/* Section 1 : codes individuels */}
        <div style={{ paddingBottom: 24, borderBottom: '1px solid #e0e0e0' }}>
          <h3 style={{ marginBottom: 8, fontSize: 16 }}>Codes individuels — 1 code = 1 produit</h3>
          <p style={{ marginBottom: 12, color: '#666', fontSize: 14 }}>
            Pour valider quelques produits sélectionnés à 0. Chaque code valide UN seul produit. Génère autant de codes que de produits à valider.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => handleGenerate('single')} disabled={generatingType === 'single'}>
            {generatingType === 'single' ? 'Génération...' : 'Générer un code individuel'}
          </button>

          <div style={{ marginTop: 16 }}>
            <h4 style={{ marginBottom: 8, fontSize: 14 }}>Codes individuels actifs</h4>
            {zeroCodes.filter(c => !c.used_at && (c.type || 'single') === 'single').length === 0 ? (
              <p style={{ color: '#666', fontSize: 14 }}>Aucun code individuel actif.</p>
            ) : (
              <table className="dashboard-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Généré le</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {zeroCodes.filter(c => !c.used_at && (c.type || 'single') === 'single').map(c => (
                    <tr key={c.id}>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 'bold', letterSpacing: 2 }}>{c.code}</td>
                      <td>{c.created_at}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="btn btn-secondary" style={{ marginRight: 8 }} onClick={() => handleCopyCode(c.id, c.code)}>
                          {copiedId === c.id ? 'Copié !' : 'Copier'}
                        </button>
                        <button type="button" className="btn btn-danger" onClick={() => handleDeleteCode(c.id)}>Supprimer</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Section 2 : codes lot */}
        <div style={{ paddingTop: 24 }}>
          <h3 style={{ marginBottom: 8, fontSize: 16 }}>Codes lot — 1 code = N produits</h3>
          <p style={{ marginBottom: 12, color: '#666', fontSize: 14 }}>
            Pour valider PLUSIEURS produits à 0 en une seule opération (ex: tout valider d'un coup). UN seul code valide tous les produits sélectionnés. Usage unique.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => handleGenerate('bulk')} disabled={generatingType === 'bulk'}>
            {generatingType === 'bulk' ? 'Génération...' : 'Générer un code lot'}
          </button>

          <div style={{ marginTop: 16 }}>
            <h4 style={{ marginBottom: 8, fontSize: 14 }}>Codes lot actifs</h4>
            {zeroCodes.filter(c => !c.used_at && c.type === 'bulk').length === 0 ? (
              <p style={{ color: '#666', fontSize: 14 }}>Aucun code lot actif.</p>
            ) : (
              <table className="dashboard-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Généré le</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {zeroCodes.filter(c => !c.used_at && c.type === 'bulk').map(c => (
                    <tr key={c.id}>
                      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 'bold', letterSpacing: 2 }}>{c.code}</td>
                      <td>{c.created_at}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="btn btn-secondary" style={{ marginRight: 8 }} onClick={() => handleCopyCode(c.id, c.code)}>
                          {copiedId === c.id ? 'Copié !' : 'Copier'}
                        </button>
                        <button type="button" className="btn btn-danger" onClick={() => handleDeleteCode(c.id)}>Supprimer</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {zeroCodes.filter(c => c.used_at).length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3 style={{ marginBottom: 12, fontSize: 16 }}>Historique des codes utilisés</h3>
            <table className="dashboard-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Magasin</th>
                  <th>Produit / Nb</th>
                  <th>Utilisé le</th>
                </tr>
              </thead>
              <tbody>
                {zeroCodes.filter(c => c.used_at).map(c => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', color: '#999' }}>{c.code}</td>
                    <td>{c.type === 'bulk' ? 'Lot' : 'Individuel'}</td>
                    <td>{c.used_by_magasin_name || '—'}</td>
                    <td>{c.type === 'bulk' ? `${c.used_count || 0} produits` : (c.used_for_product_label || '—')}</td>
                    <td>{c.used_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminSettings;
