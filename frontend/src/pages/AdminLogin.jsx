import { useState } from 'react';
import { api } from '../api';

function AdminLogin({ onLogin, role = 'admin' }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isStore = role === 'store';
  const isDepot = role === 'depot';
  const title = isStore ? 'Maison Blanche' : isDepot ? 'Dépôt' : 'Administration';
  const placeholder = isStore ? 'Entrez le mot de passe magasin' : isDepot ? 'Entrez le mot de passe dépôt' : 'Entrez le mot de passe admin';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError('');

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const { token, magasinId } = await api.login(hashHex, role);
      sessionStorage.setItem('auth_token', token);
      sessionStorage.setItem('auth_role', role);
      onLogin(role, magasinId);
    } catch (err) {
      setError('Mot de passe incorrect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page admin-login">
      <div className="login-card">
        <div className="login-header">{title}</div>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group">
            <label>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={placeholder}
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary btn-large login-btn" disabled={loading || !password}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminLogin;
