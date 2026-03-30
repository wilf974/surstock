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
  getProducts: (status) => request(`/products${status ? `?status=${status}` : ''}`),
  getProductByEan: (ean) => request(`/products/ean/${ean}`),
  addProduct: (product) => request('/products', { method: 'POST', body: JSON.stringify(product) }),
  addProductsBulk: (products) => request('/products/bulk', { method: 'POST', body: JSON.stringify({ products }) }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  deleteAllProducts: () => request('/products', { method: 'DELETE' }),

  // Scan
  confirmScan: (id, qty_sent) => request(`/scan/${id}/confirm`, { method: 'PATCH', body: JSON.stringify({ qty_sent }) }),
  resetScan: (id) => request(`/scan/${id}/reset`, { method: 'PATCH' }),

  // Dashboard
  getSummary: () => request('/dashboard/summary'),
};
