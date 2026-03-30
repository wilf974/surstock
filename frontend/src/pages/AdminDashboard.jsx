import { useState, useEffect } from 'react';
import { api } from '../api';
import * as XLSX from 'xlsx';

function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const data = await api.getSummary();
      setSummary(data);
    } catch (err) {
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  if (loading || !summary) {
    return <div className="page"><p className="loading-text">Chargement...</p></div>;
  }

  const filteredProducts = summary.products.filter(p =>
    p.ean.toLowerCase().includes(search.toLowerCase()) ||
    (p.parkod && p.parkod.toLowerCase().includes(search.toLowerCase())) ||
    p.label.toLowerCase().includes(search.toLowerCase())
  );

  const exportXlsx = () => {
    const data = filteredProducts
      .filter(p => p.parkod && p.qty_sent !== null)
      .map(p => [p.parkod, Math.abs(p.diff)]);
    const ws = XLSX.utils.aoa_to_sheet(data);
    // Forcer la colonne PARKOD en texte pour éviter la conversion en nombre
    for (let i = 0; i < data.length; i++) {
      const cell = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];
      if (cell) { cell.t = 's'; cell.v = String(data[i][0]); }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Export');
    XLSX.writeFile(wb, 'export_parkod_quantite.xlsx');
  };

  const getDiffClass = (product) => {
    if (product.qty_sent === null) return 'diff-pending';
    if (product.diff === 0) return 'diff-ok';
    if (product.diff < 0) return 'diff-under';
    return 'diff-over';
  };

  const getDiffText = (product) => {
    if (product.qty_sent === null) return '—';
    if (product.diff === 0) return 'OK';
    return product.diff > 0 ? `+${product.diff}` : Math.abs(product.diff);
  };

  return (
    <div className="page admin-dashboard">
      <h1 className="page-title">Tableau de bord</h1>

      {/* Cartes résumé */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-number">{summary.total}</div>
          <div className="summary-label">Total produits</div>
        </div>
        <div className="summary-card card-success">
          <div className="summary-number">{summary.confirmed}</div>
          <div className="summary-label">Confirmés</div>
        </div>
        <div className="summary-card card-warning">
          <div className="summary-number">{summary.pending}</div>
          <div className="summary-label">En attente</div>
        </div>
        <div className="summary-card card-danger">
          <div className="summary-number">{summary.withDifference}</div>
          <div className="summary-label">Avec écart</div>
        </div>
      </div>

      {/* Totaux */}
      <div className="totals-bar">
        <span>Total demandé : <strong>{summary.totalRequested}</strong></span>
        <span>Total envoyé : <strong>{summary.totalSent}</strong></span>
        <span>Différence globale : <strong className={summary.totalSent - summary.totalRequested < 0 ? 'text-danger' : 'text-success'}>
          {summary.totalSent - summary.totalRequested}
        </strong></span>
      </div>

      {/* Barre de recherche + refresh */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Rechercher par EAN ou libellé..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
        <button className="btn btn-secondary" onClick={loadSummary}>
          Actualiser
        </button>
        <button className="btn btn-success" onClick={exportXlsx}>
          Export XLSX
        </button>
      </div>

      {/* Tableau des produits */}
      <table className="table">
        <thead>
          <tr>
            <th>EAN</th>
            <th>PARKOD</th>
            <th>Libellé</th>
            <th>Qté demandée</th>
            <th>Qté envoyée</th>
            <th>Écart</th>
            <th>Scanné le</th>
          </tr>
        </thead>
        <tbody>
          {filteredProducts.map((p) => (
            <tr key={p.id} className={getDiffClass(p)}>
              <td className="ean-cell">{p.ean}</td>
              <td className="ean-cell">{p.parkod || '—'}</td>
              <td>{p.label}</td>
              <td className="qty-cell">{p.qty_requested}</td>
              <td className="qty-cell">{p.qty_sent !== null ? p.qty_sent : '—'}</td>
              <td className="qty-cell diff-cell">
                <strong>{getDiffText(p)}</strong>
              </td>
              <td className="date-cell">
                {p.scanned_at ? new Date(p.scanned_at).toLocaleString('fr-FR') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AdminDashboard;
