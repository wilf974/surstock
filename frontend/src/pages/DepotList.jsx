import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { api } from '../api';
import CameraScanner from '../components/CameraScanner';

// ──────────────────────────────────────────────
// Ligne tableau (desktop)
// ──────────────────────────────────────────────
const DepotRow = memo(function DepotRow({ p }) {
  const hasDiscrepancy = p.qty_received !== null && p.qty_received >= p.qty_sent && p.qty_received !== p.qty_sent;
  return (
    <tr className={hasDiscrepancy ? 'diff-under' : p.qty_received !== null && p.qty_received >= p.qty_sent ? 'diff-ok' : ''}>
      <td className="ean-cell">{p.ean}</td>
      <td className="ean-cell">{p.parkod || '—'}</td>
      <td>{p.label}</td>
      <td className="qty-cell">{p.qty_sent}</td>
      <td className="qty-cell">{p.qty_received || 0}</td>
      <td>
        {p.qty_received === null || p.qty_received < p.qty_sent ? (
          <span className="badge badge-pending">En cours ({p.qty_received || 0}/{p.qty_sent})</span>
        ) : p.qty_received === p.qty_sent ? (
          <span className="badge badge-success">Complet</span>
        ) : (
          <span className="badge badge-danger">Écart</span>
        )}
      </td>
    </tr>
  );
});

// ──────────────────────────────────────────────
// Card (mobile)
// ──────────────────────────────────────────────
const DepotCard = memo(function DepotCard({ p }) {
  const complete = p.qty_received !== null && p.qty_received >= p.qty_sent;
  const hasDiscrepancy = complete && p.qty_received !== p.qty_sent;
  return (
    <div className={`product-card-item ${hasDiscrepancy ? 'card-diff-under' : complete ? 'card-diff-ok' : 'status-pending'}`}>
      <div className="card-item-header">
        <span className="card-item-label">{p.label}</span>
        {!complete ? (
          <span className="badge badge-pending">{p.qty_received || 0}/{p.qty_sent}</span>
        ) : p.qty_received === p.qty_sent ? (
          <span className="badge badge-success">Complet</span>
        ) : (
          <span className="badge badge-danger">Écart</span>
        )}
      </div>
      <div className="card-item-codes">
        EAN: {p.ean}{p.parkod ? ` · PARKOD: ${p.parkod}` : ''}
      </div>
      <div className="card-item-row">
        <span className="card-item-field">Envoyée</span>
        <span className="card-item-value">{p.qty_sent}</span>
      </div>
      <div className="card-item-row">
        <span className="card-item-field">Reçue</span>
        <span className="card-item-value">{p.qty_received || 0}</span>
      </div>
    </div>
  );
});

// ──────────────────────────────────────────────
// Composant principal
// ──────────────────────────────────────────────
const PAGE_SIZE = 100;

