import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import * as XLSX from 'xlsx';

function AdminInsert() {
  const [ean, setEan] = useState('');
  const [parkod, setParkod] = useState('');
  const [marque, setMarque] = useState('');
  const [label, setLabel] = useState('');
  const [qtyRequested, setQtyRequested] = useState('');
  const [products, setProducts] = useState([]);
  const [message, setMessage] = useState(null);
  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const fileInputRef = useRef(null);

  const loadProducts = async () => {
    try {
      const data = await api.getProducts();
      setProducts(data);
    } catch (err) {
      console.error('Erreur:', err);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!ean.trim() || !label.trim() || !qtyRequested) {
      showMsg('Tous les champs sont requis', 'error');
      return;
    }
    try {
      const fullLabel = marque.trim() ? `${marque.trim()} - ${label.trim()}` : label.trim();
      await api.addProduct({ ean: ean.trim(), parkod: parkod.trim() || null, label: fullLabel, qty_requested: parseInt(qtyRequested) });
      showMsg(`Produit "${fullLabel}" ajouté`);
      setEan(''); setParkod(''); setMarque(''); setLabel(''); setQtyRequested('');
      loadProducts();
    } catch (err) {
      showMsg('Erreur lors de l\'ajout', 'error');
    }
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    const lines = bulkText.trim().split('\n');
    const items = [];
    for (const line of lines) {
      const parts = line.split(/[;\t]/);
      if (parts.length >= 4) {
        items.push({ ean: parts[0].trim(), parkod: parts[1].trim() || null, label: parts[2].trim(), qty_requested: parseInt(parts[3].trim()) });
      } else if (parts.length >= 3) {
        items.push({ ean: parts[0].trim(), parkod: null, label: parts[1].trim(), qty_requested: parseInt(parts[2].trim()) });
      }
    }
    if (items.length === 0) { showMsg('Aucun produit valide trouvé', 'error'); return; }
    try {
      const result = await api.addProductsBulk(items);
      showMsg(`${result.inserted} produit(s) importé(s)`);
      setBulkText(''); setShowBulk(false); loadProducts();
    } catch (err) { showMsg('Erreur lors de l\'import', 'error'); }
  };

  const handleXlsxImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
    const items = [];
    for (const row of rows) {
      if (!row[0]) continue;
      if (row.length >= 5) {
        const m = row[2] ? String(row[2]).trim() : '';
        const l = row[3] ? String(row[3]).trim() : '';
        items.push({ ean: String(row[0]).trim(), parkod: row[1] ? String(row[1]).trim() : null, label: m ? `${m} - ${l}` : l, qty_requested: parseInt(row[4]) || 0 });
      } else if (row.length >= 4) {
        items.push({ ean: String(row[0]).trim(), parkod: row[1] ? String(row[1]).trim() : null, label: String(row[2]).trim(), qty_requested: parseInt(row[3]) || 0 });
      }
    }
    if (items.length === 0) { showMsg('Aucun produit valide trouvé dans le fichier', 'error'); fileInputRef.current.value = ''; return; }
    try {
      const result = await api.addProductsBulk(items);
      showMsg(`${result.inserted} produit(s) importé(s) depuis le fichier XLSX`);
      loadProducts();
    } catch (err) { showMsg('Erreur lors de l\'import XLSX', 'error'); }
    fileInputRef.current.value = '';
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce produit ?')) return;
    try { await api.deleteProduct(id); loadProducts(); } catch (err) { showMsg('Erreur', 'error'); }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('Supprimer TOUS les produits ? Cette action est irréversible.')) return;
    try { await api.deleteAllProducts(); showMsg('Tous les produits ont été supprimés'); loadProducts(); } catch (err) { showMsg('Erreur', 'error'); }
  };

  return (
    <div className="page admin-insert">
      <h1 className="page-title">Saisie des produits</h1>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <form onSubmit={handleAdd} className="insert-form">
        <div className="form-row">
          <div className="form-group">
            <label>Code EAN</label>
            <input type="text" value={ean} onChange={(e) => setEan(e.target.value)} placeholder="3017620422003" />
          </div>
          <div className="form-group">
            <label>PARKOD</label>
            <input type="text" value={parkod} onChange={(e) => setParkod(e.target.value)} placeholder="Code PARKOD" />
          </div>
          <div className="form-group">
            <label>Marque</label>
            <input type="text" value={marque} onChange={(e) => setMarque(e.target.value)} placeholder="ARMANI" />
          </div>
          <div className="form-group">
            <label>Libellé</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="MY WAY EDP 50ML" />
          </div>
          <div className="form-group">
            <label>Quantité</label>
            <input type="number" min="0" value={qtyRequested} onChange={(e) => setQtyRequested(e.target.value)} placeholder="10" />
          </div>
          <button type="submit" className="btn btn-primary">Ajouter</button>
        </div>
      </form>

      <div className="bulk-section">
        <div className="bulk-buttons">
          <button className="btn btn-secondary" onClick={() => setShowBulk(!showBulk)}>
            {showBulk ? 'Masquer l\'import' : 'Import en masse'}
          </button>
          <label className="btn btn-success">
            Import XLSX
            <input type="file" accept=".xlsx,.xls" ref={fileInputRef} onChange={handleXlsxImport} style={{ display: 'none' }} />
          </label>
        </div>
        {showBulk && (
          <div className="bulk-form">
            <p className="bulk-help">
              Un produit par ligne : <code>EAN;PARKOD;Libellé;Quantité</code> (séparateur ; ou tabulation)
            </p>
            <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={8}
              placeholder={"3017620422003;PKD001;Nutella 400g;24\n5000159484657;PKD002;Coca-Cola 1.5L;12"} />
            <button className="btn btn-primary" onClick={handleBulkImport}>Importer</button>
          </div>
        )}
      </div>

      <div className="products-section">
        <div className="section-header">
          <h2>Produits enregistrés ({products.length})</h2>
          {products.length > 0 && (
            <button className="btn btn-danger" onClick={handleDeleteAll}>Tout supprimer</button>
          )}
        </div>

        {products.length === 0 ? (
          <p className="empty-text">Aucun produit enregistré</p>
        ) : (
          <>
            {/* Tableau desktop */}
            <table className="table">
              <thead>
                <tr>
                  <th>EAN</th>
                  <th>PARKOD</th>
                  <th>Libellé</th>
                  <th>Qté</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className="ean-cell">{p.ean}</td>
                    <td className="ean-cell">{p.parkod || '—'}</td>
                    <td>{p.label}</td>
                    <td className="qty-cell">{p.qty_requested}</td>
                    <td>
                      {p.qty_sent !== null
                        ? <span className="badge badge-success">Confirmé ({p.qty_sent})</span>
                        : <span className="badge badge-pending">En attente</span>}
                    </td>
                    <td>
                      <button className="btn btn-danger btn-small" onClick={() => handleDelete(p.id)}>Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Cards mobile */}
            <div className="card-list">
              {products.map((p) => (
                <div key={p.id} className={`product-card-item ${p.qty_sent !== null ? 'status-confirmed' : 'status-pending'}`}>
                  <div className="card-item-header">
                    <span className="card-item-label">{p.label}</span>
                    {p.qty_sent !== null
                      ? <span className="badge badge-success">Confirmé</span>
                      : <span className="badge badge-pending">En attente</span>}
                  </div>
                  <div className="card-item-codes">
                    EAN: {p.ean}{p.parkod ? ` · PARKOD: ${p.parkod}` : ''}
                  </div>
                  <div className="card-item-row">
                    <span className="card-item-field">Qté demandée</span>
                    <span className="card-item-value">{p.qty_requested}</span>
                  </div>
                  <div className="card-item-actions">
                    <button className="btn btn-danger btn-small" onClick={() => handleDelete(p.id)} style={{ width: '100%' }}>
                      Supprimer
                    </button>
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

export default AdminInsert;
