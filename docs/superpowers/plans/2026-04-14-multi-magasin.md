# V2 Multi-Magasin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-store support to Surstock while preserving all existing Maison Blanche data and workflow.

**Architecture:** New `magasins` table with CRUD API. Products get `magasin_id` FK. Store login identifies magasin by password match. Admin selects magasin before import/dashboard. Depot selects magasin on home screen.

**Tech Stack:** Node.js/Express, sql.js (SQLite), React 18, existing CSS design system.

---

### Task 1: Database — Table magasins + migration products

**Files:**
- Modify: `backend/db.js`

- [ ] **Step 1: Add magasins table creation after settings table (after line 62 in db.js)**

```javascript
  // Table magasins
  db.run(`
    CREATE TABLE IF NOT EXISTS magasins (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      code            TEXT NOT NULL UNIQUE,
      store_password_hash TEXT NOT NULL,
      created_at      TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // Migration : insérer Maison Blanche si table vide
  const magCount = db.exec('SELECT COUNT(*) as c FROM magasins');
  if (magCount.length === 0 || magCount[0].values[0][0] === 0) {
    const storeHash = process.env.STORE_PASSWORD_HASH || 'not_set';
    db.run(
      "INSERT INTO magasins (id, name, code, store_password_hash) VALUES (1, 'Maison Blanche', '0002', ?)",
      [storeHash]
    );
  }

  // Migration : ajouter magasin_id aux produits
  try { db.run('ALTER TABLE products ADD COLUMN magasin_id INTEGER DEFAULT 1'); } catch (e) {}
```

This goes right after the `CREATE TABLE IF NOT EXISTS settings` block and before `saveDb()`.

- [ ] **Step 2: Verify migration locally**

Run: `cd backend && node -e "const db = require('./db'); db.getDb().then(() => console.log('OK'))"`
Expected: "OK", no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/db.js
git commit -m "V2: table magasins + migration magasin_id sur products"
```

---

### Task 2: Backend — CRUD routes magasins

**Files:**
- Create: `backend/routes/magasins.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Create backend/routes/magasins.js**

```javascript
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { queryAll, queryOne, run } = require('../db');

// GET /api/magasins — liste tous les magasins
router.get('/', (req, res) => {
  const magasins = queryAll('SELECT id, name, code, created_at FROM magasins ORDER BY name');
  res.json(magasins);
});

// GET /api/magasins/:id — un magasin
router.get('/:id', (req, res) => {
  const mag = queryOne('SELECT id, name, code, created_at FROM magasins WHERE id = ?', [parseInt(req.params.id)]);
  if (!mag) return res.status(404).json({ error: 'Magasin non trouvé' });
  res.json(mag);
});

// POST /api/magasins — créer un magasin
router.post('/', (req, res) => {
  const { name, code, password } = req.body;
  if (!name || !code || !password) {
    return res.status(400).json({ error: 'Nom, code et mot de passe requis' });
  }
  const existing = queryOne('SELECT id FROM magasins WHERE code = ?', [code]);
  if (existing) return res.status(409).json({ error: 'Ce code magasin existe déjà' });

  const hash = crypto.createHash('sha256').update(password).digest('hex');
  const result = run(
    'INSERT INTO magasins (name, code, store_password_hash) VALUES (?, ?, ?)',
    [name.trim(), code.trim(), hash]
  );
  const mag = queryOne('SELECT id, name, code, created_at FROM magasins WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json(mag);
});

// PUT /api/magasins/:id — modifier un magasin
router.put('/:id', (req, res) => {
  const { name, code, password } = req.body;
  const id = parseInt(req.params.id);
  const mag = queryOne('SELECT * FROM magasins WHERE id = ?', [id]);
  if (!mag) return res.status(404).json({ error: 'Magasin non trouvé' });

  if (code) {
    const dup = queryOne('SELECT id FROM magasins WHERE code = ? AND id != ?', [code, id]);
    if (dup) return res.status(409).json({ error: 'Ce code magasin existe déjà' });
  }

  if (password) {
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    run('UPDATE magasins SET name = ?, code = ?, store_password_hash = ? WHERE id = ?',
      [name || mag.name, code || mag.code, hash, id]);
  } else {
    run('UPDATE magasins SET name = ?, code = ? WHERE id = ?',
      [name || mag.name, code || mag.code, id]);
  }
  const updated = queryOne('SELECT id, name, code, created_at FROM magasins WHERE id = ?', [id]);
  res.json(updated);
});

// DELETE /api/magasins/:id — supprimer un magasin
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (id === 1) return res.status(400).json({ error: 'Impossible de supprimer le magasin par défaut' });

  const products = queryOne('SELECT COUNT(*) as c FROM products WHERE magasin_id = ?', [id]);
  if (products && products.c > 0) {
    return res.status(400).json({ error: `Ce magasin a encore ${products.c} produit(s). Supprimez-les d'abord.` });
  }

  run('DELETE FROM magasins WHERE id = ?', [id]);
  res.json({ success: true });
});

