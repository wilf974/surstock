import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import NotificationBell from './NotificationBell';

function Navbar({ isAdmin, isStore, isDepot, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="navbar-brand">
          <span className="navbar-logo">SURSTOCK</span>
          <span className="navbar-divider">/</span>
          <span className="navbar-subtitle">Maison Blanche</span>
        </div>

        <button
          className={`hamburger ${menuOpen ? 'is-active' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menu"
        >
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>

        <div className={`navbar-menu ${menuOpen ? 'is-open' : ''}`}>
          <div className="nav-section">
            <span className="nav-section-label">Magasin</span>
            <NavLink to="/magasin/liste" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={closeMenu}>
              Liste & Scanner
            </NavLink>
          </div>
          <div className="nav-section">
            <span className="nav-section-label">Dépôt</span>
            <NavLink to="/depot/liste" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={closeMenu}>
              Réception
            </NavLink>
          </div>
          <div className="nav-section">
            <span className="nav-section-label">Admin</span>
            <NavLink to="/admin/saisie" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={closeMenu}>
              Saisie
            </NavLink>
            <NavLink to="/admin/tableau-de-bord" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={closeMenu}>
              Tableau de bord
            </NavLink>
            <NavLink to="/admin/reglages" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={closeMenu}>
              Réglages
            </NavLink>
            <NavLink to="/admin/magasins" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={closeMenu}>
              Magasins
            </NavLink>
          </div>
          {isAdmin && (
            <div className="nav-notif-section">
              <NotificationBell />
            </div>
          )}
          {(isAdmin || isStore || isDepot) && (
            <button className="nav-logout" onClick={() => { onLogout(); closeMenu(); }}>
              Déconnexion
            </button>
          )}
        </div>
      </div>

      {menuOpen && <div className="navbar-backdrop" onClick={closeMenu}></div>}
    </nav>
  );
}

export default Navbar;
