import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';

function StoreList() {
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [scanBuffer, setScanBuffer] = useState('');
  const [scannedProduct, setScannedProduct] = useState(null);
  const [qtySent, setQtySent] = useState('');
  const [message, setMessage] = useState(null);
  const [zeroProduct, setZeroProduct] = useState(null);
  const [zeroCode, setZeroCode] = useState('');
  const qtyInputRef = useRef(null);
  const zeroCodeInputRef = useRef(null);
  const highlightedRowRef = useRef(null);
  const scanBufferRef = useRef('');
  const scanTimeoutRef = useRef(null);
  const productsRef = useRef(products);
  const modalsOpenRef = useRef(false);

  // Sync refs
  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { modalsOpenRef.current = !!(scannedProduct || zeroProduct); }, [scannedProduct, zeroProduct]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const status = filter === 'all' ? undefined : filter;
      const data = await api.getProducts(status);
      setProducts(data);
    } catch (err) {
      console.error('Erreur chargement produits:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [filter]);

  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const processScannedCode = useCallback((code) => {
    const ean = code.trim();
    if (!ean) return;

    const prods = productsRef.current;
    const found = prods.find(p => (p.ean === ean || p.parkod === ean) && p.qty_sent === null);

    if (!found) {
      const alreadyDone = prods.find(p => (p.ean === ean || p.parkod === ean) && p.qty_sent !== null);
      if (alreadyDone) {
        showMsg(`"${alreadyDone.label}" a déjà été confirmé (${alreadyDone.qty_sent} envoyés)`, 'warning');
      } else {
        showMsg(`Produit non trouvé pour le code "${ean}"`, 'error');
      }
      return;
    }

    setScannedProduct(found);
    setQtySent(String(found.qty_requested));

    setTimeout(() => {
      highlightedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 100);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (modalsOpenRef.current) return;
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === 'Enter') {
        e.preventDefault();
        const code = scanBufferRef.current;
        scanBufferRef.current = '';
        setScanBuffer('');
        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current);
          scanTimeoutRef.current = null;
        }
        if (code.length > 0) processScannedCode(code);
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        scanBufferRef.current += e.key;
        setScanBuffer(scanBufferRef.current);
        if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = setTimeout(() => {
          scanBufferRef.current = '';
          setScanBuffer('');
          scanTimeoutRef.current = null;
        }, 500);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [processScannedCode]);

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (!scannedProduct || qtySent === '') return;
    try {
      await api.confirmScan(scannedProduct.id, parseInt(qtySent));
      const diff = parseInt(qtySent) - scannedProduct.qty_requested;
      const diffText = diff === 0 ? '(quantité exacte)' :
        diff < 0 ? `(${Math.abs(diff)} de moins)` : `(${diff} de plus)`;
      showMsg(`${scannedProduct.label} confirmé : ${qtySent} ${diffText}`, 'success');
      setScannedProduct(null);
      setQtySent('');
      loadProducts();
    } catch (err) {
      showMsg('Erreur lors de la confirmation', 'error');
    }
  };

  const handleCancelScan = () => {
    setScannedProduct(null);
    setQtySent('');
  };

  const openZeroModal = (product) => {
    setZeroProduct(product);
    setZeroCode('');
    setTimeout(() => zeroCodeInputRef.current?.focus(), 100);
  };

  const handleZeroConfirm = async (e) => {
    e.preventDefault();
    if (zeroCode !== '123456') {
      showMsg('Code incorrect', 'error');
      return;
    }
    try {
      await api.confirmScan(zeroProduct.id, 0);
      showMsg(`${zeroProduct.label} validé à 0`, 'success');
      setZeroProduct(null);
      setZeroCode('');
      loadProducts();
    } catch (err) {
      showMsg('Erreur lors de la validation', 'error');
    }
  };

  const confirmed = products.filter(p => p.qty_sent !== null).length;
  const pending = products.filter(p => p.qty_sent === null).length;

  return (
    <div className="page store-list">
      <h1 className="page-title">Liste des produits</h1>

      {message && (
        <div className={`alert alert-${message.type}`}>{message.text}</div>
      )}

      {scanBuffer && !scannedProduct && (
        <div className="scan-indicator">
          Scan en cours : <strong>{scanBuffer}</strong>
        </div>
      )}

      {!scannedProduct && !scanBuffer && (
        <div className="scan-ready">
          Prêt à scanner — bippez un produit
        </div>
      )}

      {/* Modale scan */}
      {scannedProduct && (
        <div className="scan-modal-overlay" onClick={handleCancelScan}>
          <div className="scan-modal" onClick={(e) => e.stopPropagation()}>
            <div className="scan-modal-header">Confirmer la quantité</div>
            <div className="scan-modal-body">
              <div className="product-info-row">
                <span className="product-info-label">Produit</span>
                <span className="product-info-value product-name">{scannedProduct.label}</span>
              </div>
              <div className="product-info-row">
                <span className="product-info-label">EAN</span>
                <span className="product-info-value">{scannedProduct.ean}</span>
              </div>
              {scannedProduct.parkod && (
                <div className="product-info-row">
                  <span className="product-info-label">PARKOD</span>
                  <span className="product-info-value">{scannedProduct.parkod}</span>
                </div>
              )}
              <div className="product-info-row">
                <span className="product-info-label">Qté demandée</span>
                <span className="product-info-value qty-requested">{scannedProduct.qty_requested}</span>
              </div>
              <form onSubmit={handleConfirm} className="confirm-form">
                <label className="confirm-label">
                  Quantité envoyée
                  <input ref={qtyInputRef} type="number" min="0" value={qtySent}
                    onChange={(e) => setQtySent(e.target.value)} className="qty-input" />
                </label>
                <div className="confirm-buttons">
                  <button type="submit" className="btn btn-success btn-large">Confirmer</button>
                  <button type="button" onClick={handleCancelScan} className="btn btn-secondary btn-large">Annuler</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modale valider à zéro */}
      {zeroProduct && (
        <div className="scan-modal-overlay" onClick={() => setZeroProduct(null)}>
          <div className="scan-modal" onClick={(e) => e.stopPropagation()}>
            <div className="scan-modal-header">Valider à zéro</div>
            <div className="scan-modal-body">
              <div className="product-info-row">
                <span className="product-info-label">Produit</span>
                <span className="product-info-value product-name">{zeroProduct.label}</span>
              </div>
              <form onSubmit={handleZeroConfirm} className="confirm-form">
                <label className="confirm-label">
                  Code de validation
                  <input ref={zeroCodeInputRef} type="text" value={zeroCode}
                    onChange={(e) => setZeroCode(e.target.value)} placeholder="Entrez le code"
                    className="qty-input" />
                </label>
                <div className="confirm-buttons">
                  <button type="submit" className="btn btn-danger btn-large">Valider à 0</button>
                  <button type="button" onClick={() => setZeroProduct(null)} className="btn btn-secondary btn-large">Annuler</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Résumé */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-number">{products.length}</div>
          <div className="summary-label">Total</div>
        </div>
        <div className="summary-card card-success">
          <div className="summary-number">{confirmed}</div>
          <div className="summary-label">Confirmés</div>
        </div>
        <div className="summary-card card-warning">
          <div className="summary-number">{pending}</div>
          <div className="summary-label">En attente</div>
        </div>
      </div>

      {/* Filtres */}
      <div className="filter-bar">
        <button className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('all')}>Tous</button>
        <button className={`btn ${filter === 'pending' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('pending')}>En attente</button>
        <button className={`btn ${filter === 'confirmed' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('confirmed')}>Confirmés</button>
        <button className="btn btn-secondary" onClick={loadProducts}>Actualiser</button>
      </div>

      {loading ? (
        <p className="loading-text">Chargement...</p>
      ) : products.length === 0 ? (
        <p className="empty-text">Aucun produit à afficher</p>
      ) : (
        <>
          {/* Vue tableau desktop */}
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
                <tr key={p.id}
                  ref={scannedProduct?.id === p.id ? highlightedRowRef : null}
                  className={scannedProduct?.id === p.id ? 'row-highlighted' : ''}>
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
                    {p.qty_sent === null && (
                      <button className="btn btn-danger btn-small" onClick={() => openZeroModal(p)}>Valider à 0</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Vue cards mobile */}
          <div className="card-list">
            {products.map((p) => (
              <div key={p.id}
                ref={scannedProduct?.id === p.id ? highlightedRowRef : null}
                className={`product-card-item ${p.qty_sent !== null ? 'status-confirmed' : 'status-pending'} ${scannedProduct?.id === p.id ? 'card-highlighted' : ''}`}>
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
                {p.qty_sent !== null && (
                  <div className="card-item-row">
                    <span className="card-item-field">Qté envoyée</span>
                    <span className="card-item-value">{p.qty_sent}</span>
                  </div>
                )}
                {p.qty_sent === null && (
                  <div className="card-item-actions">
                    <button className="btn btn-danger btn-small" onClick={() => openZeroModal(p)} style={{ width: '100%' }}>
                      Valider à 0
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default StoreList;