module.exports = router;
```

- [ ] **Step 2: Wire route in backend/server.js**

Add after line 12 (imports section):
```javascript
const magasinsRoutes = require('./routes/magasins');
```

Add after line 65 (after notifications route):
```javascript
app.use('/api/magasins', requireAdmin, magasinsRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/magasins.js backend/server.js
git commit -m "V2: CRUD API magasins"
```

---

### Task 3: Backend — Auth login par mot de passe magasin

**Files:**
- Modify: `backend/routes/auth.js`

- [ ] **Step 1: Modify login handler and token structure**

Replace the entire `backend/routes/auth.js` file:

```javascript
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { queryAll } = require('../db');

const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 'not_set';
const DEPOT_PASSWORD_HASH = process.env.DEPOT_PASSWORD_HASH || 'not_set';

// Tokens actifs : token → { role, magasinId }
const activeTokens = new Map();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { password, role } = req.body;

  if (role === 'store') {
    // Chercher le magasin par son mot de passe
    const magasins = queryAll('SELECT id, name, store_password_hash FROM magasins');
    const found = magasins.find(m => m.store_password_hash === password);
    if (!found) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    activeTokens.set(token, { role: 'store', magasinId: found.id });
    return res.json({ token, role: 'store', magasinId: found.id, magasinName: found.name });
  }

  if (role === 'depot') {
    if (password !== DEPOT_PASSWORD_HASH) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    activeTokens.set(token, { role: 'depot', magasinId: null });
    return res.json({ token, role: 'depot' });
  }

  // Admin
  if (password !== ADMIN_PASSWORD_HASH) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  activeTokens.set(token, { role: 'admin', magasinId: null });
  res.json({ token, role: 'admin' });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) activeTokens.delete(token);
  res.json({ success: true });
});

// GET /api/auth/check
router.get('/check', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const session = token && activeTokens.get(token);
  if (session) {
    return res.json({ authenticated: true, role: session.role, magasinId: session.magasinId });
  }
  res.status(401).json({ authenticated: false });
});

// Helper : extraire magasinId du token
function getMagasinId(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const session = token && activeTokens.get(token);
  return session ? session.magasinId : null;
}

function getRole(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const session = token && activeTokens.get(token);
  return session ? session.role : null;
}

// Middlewares
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const session = token && activeTokens.get(token);
  if (!session || session.role !== 'admin') {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  next();
}

