import { useState, useEffect, useRef } from 'react';
import { api } from '../api';

function timeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  if (diffHour < 24) return `il y a ${diffHour}h`;
  return `il y a ${Math.floor(diffHour / 24)}j`;
}

function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Poll every 10 seconds
  useEffect(() => {
    let active = true;

    const fetchNotifications = async () => {
      try {
        const data = await api.getNotifications();
        if (active) setNotifications(data);
      } catch {
        // silently ignore (e.g. not logged in)
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleMarkRead = async () => {
    try {
      await api.markNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // ignore
    }
  };

  const handleClear = async () => {
    try {
      await api.clearNotifications();
      setNotifications([]);
      setOpen(false);
    } catch {
      // ignore
    }
  };

  const typeIcon = (type) => {
    if (type === 'error') return '🔴';
    if (type === 'warning') return '🟠';
    return '🔵';
  };

  return (
    <div className="notif-bell-wrapper" ref={ref}>
      <button
        className="notif-bell-btn"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        title="Notifications"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span className="notif-dropdown-title">Notifications</span>
            <span className="notif-dropdown-count">
              {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Aucune nouvelle'}
            </span>
          </div>

          <div className="notif-dropdown-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">Aucune notification</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${!n.read ? 'notif-unread' : ''} notif-type-${n.type}`}
                >
                  <span className="notif-item-icon">{typeIcon(n.type)}</span>
                  <div className="notif-item-content">
                    <span className="notif-item-message">{n.message}</span>
                    <span className="notif-item-time">{timeAgo(n.timestamp)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="notif-dropdown-footer">
              {unreadCount > 0 && (
                <button className="notif-action-btn" onClick={handleMarkRead}>
                  Tout marquer comme lu
                </button>
              )}
              <button className="notif-action-btn notif-action-danger" onClick={handleClear}>
                Effacer tout
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