function DepotList() {
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [scanBuffer, setScanBuffer] = useState('');
  const [message, setMessage] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manualEan, setManualEan] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const manualInputRef = useRef(null);
  const scanBufferRef = useRef('');
  const scanTimeoutRef = useRef(null);
  const productsRef = useRef(products);
  const scanningRef = useRef(false);
  const sentinelRef = useRef(null);

  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { scanningRef.current = scanning; }, [scanning]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount(prev => prev + PAGE_SIZE);
    }, { rootMargin: '200px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filter]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = filter === 'all'
        ? await api.getProducts('confirmed')
        : filter === 'complete'
          ? await api.getProducts('received')
          : await api.getProducts('awaiting_receipt');
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

  // Scan automatique : cherche le produit, incrémente, pas de modale
  const processScannedCode = useCallback(async (code) => {
    const ean = code.trim();
    if (!ean || scanningRef.current) return;

    setScanning(true);

    try {
      // Chercher via l'API (gère la logique de priorité)
      const product = await api.getDepotProductByEan(ean);

      // Scanner (incrémenter qty_received de 1)
      const updated = await api.scanDepot(product.id);

      const remaining = updated.qty_sent - updated.qty_received;
      if (remaining > 0) {
        showMsg(`${updated.label} — scanné ${updated.qty_received}/${updated.qty_sent} (encore ${remaining})`, 'success');
      } else if (updated.qty_received === updated.qty_sent) {
        showMsg(`${updated.label} — réception complète (${updated.qty_received}/${updated.qty_sent})`, 'success');
      } else {
        showMsg(`${updated.label} — ÉCART : reçu ${updated.qty_received} / envoyé ${updated.qty_sent}`, 'warning');
      }

      loadProducts();
    } catch (err) {
      if (err.status === 409) {
        showMsg(err.error || 'Produit déjà réceptionné', 'warning');
      } else if (err.status === 400) {
        showMsg(err.error || 'Produit pas encore envoyé', 'error');
      } else {
        showMsg(err.error || `Produit non trouvé pour "${ean}"`, 'error');
      }
    } finally {
      setScanning(false);
    }
  }, [showMsg]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (scanningRef.current) return;
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

  const brands = useMemo(() => {
    const set = new Set();
    products.forEach(p => {
      const parts = p.label.split(' - ');
      const name = parts.length >= 2 ? parts[1].trim() : parts[0].trim();
      if (name) set.add(name);
    });
    return [...set].sort();
  }, [products]);

  const filteredByBrand = useMemo(() => {
    if (!brandFilter) return products;
    return products.filter(p => {
      const parts = p.label.split(' - ');
      const name = parts.length >= 2 ? parts[1].trim() : parts[0].trim();
      return name === brandFilter;
    });
  }, [products, brandFilter]);

  const totalCount = filteredByBrand.length;
  const completeCount = useMemo(() => filteredByBrand.filter(p => p.qty_received !== null && p.qty_received >= p.qty_sent).length, [filteredByBrand]);
  const awaitingCount = useMemo(() => filteredByBrand.filter(p => p.qty_received === null || p.qty_received < p.qty_sent).length, [filteredByBrand]);
  const discrepancyCount = useMemo(() => filteredByBrand.filter(p => p.qty_received !== null && p.qty_received >= p.qty_sent && p.qty_received !== p.qty_sent).length, [filteredByBrand]);
  const visibleProducts = useMemo(() => filteredByBrand.slice(0, visibleCount), [filteredByBrand, visibleCount]);
  const hasMore = visibleCount < filteredByBrand.length;

  return (
    <div className="page store-list">
      <h1 className="page-title">Réception dépôt</h1>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      {scanBuffer && (
        <div className="scan-indicator">Scan en cours : <strong>{scanBuffer}</strong></div>
      )}

      {!scanBuffer && !scanning && (
        <div className="scan-ready">
          Prêt à scanner — bippez chaque produit un par un
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

      {scanning && !scanBuffer && (
        <div className="scan-indicator">Enregistrement en cours...</div>
      )}

      {cameraOpen && (
        <CameraScanner
          onScan={(code) => { setCameraOpen(false); processScannedCode(code); }}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {/* Résumé */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-number">{totalCount}</div>
          <div className="summary-label">Total</div>
        </div>
        <div className="summary-card card-success">
          <div className="summary-number">{completeCount}</div>
          <div className="summary-label">Complets</div>
        </div>
        <div className="summary-card card-warning">
          <div className="summary-number">{awaitingCount}</div>
          <div className="summary-label">En cours</div>
        </div>
        {discrepancyCount > 0 && (
          <div className="summary-card card-danger">
            <div className="summary-number">{discrepancyCount}</div>
            <div className="summary-label">Avec écart</div>
          </div>
        )}
      </div>

      {/* Filtres */}
      <div className="filter-bar">
        <button className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('all')}>Tous</button>
        <button className={`btn ${filter === 'awaiting' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('awaiting')}>En cours</button>
        <button className={`btn ${filter === 'complete' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('complete')}>Complets</button>
        <select className="brand-select" value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); setVisibleCount(PAGE_SIZE); }}>
          <option value="">Toutes les marques</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
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
                <th>Envoyée</th>
                <th>Reçue</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((p) => (
                <DepotRow key={p.id} p={p} />
              ))}
            </tbody>
          </table>

          <div className="card-list">
            {visibleProducts.map((p) => (
              <DepotCard key={p.id} p={p} />
            ))}
          </div>

          {hasMore && (
            <div ref={sentinelRef} className="loading-text">
              {filteredByBrand.length - visibleCount} produits restants...
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default DepotList;
