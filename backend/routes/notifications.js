const express = require('express');
const router = express.Router();

// In-memory notifications store (max 50, newest first)
const notifications = [];
let nextId = 1;

function addNotification(message, type = 'info') {
  const notification = {
    id: nextId++,
    message,
    type, // info, warning, error
    timestamp: new Date().toISOString(),
    read: false,
  };
  notifications.unshift(notification);
  // Keep only the 50 most recent
  if (notifications.length > 50) {
    notifications.length = 50;
  }
  return notification;
}

// GET /api/notifications — return all notifications (admin only)
router.get('/', (req, res) => {
  res.json(notifications);
});

// PATCH /api/notifications/read — mark all as read
router.patch('/read', (req, res) => {
  for (const n of notifications) {
    n.read = true;
  }
  res.json({ success: true });
});

// DELETE /api/notifications — clear all
router.delete('/', (req, res) => {
  notifications.length = 0;
  res.json({ success: true });
});

module.exports = { router, addNotification };
