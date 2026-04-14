const API_BASE = '/api';

function getToken() {
  return sessionStorage.getItem('auth_token');
}

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, {
    headers,
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

export const api = {
  // Auth
  login: (password, role = 'admin') => request('/auth/login', { method: 'POST', body: JSON.stringify({ password, role }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  checkAuth: () => request('/auth/check'),

  // Produits
  getProducts: (status, magasinId) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (magasinId) params.set('magasin_id', magasinId);
    return request('/products' + (params.toString() ? '?' + params.toString() : ''));
  },
  getProductByEan: (ean) => request(`/products/ean/${ean}`),
  addProduct: (product) => request('/products', { method: 'POST', body: JSON.stringify(product) }),
  addProductsBulk: (products, magasinId) => request('/products/bulk', { method: 'POST', body: JSON.stringify({ products, magasin_id: magasinId }) }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  deleteAllProducts: () => request('/products', { method: 'DELETE' }),
  markExported: (ids) => request('/products/export', { method: 'PATCH', body: JSON.stringify({ ids }) }),
  markUnexported: (ids) => request('/products/unexport', { method: 'PATCH', body: JSON.stringify({ ids }) }),

  // Scan
  confirmScan: (id, qty_sent) => request(`/scan/${id}/confirm`, { method: 'PATCH', body: JSON.stringify({ qty_sent }) }),
  resetScan: (id) => request(`/scan/${id}/reset`, { method: 'PATCH' }),

  // Dépôt
  getDepotProductByEan: (ean, magasinId) => request(`/depot/ean/${ean}${magasinId ? '?magasin_id=' + magasinId : ''}`),
  scanDepot: (id) => request(`/depot/${id}/scan`, { method: 'PATCH' }),
  resetReceipt: (id) => request(`/depot/${id}/reset`, { method: 'PATCH' }),

  // Dashboard
  getSummary: (magasinId) => request('/dashboard/summary' + (magasinId ? '?magasin_id=' + magasinId : '')),

  // Magasins
  getMagasins: () => request('/magasins'),
  createMagasin: (data) => request('/magasins', { method: 'POST', body: JSON.stringify(data) }),
  updateMagasin: (id, data) => request(`/magasins/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMagasin: (id) => request(`/magasins/${id}`, { method: 'DELETE' }),

  // Settings
  getSmtpSettings: () => request('/settings/smtp'),
  saveSmtpSettings: (data) => request('/settings/smtp', { method: 'PUT', body: JSON.stringify(data) }),
  testSmtp: () => request('/settings/smtp/test', { method: 'POST' }),

  // Notifications
  getNotifications: () => request('/notifications'),
  markNotificationsRead: () => request('/notifications/read', { method: 'PATCH' }),
  clearNotifications: () => request('/notifications', { method: 'DELETE' }),
};
