import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import AdminInsert from './pages/AdminInsert';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import StoreList from './pages/StoreList';
import { api } from './api';

function AdminRoute({ children, isAdmin, onLogin }) {
  if (!isAdmin) {
    return <AdminLogin onLogin={onLogin} />;
  }
  return children;
}

function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  const checkAuth = async () => {
    const token = sessionStorage.getItem('admin_token');
    if (!token) {
      setIsAdmin(false);
      setChecking(false);
      return;
    }
    try {
      await api.checkAuth();
      setIsAdmin(true);
    } catch {
      sessionStorage.removeItem('admin_token');
      setIsAdmin(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleLogin = () => {
    setIsAdmin(true);
  };

  const handleLogout = async () => {
    try { await api.logout(); } catch {}
    sessionStorage.removeItem('admin_token');
    setIsAdmin(false);
  };

  return (
    <div className="app">
      <Navbar isAdmin={isAdmin} onLogout={handleLogout} />
      <main className="main-content">
        {checking ? (
          <p className="loading-text">Chargement...</p>
        ) : (
          <Routes>
            <Route path="/" element={<Navigate to="/magasin/liste" replace />} />
            <Route path="/admin/saisie" element={
              <AdminRoute isAdmin={isAdmin} onLogin={handleLogin}>
                <AdminInsert />
              </AdminRoute>
            } />
            <Route path="/admin/tableau-de-bord" element={
              <AdminRoute isAdmin={isAdmin} onLogin={handleLogin}>
                <AdminDashboard />
              </AdminRoute>
            } />
            <Route path="/magasin/liste" element={<StoreList />} />
            <Route path="/magasin/scanner" element={<Navigate to="/magasin/liste" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

export default App;
