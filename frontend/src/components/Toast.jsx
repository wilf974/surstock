import { useEffect } from 'react';
import { createPortal } from 'react-dom';

function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return createPortal(
    <div className={`toast toast-${message.type}`} onClick={onClose}>
      <span className="toast-text">{message.text}</span>
    </div>,
    document.body
  );
}

export default Toast;
