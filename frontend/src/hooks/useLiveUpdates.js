import { useEffect, useRef } from 'react';

// onProductUpdate(product) — met à jour un seul produit dans le state
// onReload() — recharge tout (ajout/suppression en masse)
export function useLiveUpdates(onProductUpdate, onReload) {
  const updateRef = useRef(onProductUpdate);
  const reloadRef = useRef(onReload);
  updateRef.current = onProductUpdate;
  reloadRef.current = onReload;

  useEffect(() => {
    const token = sessionStorage.getItem('auth_token');
    if (!token) return;

    let es;
    let retryTimeout;

    function connect() {
      es = new EventSource(`/api/events?token=${token}`);

      es.addEventListener('product-updated', (e) => {
        try {
          const product = JSON.parse(e.data);
          if (product && product.id) {
            updateRef.current(product);
          }
        } catch {
          // Fallback: reload si le parsing échoue
          reloadRef.current?.();
        }
      });

      es.addEventListener('products-changed', () => {
        reloadRef.current?.();
      });

      es.onerror = () => {
        es.close();
        retryTimeout = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      if (es) es.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, []);
}
