import { useState, useEffect } from 'react';
import { api } from '../api';
import * as XLSX from 'xlsx';

function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

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

  useEffect(() => { loadSummary(); }, []);

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
    for (let i = 0; i < data.length; i++) {
      const cell = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];
      if (cell) { cell.t = 's'; cell.v = String(data[i][0]); }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Export');
    XLSX.writeFile(wb, 'export_parkod_quantite.xlsx');
  };

  const handleResetReceipt = async (product) => {
    if (!window.confirm(`Annuler la réception de "${product.label}" ?`)) return;
    try {
      await api.resetReceipt(product.id);
      setMessage({ text: `Réception de ${product.label} annulée`, type: 'success' });
      setTimeout(() => setMessage(null), 3000);
      loadSummary();
    } catch (err) {
      setMessage({ text: 'Erreur lors de l\'annulation', type: 'error' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleReset = async (product) => {
    if (!window.confirm(`Remettre "${product.label}" en attente ?`)) return;
    try {
      await api.resetScan(product.id);
      setMessage({ text: `${product.label} remis en attente`, type: 'success' });
      setTimeout(() => setMessage(null), 3000);
      loadSummary();
    } catch (err) {
      setMessage({ text: 'Erreur lors de l\'annulation', type: 'error' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  // Logique couleur de ligne combinant magasin + dépôt
  const getRowClass = (p) => {
    // Pas encore envoyé par le magasin
    if (p.qty_sent === null) return 'row-status-pending';
    // Réceptionné par le dépôt avec quantités OK partout
    if (p.qty_received !== null && p.qty_received >= p.qty_sent) {
      if (p.qty_received === p.qty_sent && p.diff === 0) return 'row-status-complete';
      return 'row-status-depot-discrepancy';
    }
    // Envoyé mais pas encore réceptionné
    if (p.qty_received === null || p.qty_received < p.qty_sent) {
      if (p.diff !== 0) return 'row-status-store-discrepancy';
      return 'row-status-sent';
    }
    return '';
  };

  // Tooltip détaillé pour les écarts
  const getTooltip = (p) => {
    const parts = [];
    if (p.qty_sent !== null && p.diff !== 0) {
      parts.push(`Magasin: envoyé ${p.qty_sent} / demandé ${p.qty_requested} (écart ${p.diff > 0 ? '+' : ''}${p.diff})`);
    }
    if (p.qty_received !== null && p.qty_sent !== null && p.qty_received !== p.qty_sent) {
      parts.push(`Dépôt: reçu ${p.qty_received} / envoyé ${p.qty_sent} (écart ${p.qty_received - p.qty_sent > 0 ? '+' : ''}${p.qty_received - p.qty_sent})`);
    }
    if (p.qty_received !== null && p.qty_received < p.qty_sent) {
      parts.push(`Réception en cours: ${p.qty_received}/${p.qty_sent}`);
    }
    return parts.join('\n');
  };

  const getDiffText = (p) => {
    if (p.qty_sent === null) return '—';
    if (p.diff === 0) return 'OK';
    return p.diff > 0 ? `+${p.diff}` : Math.abs(p.diff);
  };

  const getDepotStatus = (p) => {
    if (p.qty_sent === null) return { text: '—', cls: '' };
    if (p.qty_received === null) return { text: 'Non reçu', cls: 'depot-none' };
    if (p.qty_received < p.qty_sent) return { text: `${p.qty_received}/${p.qty_sent}`, cls: 'depot-partial' };
    if (p.qty_received === p.qty_sent) return { text: 'OK', cls: 'depot-ok' };
    return { text: `${p.qty_received}/${p.qty_sent}`, cls: 'depot-over' };
  };

  // Compteurs
  const depotDiscrepancy = filteredProducts.filter(p =>
    p.qty_received !== null && p.qty_sent !== null && p.qty_received !== p.qty_sent
  ).length;

  return (
    <div className="page admin-dashboard">
      <h1 className="page-title">Tableau de bord</h1>

      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-number">{summary.total}</div>
          <div className="summary-label">Total produits</div>
        </div>
        <div className="summary-card card-success">
          <div className="summary-number">{summary.confirmed}</div>
          <div className="summary-label">Envoyés</div>
        </div>
        <div className="summary-card card-warning">
          <div className="summary-number">{summary.pending}</div>
          <div className="summary-label">En attente</div>
        </div>
        <div className="summary-card card-danger">
          <div className="summary-number">{summary.withDifference}</div>
          <div className="summary-label">Écart magasin</div>
        </div>
        <div className="summary-card card-info">
          <div className="summary-number">{summary.received || 0}</div>
          <div className="summary-label">Réceptionnés</div>
        </div>
        {depotDiscrepancy > 0 && (
          <div className="summary-card card-danger">
            <div className="summary-number">{depotDiscrepancy}</div>
            <div className="summary-label">Écart dépôt</div>
          </div>
        )}
      </div>

      <div className="totals-bar">
        <span>Demandé : <strong>{summary.totalRequested}</strong></span>
        <span>Envoyé : <strong>{summary.totalSent}</strong></span>
        <span>Reçu : <strong>{summary.totalReceived || 0}</strong></span>
        <span>Écart global : <strong className={summary.totalSent - summary.totalRequested < 0 ? 'text-danger' : 'text-success'}>
          {summary.totalSent - summary.totalRequested}
        </strong></span>
      </div>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <div className="filter-bar">
        <input type="text" placeholder="Rechercher par EAN, PARKOD ou libellé..."
          value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
        <button className="btn btn-secondary" onClick={loadSummary}>Actualiser</button>
        <button className="btn btn-success" onClick={exportXlsx}>Export XLSX</button>
      </div>

      {/* Légende */}
      <div className="legend-bar">
        <span className="legend-item"><span className="legend-dot legend-complete"></span> Tout OK</span>
        <span className="legend-item"><span className="legend-dot legend-sent"></span> Envoyé (attente dépôt)</span>
        <span className="legend-item"><span className="legend-dot legend-warning"></span> Écart détecté</span>
        <span className="legend-item"><span className="legend-dot legend-pending"></span> En attente</span>
      </div>

      {/* Tableau desktop */}
      <table className="table">
        <thead>
          <tr>
            <th>EAN</th>
            <th>PARKOD</th>
            <th>Libellé</th>
            <th>Demandée</th>
            <th>Envoyée</th>
            <th>Écart mag.</th>
            <th>Reçue</th>
            <th>Statut dépôt</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredProducts.map((p) => {
            const tooltip = getTooltip(p);
            const depot = getDepotStatus(p);
            return (
              <tr key={p.id} className={getRowClass(p)} title={tooltip}>
                <td className="ean-cell">{p.ean}</td>
                <td className="ean-cell">{p.parkod || '—'}</td>
                <td>{p.label}</td>
                <td className="qty-cell">{p.qty_requested}</td>
                <td className="qty-cell">{p.qty_sent !== null ? p.qty_sent : '—'}</td>
                <td className="qty-cell diff-cell"><strong>{getDiffText(p)}</strong></td>
                <td className="qty-cell">{p.qty_received !== null ? p.qty_received : '—'}</td>
                <td className={`qty-cell ${depot.cls}`}><strong>{depot.text}</strong></td>
                <td>
                  {p.qty_sent !== null && p.qty_received === null && (
                    <button className="btn btn-secondary btn-small" onClick={() => handleReset(p)}>Annuler envoi</button>
                  )}
                  {p.qty_received !== null && (
                    <button className="btn btn-secondary btn-small" onClick={() => handleResetReceipt(p)}>Annuler réception</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Cards mobile */}
      <div className="card-list">
        {filteredProducts.map((p) => {
          const depot = getDepotStatus(p);
          const tooltip = getTooltip(p);
          return (
            <div key={p.id} className={`product-card-item ${getRowClass(p)}`} title={tooltip}>
              <div className="card-item-header">
                <span className="card-item-label">{p.label}</span>
                <strong className={depot.cls} style={{ fontSize: 13 }}>{depot.text}</strong>
              </div>
              <div className="card-item-codes">
                EAN: {p.ean}{p.parkod ? ` · PARKOD: ${p.parkod}` : ''}
              </div>
              <div className="card-item-row">
                <span className="card-item-field">Demandée</span>
                <span className="card-item-value">{p.qty_requested}</span>
              </div>
              <div className="card-item-row">
                <span className="card-item-field">Envoyée</span>
                <span className="card-item-value">{p.qty_sent !== null ? p.qty_sent : '—'}</span>
              </div>
              <div className="card-item-row">
                <span className="card-item-field">Reçue dépôt</span>
                <span className="card-item-value">{p.qty_received !== null ? p.qty_received : '—'}</span>
              </div>
              {tooltip && (
                <div className="card-item-detail">{tooltip}</div>
              )}
              {p.qty_sent !== null && p.qty_received === null && (
                <div className="card-item-actions">
                  <button className="btn btn-secondary btn-small" onClick={() => handleReset(p)} style={{ width: '100%' }}>Annuler envoi</button>
                </div>
              )}
              {p.qty_received !== null && (
                <div className="card-item-actions">
                  <button className="btn btn-secondary btn-small" onClick={() => handleResetReceipt(p)} style={{ width: '100%' }}>Annuler réception</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AdminDashboard;
