import { useEffect, useRef } from 'react';

export function useLiveUpdates(onUpdate) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    const token = sessionStorage.getItem('auth_token');
    if (!token) return;

    let es;
    let retryTimeout;

    function connect() {
      es = new EventSource(`/api/events?token=${token}`);

      es.addEventListener('product-updated', () => {
        callbackRef.current();
      });

      es.addEventListener('products-changed', () => {
        callbackRef.current();
      });

      es.onerror = () => {
        es.close();
        // Reconnexion après 5s
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
