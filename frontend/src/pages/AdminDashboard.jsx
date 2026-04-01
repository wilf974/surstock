import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import * as XLSX from 'xlsx';
import { useLiveUpdates } from '../hooks/useLiveUpdates';

function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [showTransfert, setShowTransfert] = useState(false);
  const [transfertParams, setTransfertParams] = useState({
    codeDu: '0002', codeAu: '0000', intitule: 'ST.MB', sequence: '01'
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [dateFilter, setDateFilter] = useState('');
  const [exportFilter, setExportFilter] = useState('all');
  const [depotFilter, setDepotFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [refXlsx, setRefXlsx] = useState(null); // Map parkod → stkperm from reference XLSX
  const refFileRef = useRef(null);

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

  useLiveUpdates(() => { loadSummary(); });

  if (loading || !summary) {
    return <div className="page"><p className="loading-text">Chargement...</p></div>;
  }

  const brands = [...new Set(summary.products.map(p => {
    const parts = p.label.split(' - ');
    return parts.length >= 2 ? parts[1].trim() : parts[0].trim();
  }).filter(Boolean))].sort();

  // Logique couleur de ligne combinant magasin + dépôt
  const getRowClass = (p) => {
    if (p.qty_sent === null) return 'row-status-pending';
    if (p.qty_received !== null && p.qty_received >= p.qty_sent) {
      if (p.qty_received === p.qty_sent && p.diff === 0) return 'row-status-complete';
      return 'row-status-depot-discrepancy';
    }
    if (p.qty_received === null || p.qty_received < p.qty_sent) {
      if (p.diff !== 0) return 'row-status-store-discrepancy';
      return 'row-status-sent';
    }
    return '';
  };

  const filteredProducts = summary.products.filter(p => {
    const matchSearch = !search ||
      p.ean.toLowerCase().includes(search.toLowerCase()) ||
      (p.parkod && p.parkod.toLowerCase().includes(search.toLowerCase())) ||
      p.label.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (brandFilter) {
      const parts = p.label.split(' - ');
      const name = parts.length >= 2 ? parts[1].trim() : parts[0].trim();
      if (name !== brandFilter) return false;
    }
    if (dateFilter) {
      const pDate = p.received_at || p.scanned_at;
      if (!pDate || !pDate.startsWith(dateFilter)) return false;
    }
    if (exportFilter === 'exported' && !p.exported_at) return false;
    if (exportFilter === 'not_exported' && p.exported_at) return false;
    if (depotFilter === 'received' && (p.qty_received === null || p.qty_received < p.qty_sent)) return false;
    if (depotFilter === 'partial' && !(p.qty_sent !== null && (p.qty_received === null || p.qty_received < p.qty_sent))) return false;
    if (depotFilter === 'not_received' && !(p.qty_sent !== null && (p.qty_received === null || p.qty_received === 0))) return false;
    if (depotFilter === 'discrepancy' && !(p.qty_received !== null && p.qty_received >= p.qty_sent && p.qty_received !== p.qty_sent)) return false;
    if (statusFilter !== 'all') {
      const rc = getRowClass(p);
      if (statusFilter === 'complete' && rc !== 'row-status-complete') return false;
      if (statusFilter === 'sent' && rc !== 'row-status-sent') return false;
      if (statusFilter === 'pending' && rc !== 'row-status-pending') return false;
      if (statusFilter === 'store_disc' && rc !== 'row-status-store-discrepancy') return false;
      if (statusFilter === 'depot_disc' && rc !== 'row-status-depot-discrepancy') return false;
    }
    return true;
  });

  const handleRefXlsx = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

    // Colonne G (index 6) = PARKOD 8 chars, Colonne AN (index 39) = STKPERM
    const map = new Map();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[6]) continue;
      const parkod = String(row[6]).trim();
      const stkperm = parseInt(row[39]) || 0;
      map.set(parkod, stkperm);
    }
    setRefXlsx(map);
    setMessage({ text: `Référence chargée : ${map.size} articles`, type: 'success' });
    setTimeout(() => setMessage(null), 3000);
    refFileRef.current.value = '';
  };

  const exportSql = () => {
    const lines = ['# Requêtes STKPERM — Surstock', ''];
    for (const p of filteredProducts) {
      if (!p.parkod || p.qty_sent === null) continue;
      const cmarq = p.parkod.substring(0, 3);
      const ccateg = p.parkod.substring(3, 5);
      const cprod = p.parkod.substring(5, 8);

      let stkperm;
      if (refXlsx && refXlsx.has(p.parkod)) {
        const refValue = refXlsx.get(p.parkod);
        // Si la ref XLSX a un STKPERM > 0, on prend cette valeur
        // Sinon on calcule la différence (ce que le magasin a gardé)
        stkperm = refValue > 0 ? refValue : Math.max(0, p.qty_requested - p.qty_sent);
      } else {
        stkperm = Math.max(0, p.qty_requested - p.qty_sent);
      }

      lines.push(`UPDATE ARTMAG SET STKPERM = ${stkperm} WHERE CMAG = '0002' AND CMARQ = '${cmarq}' AND CCATEG = '${ccateg}' AND CPROD = '${cprod}';`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stkperm_update.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const markFilteredAsExported = async () => {
    const ids = filteredProducts.filter(p => p.qty_received !== null && !p.exported_at).map(p => p.id);
    if (ids.length === 0) { setMessage({ text: 'Aucun produit à marquer', type: 'warning' }); setTimeout(() => setMessage(null), 3000); return; }
    if (!window.confirm(`Marquer ${ids.length} produit(s) comme traité(s) ?`)) return;
    try {
      await api.markExported(ids);
      setMessage({ text: `${ids.length} produit(s) marqué(s) comme traités`, type: 'success' });
      setTimeout(() => setMessage(null), 3000);
      loadSummary();
    } catch { setMessage({ text: 'Erreur', type: 'error' }); setTimeout(() => setMessage(null), 3000); }
  };

  const unmarkFilteredAsExported = async () => {
    const ids = filteredProducts.filter(p => p.exported_at).map(p => p.id);
    if (ids.length === 0) return;
    if (!window.confirm(`Remettre ${ids.length} produit(s) comme non traité(s) ?`)) return;
    try {
      await api.markUnexported(ids);
      setMessage({ text: `${ids.length} produit(s) remis comme non traités`, type: 'success' });
      setTimeout(() => setMessage(null), 3000);
      loadSummary();
    } catch { setMessage({ text: 'Erreur', type: 'error' }); setTimeout(() => setMessage(null), 3000); }
  };

  const generateTransfert = () => {
    const { codeDu, codeAu, intitule, sequence } = transfertParams;
    const du2 = codeDu.slice(-2);
    const au2 = codeAu.slice(-2);
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const yyyy = String(now.getFullYear());
    const dateFile = `${dd}${mm}${yy}`;
    const dateLine = `${yyyy}${mm}${dd}`;
    const seq = sequence.padStart(2, '0');

    const lines = [];
    for (const p of filteredProducts) {
      if (!p.parkod || p.qty_sent === null || p.qty_sent === 0) continue;
      const qty = p.qty_sent;
      let espace;
      if (qty < 10) espace = '   ';
      else if (qty < 100) espace = '  ';
      else espace = '';
      lines.push(`TT${du2}${au2}${p.parkod}${espace}${qty}  ;${dateLine};1600;${intitule};;${codeDu};${codeAu}`);
    }

    const filename = `V${dateFile}${seq}.000393`;
    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setShowTransfert(false);
  };

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

      {/* Modale paramètres transfert */}
      {showTransfert && (
        <div className="scan-modal-overlay" onClick={() => setShowTransfert(false)}>
          <div className="scan-modal" onClick={(e) => e.stopPropagation()}>
            <div className="scan-modal-header">Générer fichier de transfert</div>
            <div className="scan-modal-body">
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>Code Du (source)</label>
                  <input type="text" value={transfertParams.codeDu}
                    onChange={(e) => setTransfertParams(p => ({ ...p, codeDu: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Code Au (destination)</label>
                  <input type="text" value={transfertParams.codeAu}
                    onChange={(e) => setTransfertParams(p => ({ ...p, codeAu: e.target.value }))} />
                </div>
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>Intitulé</label>
                  <input type="text" value={transfertParams.intitule}
                    onChange={(e) => setTransfertParams(p => ({ ...p, intitule: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>N° séquence (01, 02...)</label>
                  <input type="text" value={transfertParams.sequence}
                    onChange={(e) => setTransfertParams(p => ({ ...p, sequence: e.target.value }))} />
                </div>
              </div>
              <div className="confirm-buttons">
                <button className="btn btn-primary btn-large" onClick={generateTransfert}>Générer</button>
                <button className="btn btn-secondary btn-large" onClick={() => setShowTransfert(false)}>Annuler</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="filter-bar">
        <input type="text" placeholder="Rechercher EAN, PARKOD, libellé..."
          value={search} onChange={(e) => setSearch(e.target.value)} className="search-input" />
        <select className="brand-select" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
          <option value="">Toutes les marques</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="brand-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Statut: tous</option>
          <option value="complete">Tout OK</option>
          <option value="sent">Envoyé (attente dépôt)</option>
          <option value="pending">En attente</option>
          <option value="store_disc">Écart magasin</option>
          <option value="depot_disc">Écart dépôt</option>
        </select>
        <input type="date" className="date-input" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} title="Filtrer par date" />
        <select className="brand-select" value={depotFilter} onChange={(e) => setDepotFilter(e.target.value)}>
          <option value="all">Dépôt: tous</option>
          <option value="received">Réceptionnés</option>
          <option value="partial">En cours</option>
          <option value="not_received">Non reçus</option>
          <option value="discrepancy">Avec écart</option>
        </select>
        <select className="brand-select" value={exportFilter} onChange={(e) => setExportFilter(e.target.value)}>
          <option value="all">Traité: tous</option>
          <option value="not_exported">Non traités</option>
          <option value="exported">Traités</option>
        </select>
        <button className="btn btn-secondary" onClick={loadSummary}>Actualiser</button>
      </div>
      <div className="filter-bar">
        <button className="btn btn-success" onClick={exportXlsx}>Export XLSX</button>
        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
          {refXlsx ? `Réf. chargée (${refXlsx.size})` : 'Charger réf. XLSX'}
          <input type="file" accept=".xlsx,.xls" ref={refFileRef} onChange={handleRefXlsx} style={{ display: 'none' }} />
        </label>
        <button className="btn btn-secondary" onClick={exportSql}>STKPERM .md</button>
        <button className="btn btn-secondary" onClick={() => setShowTransfert(true)}>Transfert</button>
        <button className="btn btn-primary" onClick={markFilteredAsExported}>Marquer traités</button>
        <button className="btn btn-secondary" onClick={unmarkFilteredAsExported}>Démarquer</button>
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
            <th>Dépôt</th>
            <th>Traité</th>
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
                <td className="qty-cell">
                  {p.exported_at
                    ? <span className="badge badge-exported">Traité</span>
                    : <span className="badge badge-not-exported">—</span>}
                </td>
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
              <div className="card-item-row">
                <span className="card-item-field">Traité</span>
                <span className="card-item-value">
                  {p.exported_at ? <span className="badge badge-exported">Traité</span> : '—'}
                </span>
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
