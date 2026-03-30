import { useState, useEffect } from 'react';
import { api } from '../api';

function AdminInsert() {
  const [ean, setEan] = useState('');
  const [parkod, setParkod] = useState('');
  const [label, setLabel] = useState('');
  const [qtyRequested, setQtyRequested] = useState('');
  const [products, setProducts] = useState([]);
  const [message, setMessage] = useState(null);
  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(false);

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
      await api.addProduct({ ean: ean.trim(), parkod: parkod.trim() || null, label: label.trim(), qty_requested: parseInt(qtyRequested) });
      showMsg(`Produit "${label}" ajouté`);
      setEan('');
      setParkod('');
      setLabel('');
      setQtyRequested('');
      loadProducts();
    } catch (err) {
      showMsg('Erreur lors de l\'ajout', 'error');
    }
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;

    // Format attendu : EAN;PARKOD;Libellé;Quantité (une ligne par produit)
    // Accepte aussi : EAN;Libellé;Quantité (sans PARKOD)
    const lines = bulkText.trim().split('\n');
    const items = [];

    for (const line of lines) {
      const parts = line.split(/[;\t]/);
      if (parts.length >= 4) {
        items.push({
          ean: parts[0].trim(),
          parkod: parts[1].trim() || null,
          label: parts[2].trim(),
          qty_requested: parseInt(parts[3].trim()),
        });
      } else if (parts.length >= 3) {
        items.push({
          ean: parts[0].trim(),
          parkod: null,
          label: parts[1].trim(),
          qty_requested: parseInt(parts[2].trim()),
        });
      }
    }

    if (items.length === 0) {
      showMsg('Aucun produit valide trouvé. Format : EAN;PARKOD;Libellé;Quantité', 'error');
      return;
    }

    try {
      const result = await api.addProductsBulk(items);
      showMsg(`${result.inserted} produit(s) importé(s)`);
      setBulkText('');
      setShowBulk(false);
      loadProducts();
    } catch (err) {
      showMsg('Erreur lors de l\'import', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce produit ?')) return;
    try {
      await api.deleteProduct(id);
      loadProducts();
    } catch (err) {
      showMsg('Erreur lors de la suppression', 'error');
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('Supprimer TOUS les produits ? Cette action est irréversible.')) return;
    try {
      await api.deleteAllProducts();
      showMsg('Tous les produits ont été supprimés');
      loadProducts();
    } catch (err) {
      showMsg('Erreur', 'error');
    }
  };

  return (
    <div className="page admin-insert">
      <h1 className="page-title">Saisie des produits</h1>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Formulaire ajout unitaire */}
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
            <label>Libellé</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nutella 400g" />
          </div>
          <div className="form-group">
            <label>Quantité</label>
            <input type="number" min="1" value={qtyRequested} onChange={(e) => setQtyRequested(e.target.value)} placeholder="10" />
          </div>
          <button type="submit" className="btn btn-primary">Ajouter</button>
        </div>
      </form>

      {/* Import en masse */}
      <div className="bulk-section">
        <button className="btn btn-secondary" onClick={() => setShowBulk(!showBulk)}>
          {showBulk ? 'Masquer l\'import en masse' : 'Import en masse (copier/coller)'}
        </button>

        {showBulk && (
          <div className="bulk-form">
            <p className="bulk-help">
              Collez vos produits ci-dessous, un par ligne, au format :<br />
              <code>EAN;PARKOD;Libellé;Quantité</code> ou <code>EAN;Libellé;Quantité</code> (séparateur : point-virgule ou tabulation)
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={8}
              placeholder={"3017620422003;PKD001;Nutella 400g;24\n5000159484657;PKD002;Coca-Cola 1.5L;12\n8076809513753;;Barilla Spaghetti;36"}
            />
            <button className="btn btn-primary" onClick={handleBulkImport}>
              Importer
            </button>
          </div>
        )}
      </div>

      {/* Liste des produits */}
      <div className="products-section">
        <div className="section-header">
          <h2>Produits enregistrés ({products.length})</h2>
          {products.length > 0 && (
            <button className="btn btn-danger" onClick={handleDeleteAll}>
              Tout supprimer
            </button>
          )}
        </div>

        {products.length === 0 ? (
          <p className="empty-text">Aucun produit enregistré</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>EAN</th>
                <th>PARKOD</th>
                <th>Libellé</th>
                <th>Qté demandée</th>
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
                    {p.qty_sent !== null ? (
                      <span className="badge badge-success">Confirmé ({p.qty_sent})</span>
                    ) : (
                      <span className="badge badge-pending">En attente</span>
                    )}
                  </td>
                  <td>
                    <button className="btn btn-danger btn-small" onClick={() => handleDelete(p.id)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AdminInsert;
