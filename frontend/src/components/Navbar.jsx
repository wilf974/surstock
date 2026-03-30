import { NavLink } from 'react-router-dom';

function Navbar({ isAdmin, onLogout }) {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="navbar-logo">SURSTOCK</span>
        <span className="navbar-subtitle">Maison Blanche</span>
      </div>
      <div className="navbar-links">
        <div className="nav-group">
          <span className="nav-group-label">Magasin</span>
          <NavLink to="/magasin/liste" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Liste & Scanner
          </NavLink>
        </div>
        <div className="nav-group">
          <span className="nav-group-label">Administration</span>
          <NavLink to="/admin/saisie" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Saisie
          </NavLink>
          <NavLink to="/admin/tableau-de-bord" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Tableau de bord
          </NavLink>
          {isAdmin && (
            <button className="btn btn-logout" onClick={onLogout}>
              Déconnexion
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