function requireStore(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const session = token && activeTokens.get(token);
  if (!session || (session.role !== 'store' && session.role !== 'admin')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  next();
}

function requireDepot(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const session = token && activeTokens.get(token);
  if (!session || (session.role !== 'depot' && session.role !== 'admin')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  next();
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  next();
}

function checkToken(token) {
  return activeTokens.has(token);
}

module.exports = { router, requireAdmin, requireStore, requireDepot, requireAuth, checkToken, getMagasinId, getRole };
```

- [ ] **Step 2: Commit**

```bash
git add backend/routes/auth.js
git commit -m "V2: auth login store par mot de passe magasin, token porte magasinId"
```

---

### Task 4: Backend — Filtrage products par magasin_id

**Files:**
- Modify: `backend/routes/products.js`

- [ ] **Step 1: Add magasinId filtering to all product routes**

Add at top of file (after existing imports):
```javascript
const { getMagasinId, getRole } = require('./auth');
```

Modify GET `/` handler — replace the query building:
```javascript
router.get('/', (req, res) => {
  const { status, magasin_id } = req.query;
  const role = getRole(req);
  const tokenMagasinId = getMagasinId(req);

  // Déterminer le magasin_id à filtrer
  const filterMagId = role === 'store' ? tokenMagasinId : (magasin_id ? parseInt(magasin_id) : null);

  let query = 'SELECT * FROM products';
  const conditions = [];
  const params = [];

  if (filterMagId) { conditions.push('magasin_id = ?'); params.push(filterMagId); }
  if (status === 'pending') { conditions.push('qty_sent IS NULL'); }
  else if (status === 'confirmed') { conditions.push('qty_sent IS NOT NULL'); }
  else if (status === 'awaiting_receipt') { conditions.push('qty_sent IS NOT NULL AND qty_received IS NULL'); }
  else if (status === 'received') { conditions.push('qty_received IS NOT NULL'); }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY created_at DESC';

  const products = queryAll(query, params);
  res.json(products);
});
```

Modify GET `/ean/:ean` handler — add magasin filtering:
```javascript
router.get('/ean/:ean', (req, res) => {
  const ean = req.params.ean.padStart(13, '0');
  const role = getRole(req);
  const tokenMagasinId = getMagasinId(req);
  const magId = role === 'store' ? tokenMagasinId : (req.query.magasin_id ? parseInt(req.query.magasin_id) : null);

  let whereClause = 'ean = ? AND qty_sent IS NULL';
  let queryParams = [ean];
  if (magId) { whereClause += ' AND magasin_id = ?'; queryParams.push(magId); }

  const product = queryOne(`SELECT * FROM products WHERE ${whereClause} ORDER BY id ASC LIMIT 1`, queryParams);

  if (!product) {
    let confirmWhere = 'ean = ? AND qty_sent IS NOT NULL';
    let confirmParams = [ean];
    if (magId) { confirmWhere += ' AND magasin_id = ?'; confirmParams.push(magId); }
    const confirmed = queryOne(`SELECT * FROM products WHERE ${confirmWhere} ORDER BY scanned_at DESC LIMIT 1`, confirmParams);
    if (confirmed) return res.status(409).json({ error: 'Ce produit a déjà été scanné et confirmé', product: confirmed });
    return res.status(404).json({ error: 'Produit non trouvé pour ce code EAN' });
  }
  res.json(product);
});
```

Modify POST `/` handler — require magasin_id:
```javascript
// In the POST handler, after parsing qty:
const magasinId = req.body.magasin_id || 1;
// Change INSERT to include magasin_id:
const result = run(
  'INSERT INTO products (ean, parkod, label, qty_requested, qty_sent, scanned_at, qty_received, received_at, magasin_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  [ean.trim().padStart(13, '0'), parkod ? parkod.trim() : null, label.trim(), qty, qty === 0 ? 0 : null, now, qty === 0 ? 0 : null, now, magasinId]
);
```

Modify POST `/bulk` handler — same pattern:
```javascript
// Add magasinId from body:
const magasinId = req.body.magasin_id || 1;
// Change INSERT to include magasin_id:
run(
  'INSERT INTO products (ean, parkod, label, qty_requested, qty_sent, scanned_at, qty_received, received_at, magasin_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  [item.ean.trim().padStart(13, '0'), item.parkod ? item.parkod.trim() : null, item.label.trim(), qty, qty === 0 ? 0 : null, now, qty === 0 ? 0 : null, now, magasinId]
);
```

- [ ] **Step 2: Commit**

```bash
git add backend/routes/products.js
git commit -m "V2: filtrage products par magasin_id (store auto, depot/admin query param)"
```

---

### Task 5: Backend — Filtrage depot + dashboard par magasin_id

**Files:**
- Modify: `backend/routes/depot.js`
- Modify: `backend/routes/dashboard.js`
- Modify: `backend/routes/scan.js`
- Modify: `backend/routes/notifications.js`

- [ ] **Step 1: Modify depot.js — filter by magasin_id**

Add at top:
```javascript
const { getMagasinId } = require('./auth');
const { queryOne: queryOneMag } = require('../db');
```

In GET `/ean/:ean` handler, add magasin filtering:
```javascript
router.get('/ean/:ean', (req, res) => {
  const ean = req.params.ean.padStart(13, '0');
  const magId = req.query.magasin_id ? parseInt(req.query.magasin_id) : null;
  const magFilter = magId ? ' AND magasin_id = ?' : '';
  const magParams = magId ? [magId] : [];

  const product = queryOne(
    `SELECT * FROM products WHERE (ean = ? OR parkod = ?) AND qty_sent IS NOT NULL AND (qty_received IS NULL OR qty_received < qty_sent)${magFilter} ORDER BY id ASC LIMIT 1`,
    [ean, ean, ...magParams]
  );

  if (!product) {
    const received = queryOne(
      `SELECT * FROM products WHERE (ean = ? OR parkod = ?) AND qty_received IS NOT NULL AND qty_received >= qty_sent${magFilter} ORDER BY received_at DESC LIMIT 1`,
      [ean, ean, ...magParams]
    );
    if (received) return res.status(409).json({ error: 'Ce produit a déjà été réceptionné', product: received });

    const pending = queryOne(
      `SELECT * FROM products WHERE (ean = ? OR parkod = ?) AND qty_sent IS NULL${magFilter} ORDER BY id ASC LIMIT 1`,
      [ean, ean, ...magParams]
    );
    if (pending) return res.status(400).json({ error: 'Ce produit n\'a pas encore été confirmé par le magasin' });
    return res.status(404).json({ error: 'Produit non trouvé pour ce code' });
  }
  res.json(product);
});
```

- [ ] **Step 2: Modify dashboard.js — optional magasin filter**

```javascript
router.get('/summary', (req, res) => {
  const magId = req.query.magasin_id ? parseInt(req.query.magasin_id) : null;
  const where = magId ? ' WHERE magasin_id = ?' : '';
  const params = magId ? [magId] : [];
  const products = queryAll(`SELECT * FROM products${where} ORDER BY created_at DESC`, params);
  // ... rest unchanged
});
```

- [ ] **Step 3: Modify notifications — prefix magasin name in scan.js**

In scan.js, after getting the updated product:
```javascript
const mag = queryOne('SELECT name FROM magasins WHERE id = ?', [updated.magasin_id]);
const magName = mag ? mag.name : '';
// In notification messages, prefix with magName:
addNotification(`${magName}: ${updated.label} — confirmé ${qty_sent} (OK)`, 'info');
```

Same pattern in depot.js notifications.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/depot.js backend/routes/dashboard.js backend/routes/scan.js
git commit -m "V2: filtrage depot/dashboard/notifications par magasin"
```

---

### Task 6: Frontend — API + App state magasinId

**Files:**
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add magasin API calls to api.js**

Add to the api object:
```javascript
  // Magasins
  getMagasins: () => request('/magasins'),
  getMagasin: (id) => request(`/magasins/${id}`),
  createMagasin: (data) => request('/magasins', { method: 'POST', body: JSON.stringify(data) }),
  updateMagasin: (id, data) => request(`/magasins/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMagasin: (id) => request(`/magasins/${id}`, { method: 'DELETE' }),
```

Modify existing calls to support magasin_id:
```javascript
  getProducts: (status, magasinId) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (magasinId) params.set('magasin_id', magasinId);
    const qs = params.toString();
    return request(`/products${qs ? '?' + qs : ''}`);
  },
  addProduct: (product) => request('/products', { method: 'POST', body: JSON.stringify(product) }),
  addProductsBulk: (products, magasinId) => request('/products/bulk', { method: 'POST', body: JSON.stringify({ products, magasin_id: magasinId }) }),
  getDepotProductByEan: (ean, magasinId) => request(`/depot/ean/${ean}${magasinId ? '?magasin_id=' + magasinId : ''}`),
  getSummary: (magasinId) => request(`/dashboard/summary${magasinId ? '?magasin_id=' + magasinId : ''}`),
```

- [ ] **Step 2: Add magasinId to App.jsx state**

In App.jsx, modify checkAuth and state:
```javascript
const [magasinId, setMagasinId] = useState(null);

// In checkAuth:
const { role, magasinId: mId } = await api.checkAuth();
setAuthRole(role);
setMagasinId(mId || null);

// In handleLogin:
const handleLogin = (role, mId) => {
  setAuthRole(role);
  setMagasinId(mId || null);
};

// In handleLogout:
setMagasinId(null);
```

Update AdminLogin onLogin callback in routes to pass magasinId.

Pass `magasinId` as prop to StoreList, DepotList, AdminInsert, AdminDashboard.

Add route for `/admin/magasins`:
```jsx
import AdminMagasins from './pages/AdminMagasins';
// In Routes:
<Route path="/admin/magasins" element={
  isAdmin ? <AdminMagasins /> : <AdminLogin onLogin={handleLogin} role="admin" />
} />
```

- [ ] **Step 3: Update AdminLogin.jsx to pass magasinId on login**

```javascript
const { token, magasinId } = await api.login(hashHex, role);
sessionStorage.setItem('auth_token', token);
sessionStorage.setItem('auth_role', role);
if (magasinId) sessionStorage.setItem('auth_magasin_id', magasinId);
onLogin(role, magasinId);
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.js frontend/src/App.jsx frontend/src/pages/AdminLogin.jsx
git commit -m "V2: API magasins + App state magasinId + login retourne magasinId"
```

---

### Task 7: Frontend — Page admin gestion magasins

**Files:**
- Create: `frontend/src/pages/AdminMagasins.jsx`
- Modify: `frontend/src/components/Navbar.jsx`

- [ ] **Step 1: Create AdminMagasins.jsx**

Full page with: list of magasins, add form, edit/delete buttons. Pattern from AdminSettings.jsx (form + list). Include name, code CMAG, password fields. Delete blocked if products exist.

- [ ] **Step 2: Add "Magasins" link in Navbar.jsx**

In the Admin nav-section, add after "Réglages":
```jsx
<NavLink to="/admin/magasins" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={closeMenu}>
  Magasins
</NavLink>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AdminMagasins.jsx frontend/src/components/Navbar.jsx
git commit -m "V2: page admin gestion magasins + lien navbar"
```

---

### Task 8: Frontend — Sélecteur magasin dans AdminInsert

**Files:**
- Modify: `frontend/src/pages/AdminInsert.jsx`

- [ ] **Step 1: Add magasin selector**

Add state and load magasins on mount:
```javascript
const [magasins, setMagasins] = useState([]);
const [selectedMagasin, setSelectedMagasin] = useState('');

useEffect(() => {
  api.getMagasins().then(setMagasins).catch(() => {});
}, []);
```

Add dropdown at top of form (before form-row):
```jsx
<div className="form-group" style={{ marginBottom: 16 }}>
  <label>Magasin destinataire</label>
  <select className="brand-select" value={selectedMagasin} onChange={(e) => setSelectedMagasin(e.target.value)} required>
    <option value="">Sélectionner un magasin</option>
    {magasins.map(m => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
  </select>
</div>
```

Pass `magasin_id` in addProduct and addProductsBulk calls:
```javascript
await api.addProduct({ ...product, magasin_id: parseInt(selectedMagasin) });
await api.addProductsBulk(items, parseInt(selectedMagasin));
```

Block submit if no magasin selected.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/AdminInsert.jsx
git commit -m "V2: sélecteur magasin obligatoire dans saisie produits"
```

---

### Task 9: Frontend — Sélecteur magasin dans AdminDashboard

**Files:**
- Modify: `frontend/src/pages/AdminDashboard.jsx`

- [ ] **Step 1: Add magasin selector and filter**

Add state:
```javascript
const [magasins, setMagasins] = useState([]);
const [selectedMagasin, setSelectedMagasin] = useState('');
```

Load magasins on mount. Modify `loadSummary` to pass magasinId:
```javascript
const data = await api.getSummary(selectedMagasin || undefined);
```

Reload on selectedMagasin change. Add dropdown in filter-bar. Update STKPERM/transfert exports to use magasin code from fiche.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/AdminDashboard.jsx
git commit -m "V2: sélecteur magasin dans dashboard + exports filtrés"
```

---

### Task 10: Frontend — StoreList filtré par magasinId du token

**Files:**
- Modify: `frontend/src/pages/StoreList.jsx`

- [ ] **Step 1: Pass magasinId in API calls**

The `magasinId` comes from App.jsx props. Modify `loadProducts`:
```javascript
const data = await api.getProducts(status, magasinId);
```

The backend filters automatically for role=store, so this is mainly for consistency. The scan lookup also uses the token's magasinId automatically.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/StoreList.jsx
git commit -m "V2: StoreList filtré par magasinId du token"
```

---

### Task 11: Frontend — DepotList écran sélection magasin

**Files:**
- Modify: `frontend/src/pages/DepotList.jsx`

- [ ] **Step 1: Add magasin selection screen**

Add state:
```javascript
const [magasins, setMagasins] = useState([]);
const [selectedMagasin, setSelectedMagasin] = useState(null);
```

Load magasins with counters on mount. If no magasin selected, show selection screen:
```jsx
if (!selectedMagasin) {
  return (
    <div className="page">
      <h1 className="page-title">Réception dépôt</h1>
      <p style={{ marginBottom: 16 }}>Sélectionnez un magasin :</p>
      <div className="summary-cards">
        {magasins.map(m => (
          <div key={m.id} className="summary-card clickable" onClick={() => setSelectedMagasin(m)}>
            <div className="summary-number">{m.name}</div>
            <div className="summary-label">{m.awaitingCount} en attente · {m.completeCount} complets</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Add back button to return to selection. Pass `selectedMagasin.id` in all API calls:
```javascript
const data = await api.getProducts(status, selectedMagasin.id);
// For depot scan:
const product = await api.getDepotProductByEan(ean, selectedMagasin.id);
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/DepotList.jsx
git commit -m "V2: écran sélection magasin dépôt + filtrage par magasin"
```

---

### Task 12: Frontend — SSE filtrage par magasin + useLiveUpdates

**Files:**
- Modify: `frontend/src/hooks/useLiveUpdates.js`

- [ ] **Step 1: Filter SSE events by magasinId**

Update the hook signature to accept magasinId:
```javascript
export function useLiveUpdates(onProductUpdate, onReload, magasinId) {
  // In product-updated handler:
  const product = JSON.parse(e.data);
  if (product && product.id) {
    // Si magasinId est défini, ignorer les produits d'autres magasins
    if (magasinId && product.magasin_id && product.magasin_id !== magasinId) return;
    updateRef.current(product);
  }
}
```

Update all callers (StoreList, DepotList, AdminDashboard, AdminInsert) to pass magasinId.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useLiveUpdates.js frontend/src/pages/StoreList.jsx frontend/src/pages/DepotList.jsx frontend/src/pages/AdminDashboard.jsx frontend/src/pages/AdminInsert.jsx
git commit -m "V2: SSE filtrage par magasinId"
```

---

### Task 13: Docker env + test local

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Keep STORE_PASSWORD_HASH for migration**

No change needed — the env var is still read in db.js migration. It can be removed after first run but keep it for safety.

- [ ] **Step 2: Test locally**

```bash
cd backend && node server.js
# In another terminal:
cd frontend && npm run dev
```

Test checklist:
1. Login admin → voir la page Magasins → Maison Blanche existe
2. Créer un magasin "Parapharmacie" code "0003" mdp "Parapharmacie"
3. Login store avec "Maison Blanche" → voir les produits existants
4. Login store avec "Parapharmacie" → liste vide
5. Admin → Saisie → sélectionner Parapharmacie → ajouter un produit
6. Login Parapharmacie → voir le produit
7. Login Maison Blanche → ne voit PAS le produit Parapharmacie
8. Login depot → écran sélection → voir les 2 magasins
9. Dashboard admin → sélecteur magasin → filtrage OK
10. Exports STKPERM/transfert → code CMAG correct par magasin

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "V2 multi-magasin: complet, testé localement"
```
