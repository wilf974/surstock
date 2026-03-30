import { useState, useRef, useEffect } from 'react';
import { api } from '../api';

function StoreScan() {
  const [ean, setEan] = useState('');
  const [product, setProduct] = useState(null);
  const [qtySent, setQtySent] = useState('');
  const [message, setMessage] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [loading, setLoading] = useState(false);
  const eanInputRef = useRef(null);
  const qtyInputRef = useRef(null);

  // Auto-focus sur le champ EAN au chargement
  useEffect(() => {
    eanInputRef.current?.focus();
  }, []);

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleEanSubmit = async (e) => {
    e.preventDefault();
    if (!ean.trim()) return;

    setLoading(true);
    setProduct(null);

    try {
      const found = await api.getProductByEan(ean.trim());
      setProduct(found);
      setQtySent(String(found.qty_requested));
      // Focus sur le champ quantité après un court délai
      setTimeout(() => qtyInputRef.current?.focus(), 100);
    } catch (err) {
      if (err.status === 409) {
        showMessage(`Ce produit a déjà été scanné (${err.product?.label})`, 'warning');
      } else if (err.status === 404) {
        showMessage('Produit non trouvé pour ce code EAN', 'error');
      } else {
        showMessage('Erreur lors de la recherche', 'error');
      }
      setEan('');
      eanInputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (!product || qtySent === '') return;

    try {
      const confirmed = await api.confirmScan(product.id, parseInt(qtySent));
      setRecentScans(prev => [confirmed, ...prev]);

      const diff = confirmed.qty_sent - confirmed.qty_requested;
      const diffText = diff === 0 ? '(quantité exacte)' :
        diff < 0 ? `(${Math.abs(diff)} de moins)` : `(${diff} de plus)`;

      showMessage(`${confirmed.label} confirmé : ${confirmed.qty_sent} ${diffText}`, 'success');

      // Reset et retour au scan
      setProduct(null);
      setEan('');
      setQtySent('');
      eanInputRef.current?.focus();
    } catch (err) {
      showMessage('Erreur lors de la confirmation', 'error');
    }
  };

  const handleCancel = () => {
    setProduct(null);
    setEan('');
    setQtySent('');
    eanInputRef.current?.focus();
  };

  return (
    <div className="page store-scan">
      <h1 className="page-title">Scanner les produits</h1>

      {/* Message de feedback */}
      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Zone de scan EAN */}
      {!product && (
        <div className="scan-zone">
          <div className="scan-icon">&#128722;</div>
          <p className="scan-instruction">
            Scannez un code-barres ou tapez le code EAN
          </p>
          <form onSubmit={handleEanSubmit} className="scan-form">
            <input
              ref={eanInputRef}
              type="text"
              value={ean}
              onChange={(e) => setEan(e.target.value)}
              placeholder="Code EAN..."
              className="scan-input"
              autoFocus
              disabled={loading}
            />
            <button type="submit" className="btn btn-primary btn-large" disabled={loading || !ean.trim()}>
              {loading ? 'Recherche...' : 'Rechercher'}
            </button>
          </form>
        </div>
      )}

      {/* Produit trouvé - Confirmation */}
      {product && (
        <div className="confirm-zone">
          <div className="product-card">
            <div className="product-card-header">Produit trouvé</div>
            <div className="product-card-body">
              <div className="product-info-row">
                <span className="product-info-label">EAN :</span>
                <span className="product-info-value">{product.ean}</span>
              </div>
              {product.parkod && (
                <div className="product-info-row">
                  <span className="product-info-label">PARKOD :</span>
                  <span className="product-info-value">{product.parkod}</span>
                </div>
              )}
              <div className="product-info-row">
                <span className="product-info-label">Libellé :</span>
                <span className="product-info-value product-name">{product.label}</span>
              </div>
              <div className="product-info-row">
                <span className="product-info-label">Quantité demandée :</span>
                <span className="product-info-value qty-requested">{product.qty_requested}</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleConfirm} className="confirm-form">
            <label className="confirm-label">
              Quantité envoyée :
              <input
                ref={qtyInputRef}
                type="number"
                min="0"
                value={qtySent}
                onChange={(e) => setQtySent(e.target.value)}
                className="qty-input"
              />
            </label>
            <div className="confirm-buttons">
              <button type="submit" className="btn btn-success btn-large">
                Confirmer
              </button>
              <button type="button" onClick={handleCancel} className="btn btn-secondary btn-large">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Historique des scans récents */}
      {recentScans.length > 0 && (
        <div className="recent-scans">
          <h2>Produits confirmés dans cette session</h2>
          <table className="table">
            <thead>
              <tr>
                <th>EAN</th>
                <th>PARKOD</th>
                <th>Libellé</th>
                <th>Demandé</th>
                <th>Envoyé</th>
                <th>Écart</th>
              </tr>
            </thead>
            <tbody>
              {recentScans.map((scan) => {
                const diff = scan.qty_sent - scan.qty_requested;
                return (
                  <tr key={scan.id}>
                    <td>{scan.ean}</td>
                    <td>{scan.parkod || '—'}</td>
                    <td>{scan.label}</td>
                    <td>{scan.qty_requested}</td>
                    <td><strong>{scan.qty_sent}</strong></td>
                    <td className={diff === 0 ? 'diff-ok' : diff < 0 ? 'diff-under' : 'diff-over'}>
                      {diff === 0 ? 'OK' : diff > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default StoreScan;
