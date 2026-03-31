import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode } from 'html5-qrcode';

function CameraScanner({ onScan, onClose }) {
  const scannerRef = useRef(null);
  const [error, setError] = useState(null);
  const scannedRef = useRef(false);

  const handleClose = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const html5Qrcode = new Html5Qrcode('camera-reader');
        scannerRef.current = html5Qrcode;

        await html5Qrcode.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 280, height: 100 },
            formatsToSupport: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
          },
          (decodedText) => {
            if (scannedRef.current) return;
            scannedRef.current = true;
            html5Qrcode.stop().catch(() => {});
            scannerRef.current = null;
            onScan(decodedText);
          },
          () => {}
        );

        // Activer l'autofocus continu après le démarrage
        setTimeout(() => {
          try {
            const video = document.querySelector('#camera-reader video');
            if (video && video.srcObject) {
              const track = video.srcObject.getVideoTracks()[0];
              if (track) {
                const caps = track.getCapabilities?.();
                if (caps && caps.focusMode && caps.focusMode.includes('continuous')) {
                  track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
                }
              }
            }
          } catch (e) { /* ignore */ }
        }, 500);

      } catch (err) {
        console.error('Erreur caméra:', err);
        if (!cancelled) {
          setError('Impossible d\'accéder à la caméra. Vérifiez les permissions dans les réglages.');
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, []);

  return createPortal(
    <div className="camera-overlay">
      <div className="camera-container">
        <div className="camera-header">
          <span>Scanner un code-barres</span>
          <button className="btn btn-danger btn-small" onClick={handleClose}>Fermer</button>
        </div>
        {error ? (
          <div className="alert alert-error" style={{ margin: 16 }}>{error}</div>
        ) : (
          <>
            <div id="camera-reader" className="camera-viewport"></div>
            <p style={{ color: 'white', textAlign: 'center', marginTop: 12, fontSize: 14, opacity: 0.7 }}>
              Pointez vers un code-barres
            </p>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

export default CameraScanner;
