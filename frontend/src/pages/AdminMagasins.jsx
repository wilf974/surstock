import { useState, useEffect } from 'react';
import { api } from '../api';

function AdminMagasins() {
  const [magasins, setMagasins] = useState([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMagasins = async () => {
    try {
      const data = await api.getMagasins();
      setMagasins(data);
    } catch (err) {
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMagasins(); }, []);

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const resetForm = () => {
    setName('');
    setCode('');
    setPassword('');
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      showMsg('Le nom et le code sont requis', 'error');
      return;
    }

    try {
      if (editingId) {
        const data = { name: name.trim(), code: code.trim() };
        if (password.trim()) data.password = password.trim();
        await api.updateMagasin(editingId, data);
        showMsg(`Magasin "${name}" mis à jour`);
      } else {
        if (!password.trim()) {
          showMsg('Le mot de passe est requis pour un nouveau magasin', 'error');
          return;
        }
        await api.createMagasin({ name: name.trim(), code: code.trim(), password: password.trim() });
        showMsg(`Magasin "${name}" créé`);
      }
      resetForm();
      loadMagasins();
    } catch (err) {
      showMsg(err.error || 'Erreur lors de l\'opération', 'error');
    }
  };

  const handleEdit = (m) => {
    setEditingId(m.id);
    setName(m.name);
    setCode(m.code);
    setPassword('');
  };

  const handleDelete = async (m) => {
    if (!window.confirm(`Supprimer le magasin "${m.name}" ? Cette action est irréversible.`)) return;
    try {
      await api.deleteMagasin(m.id);
      showMsg(`Magasin "${m.name}" supprimé`);
      loadMagasins();
    } catch (err) {
      showMsg(err.error || 'Erreur lors de la suppression (des produits existent peut-être pour ce magasin)', 'error');
    }
  };

  return (
    <div className="page admin-insert">
      <h1 className="page-title">Gestion des magasins</h1>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <form onSubmit={handleSubmit} className="insert-form">
        <div className="form-row">
          <div className="form-group">
            <label>Nom du magasin</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maison Blanche" />
          </div>
          <div className="form-group">
            <label>Code CMAG</label>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="0002" />
          </div>
          <div className="form-group">
            <label>{editingId ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe'}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={editingId ? 'Laisser vide pour ne pas changer' : 'Mot de passe du magasin'} />
          </div>
          <button type="submit" className="btn btn-primary">
            {editingId ? 'Mettre à jour' : 'Ajouter'}
          </button>
          {editingId && (
            <button type="button" className="btn btn-secondary" onClick={resetForm}>Annuler</button>
          )}
        </div>
      </form>

      <div className="products-section">
        <div className="section-header">
          <h2>Magasins ({magasins.length})</h2>
        </div>

        {loading ? (
          <p className="loading-text">Chargement...</p>
        ) : magasins.length === 0 ? (
          <p className="empty-text">Aucun magasin enregistré</p>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Code CMAG</th>
                  <th>Date de création</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {magasins.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td className="ean-cell">{m.code}</td>
                    <td>{m.created_at ? new Date(m.created_at).toLocaleDateString('fr-FR') : '—'}</td>
                    <td>
                      <button className="btn btn-secondary btn-small" onClick={() => handleEdit(m)} style={{ marginRight: 8 }}>Modifier</button>
                      <button className="btn btn-danger btn-small" onClick={() => handleDelete(m)}>Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Cards mobile */}
            <div className="card-list">
              {magasins.map((m) => (
                <div key={m.id} className="product-card-item">
                  <div className="card-item-header">
                    <span className="card-item-label">{m.name}</span>
                    <span className="badge badge-pending">{m.code}</span>
                  </div>
                  <div className="card-item-row">
                    <span className="card-item-field">Date de création</span>
                    <span className="card-item-value">{m.created_at ? new Date(m.created_at).toLocaleDateString('fr-FR') : '—'}</span>
                  </div>
                  <div className="card-item-actions">
                    <button className="btn btn-secondary btn-small" onClick={() => handleEdit(m)} style={{ width: '48%' }}>Modifier</button>
                    <button className="btn btn-danger btn-small" onClick={() => handleDelete(m)} style={{ width: '48%' }}>Supprimer</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminMagasins;
