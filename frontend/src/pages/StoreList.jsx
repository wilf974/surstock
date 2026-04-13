import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import CameraScanner from '../components/CameraScanner';
import Toast from '../components/Toast';
import { useLiveUpdates } from '../hooks/useLiveUpdates';

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
  const [manualEan, setManualEan] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const qtyInputRef = useRef(null);
  const manualInputRef = useRef(null);
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

  // Mise à jour en temps réel quand un autre appareil scanne
  useLiveUpdates(
    (product) => {
      setProducts(prev => prev.map(p => p.id === product.id ? product : p));
    },
    () => { loadProducts(); }
  );

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
    const ean = code.trim().padStart(13, '0');
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
    setQtySent('');
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
    const qty = parseInt(qtySent);
    if (isNaN(qty) || qty < 0 || qty > 9999) {
      showMsg('Quantité invalide (0-9999)', 'error');
      setQtySent('');
      return;
    }
    try {
      await api.confirmScan(scannedProduct.id, qty);
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

  const handlePrint = useCallback(() => {
    const rows = products.map(p =>
      `<tr>
        <td>${p.ean}</td>
        <td>${p.parkod || '—'}</td>
        <td>${p.label}</td>
        <td style="text-align:center">${p.qty_requested}</td>
      </tr>`
    ).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Liste produits - Surstock</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
  h1 { font-size: 16px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #333; padding: 4px 8px; text-align: left; }
  th { background: #2c3e50; color: white; font-size: 11px; }
  td { font-size: 11px; }
  @media print { body { margin: 5mm; } }
</style></head><body>
<h1>Liste des produits — Surstock (${products.length} produits)</h1>
<table>
  <thead><tr><th>EAN</th><th>PARKOD</th><th>Libellé</th><th>Qté</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  }, [products]);

  const brands = useMemo(() => {
    const set = new Set();
    products.forEach(p => {
      const parts = p.label.split(' - ');
      const name = parts.length >= 2 ? parts[1].trim() : parts[0].trim();
      if (name) set.add(name);
    });
    return [...set].sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!brandFilter) return products;
    return products.filter(p => {
      const parts = p.label.split(' - ');
      const name = parts.length >= 2 ? parts[1].trim() : parts[0].trim();
      return name === brandFilter;
    });
  }, [products, brandFilter]);

  const confirmed = useMemo(() => filteredProducts.filter(p => p.qty_sent !== null).length, [filteredProducts]);
  const pending = useMemo(() => filteredProducts.filter(p => p.qty_sent === null).length, [filteredProducts]);
  const visibleProducts = useMemo(() => filteredProducts.slice(0, visibleCount), [filteredProducts, visibleCount]);
  const hasMore = visibleCount < filteredProducts.length;

  return (
    <div className="page store-list">
      <h1 className="page-title">Liste des produits</h1>

      <Toast message={message} onClose={() => setMessage(null)} />

      {scanBuffer && !scannedProduct && (
        <div className="scan-indicator">Scan en cours : <strong>{scanBuffer}</strong></div>
      )}

      {!scannedProduct && !scanBuffer && (
        <div className="scan-ready">
          Prêt à scanner — bippez un produit
          <div className="manual-scan-row">
            <form onSubmit={(e) => { e.preventDefault(); if (manualEan.trim()) { processScannedCode(manualEan.trim()); setManualEan(''); manualInputRef.current?.blur(); } }} className="manual-scan-form">
              <input ref={manualInputRef} type="text" inputMode="numeric" autoComplete="off"
                value={manualEan} onChange={(e) => setManualEan(e.target.value)}
                placeholder="Saisie manuelle EAN / PARKOD"
                className="manual-scan-input" />
              <button type="submit" className="btn btn-primary" disabled={!manualEan.trim()}>OK</button>
            </form>
            <button className="btn btn-primary camera-btn" onClick={() => setCameraOpen(true)}>
              Scanner avec la caméra
            </button>
          </div>
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
                  <input ref={qtyInputRef} type="number" min="0" max="9999" value={qtySent}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                      setQtySent(v);
                    }}
                    onKeyDown={(e) => {
                      // Bloquer Enter si ça ressemble à un scan douchette (>4 chars accumulés)
                      if (e.key === 'Enter' && qtySent.length > 4) {
                        e.preventDefault();
                        setQtySent('');
                        return;
                      }
                    }}
                    className="qty-input" autoComplete="off" inputMode="numeric" />
                </label>
                <div className="confirm-buttons">
                  <button type="submit" className="btn btn-success btn-large" disabled={qtySent === '' || parseInt(qtySent) > 9999 || isNaN(parseInt(qtySent))}>Confirmer</button>
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
        <div className="summary-card clickable" onClick={() => setFilter('all')}>
          <div className="summary-number">{products.length}</div>
          <div className="summary-label">Total</div>
        </div>
        <div className="summary-card card-success clickable" onClick={() => setFilter('confirmed')}>
          <div className="summary-number">{confirmed}</div>
          <div className="summary-label">Confirmés</div>
        </div>
        <div className="summary-card card-warning clickable" onClick={() => setFilter('pending')}>
          <div className="summary-number">{pending}</div>
          <div className="summary-label">En attente</div>
        </div>
      </div>

      {/* Filtres */}
      <div className="filter-bar">
        <button className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('all')}>Tous</button>
        <button className={`btn ${filter === 'pending' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('pending')}>En attente</button>
        <button className={`btn ${filter === 'confirmed' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('confirmed')}>Confirmés</button>
        <select className="brand-select" value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); setVisibleCount(PAGE_SIZE); }}>
          <option value="">Toutes les marques</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={loadProducts}>Actualiser</button>
        <button className="btn btn-secondary" onClick={handlePrint}>Imprimer</button>
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
              {filteredProducts.length - visibleCount} produits restants...
            </div>
          )}
        </>
      )}

      {/* Bouton flottant caméra mobile */}
      {!scannedProduct && !cameraOpen && (
        <button className="fab-camera" onClick={() => setCameraOpen(true)} aria-label="Scanner">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </button>
      )}
    </div>
  );
}

export default StoreList;
