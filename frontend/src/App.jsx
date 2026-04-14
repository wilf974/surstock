import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import AdminInsert from './pages/AdminInsert';
import AdminDashboard from './pages/AdminDashboard';
import AdminSettings from './pages/AdminSettings';
import AdminMagasins from './pages/AdminMagasins';
import AdminLogin from './pages/AdminLogin';
import StoreList from './pages/StoreList';
import DepotList from './pages/DepotList';
import { api } from './api';

function App() {
  const [authRole, setAuthRole] = useState(null);
  const [magasinId, setMagasinId] = useState(null);
  const [checking, setChecking] = useState(true);

  const checkAuth = async () => {
    const token = sessionStorage.getItem('auth_token');
    if (!token) {
      setAuthRole(null);
      setChecking(false);
      return;
    }
    try {
      const { role, magasinId: mId } = await api.checkAuth();
      setAuthRole(role);
      setMagasinId(mId || null);
    } catch {
      sessionStorage.removeItem('auth_token');
      sessionStorage.removeItem('auth_role');
      setAuthRole(null);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { checkAuth(); }, []);

  const handleLogin = (role, mId) => { setAuthRole(role); setMagasinId(mId || null); };

  const handleLogout = async () => {
    try { await api.logout(); } catch {}
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_role');
    setAuthRole(null);
    setMagasinId(null);
  };

  const isAdmin = authRole === 'admin';
  const isStore = authRole === 'store' || authRole === 'admin';
  const isDepot = authRole === 'depot' || authRole === 'admin';

  return (
    <div className="app">
      <Navbar isAdmin={isAdmin} isStore={isStore} isDepot={isDepot} onLogout={handleLogout} />
      <main className="main-content">
        {checking ? (
          <p className="loading-text">Chargement...</p>
        ) : (
          <Routes>
            <Route path="/" element={<Navigate to="/magasin/liste" replace />} />
            <Route path="/admin/saisie" element={
              isAdmin ? <AdminInsert /> : <AdminLogin onLogin={handleLogin} role="admin" />
            } />
            <Route path="/admin/tableau-de-bord" element={
              isAdmin ? <AdminDashboard /> : <AdminLogin onLogin={handleLogin} role="admin" />
            } />
            <Route path="/admin/reglages" element={
              isAdmin ? <AdminSettings /> : <AdminLogin onLogin={handleLogin} role="admin" />
            } />
            <Route path="/admin/magasins" element={
              isAdmin ? <AdminMagasins /> : <AdminLogin onLogin={handleLogin} role="admin" />
            } />
            <Route path="/magasin/liste" element={
              isStore ? <StoreList magasinId={magasinId} /> : <AdminLogin onLogin={handleLogin} role="store" />
            } />
            <Route path="/magasin/scanner" element={<Navigate to="/magasin/liste" replace />} />
            <Route path="/depot/liste" element={
              isDepot ? <DepotList /> : <AdminLogin onLogin={handleLogin} role="depot" />
            } />
          </Routes>
        )}
      </main>
    </div>
  );
}

export default App;
