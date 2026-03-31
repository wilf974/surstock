import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import CameraScanner from '../components/CameraScanner';

// ──────────────────────────────────────────────
// Popup "Valider à 0" — rendu via Portal, hors de l'arbre StoreList
// ──────────────────────────────────────────────
function ZeroModalPortal() {
  const [product, setProduct] = useState(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState(null);
  const inputRef = useRef(null);
  const callbackRef = useRef(null);

  // Exposer open/isOpen globalement
  useEffect(() => {
    window.__zeroModal = {
      open(p, onDone) {
        callbackRef.current = onDone;
        setProduct(p);
        setCode('');
      },
      isOpen() { return !!product; }
    };
    return () => { window.__zeroModal = null; };
  });

  useEffect(() => {
    if (product) {
      // Double rAF pour être sûr que le DOM est peint
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      });
    }
  }, [product]);

  if (!product) return null;

  const close = () => { setProduct(null); setMessage(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (code !== '123456') {
      setMessage('Code incorrect');
      return;
    }
    try {
      await api.confirmScan(product.id, 0);
      const label = product.label;
      setProduct(null);
      setMessage(null);
      callbackRef.current?.(label);
    } catch {
      setMessage('Erreur lors de la validation');
    }
  };

  return createPortal(
    <div className="scan-modal-overlay" onClick={close}>
      <div className="scan-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scan-modal-header">Valider à zéro</div>
        <div className="scan-modal-body">
          <div className="product-info-row">
            <span className="product-info-label">Produit</span>
            <span className="product-info-value product-name">{product.label}</span>
          </div>
          {message && <div className="alert alert-error" style={{ marginTop: 12 }}>{message}</div>}
          <form onSubmit={handleSubmit} className="confirm-form">
            <label className="confirm-label">
              Code de validation
              <input ref={inputRef} type="text" inputMode="numeric" autoComplete="off"
                value={code} onChange={(e) => setCode(e.target.value)}
                placeholder="Entrez le code" className="qty-input" />
            </label>
            <div className="confirm-buttons">
              <button type="submit" className="btn btn-danger btn-large">Valider à 0</button>
              <button type="button" onClick={close} className="btn btn-secondary btn-large">Annuler</button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ──────────────────────────────────────────────
// Ligne tableau (desktop) — mémorisée
// ──────────────────────────────────────────────
const ProductRow = memo(function ProductRow({ p, onZero }) {
  return (
    <tr>
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
          <button className="btn btn-danger btn-small" onClick={() => onZero(p)}>Valider à 0</button>
        )}
      </td>
    </tr>
  );
});

// ──────────────────────────────────────────────
// Card (mobile) — mémorisée
// ──────────────────────────────────────────────
const ProductCard = memo(function ProductCard({ p, onZero }) {
  return (
    <div className={`product-card-item ${p.qty_sent !== null ? 'status-confirmed' : 'status-pending'}`}>
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
          <button className="btn btn-danger btn-small" onClick={() => onZero(p)} style={{ width: '100%' }}>
            Valider à 0
          </button>
        </div>
      )}
    </div>
  );
});

// ──────────────────────────────────────────────
// Composant principal
// ──────────────────────────────────────────────
const PAGE_SIZE = 100;

function StoreList() {
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [scanBuffer, setScanBuffer] = useState('');
  const [scannedProduct, setScannedProduct] = useState(null);
  const [qtySent, setQtySent] = useState('');
  const [message, setMessage] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [cameraOpen, setCameraOpen] = useState(false);
  const qtyInputRef = useRef(null);
  const scanBufferRef = useRef('');
  const scanTimeoutRef = useRef(null);
  const productsRef = useRef(products);
  const scannedRef = useRef(false);
  const sentinelRef = useRef(null);

  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { scannedRef.current = !!scannedProduct; }, [scannedProduct]);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCount(prev => prev + PAGE_SIZE);
      }
    }, { rootMargin: '200px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loading]);

  // Reset visible count on filter change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filter]);

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

  useEffect(() => { loadProducts(); }, [filter]);

  const showMsg = useCallback((text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  }, []);

  const openZeroModal = useCallback((product) => {
    window.__zeroModal?.open(product, (label) => {
      showMsg(`${label} validé à 0`, 'success');
      loadProducts();
    });
  }, [showMsg]);

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
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 100);
  }, [showMsg]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (scannedRef.current || window.__zeroModal?.isOpen()) return;
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === 'Enter') {
        e.preventDefault();
        const code = scanBufferRef.current;
        scanBufferRef.current = '';
        setScanBuffer('');
        if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
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

  const handleCancelScan = () => { setScannedProduct(null); setQtySent(''); };

  const confirmed = useMemo(() => products.filter(p => p.qty_sent !== null).length, [products]);
  const pending = useMemo(() => products.filter(p => p.qty_sent === null).length, [products]);
  const visibleProducts = useMemo(() => products.slice(0, visibleCount), [products, visibleCount]);
  const hasMore = visibleCount < products.length;

  return (
    <div className="page store-list">
      <h1 className="page-title">Liste des produits</h1>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {scanBuffer && !scannedProduct && (
        <div className="scan-indicator">Scan en cours : <strong>{scanBuffer}</strong></div>
      )}

      {!scannedProduct && !scanBuffer && (
        <div className="scan-ready">
          Prêt à scanner — bippez un produit
          <button className="btn btn-primary camera-btn" onClick={() => setCameraOpen(true)}>
            Scanner avec la caméra
          </button>
        </div>
      )}

      {cameraOpen && (
        <CameraScanner
          onScan={(code) => { setCameraOpen(false); processScannedCode(code); }}
          onClose={() => setCameraOpen(false)}
        />
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
                    onChange={(e) => setQtySent(e.target.value)} className="qty-input" autoComplete="off" />
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

      {/* Portal popup zéro — complètement hors de l'arbre StoreList */}
      <ZeroModalPortal />

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
              {visibleProducts.map((p) => (
                <ProductRow key={p.id} p={p} onZero={openZeroModal} />
              ))}
            </tbody>
          </table>

          <div className="card-list">
            {visibleProducts.map((p) => (
              <ProductCard key={p.id} p={p} onZero={openZeroModal} />
            ))}
          </div>

          {/* Sentinel pour infinite scroll */}
          {hasMore && (
            <div ref={sentinelRef} className="loading-text">
              {products.length - visibleCount} produits restants...
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default StoreList;
