# V2 Multi-Magasin — Design Spec

## Contexte
Surstock est en production avec un seul magasin (Maison Blanche). Le surstock est en cours avec ~3000+ produits. Cette V2 ajoute le support multi-magasin tout en préservant intégralement les données et le workflow existants.

## Décisions clés
- **Un dépôt unique** pour tous les magasins
- **Le mot de passe identifie le magasin** — pas de sélecteur au login store
- **L'admin sélectionne le magasin** avant d'importer des produits
- **Le code CMAG est dans la fiche magasin** — utilisé automatiquement pour les exports
- **Page admin de gestion des magasins** — CRUD complet
- **Rétrocompatibilité totale** — données Maison Blanche intactes, migration transparente

---

## Base de données

### Nouvelle table `magasins`
```sql
CREATE TABLE IF NOT EXISTS magasins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  store_password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
```

### Modification table `products`
```sql
ALTER TABLE products ADD COLUMN magasin_id INTEGER DEFAULT 1;
```

### Migration initiale
1. Créer la table `magasins`
2. Insérer Maison Blanche : id=1, name="Maison Blanche", code="0002", store_password_hash=valeur de l'env var STORE_PASSWORD_HASH
3. Ajouter `magasin_id` à products avec DEFAULT 1
4. Tous les produits existants reçoivent automatiquement magasin_id=1

### Aucune suppression
- Aucun DELETE, DROP ou modification destructive
- Les données du surstock en cours restent intactes

---

## Authentification

### Login magasin (role=store)
1. Le frontend envoie `{ password: hash, role: 'store' }`
2. Le backend compare le hash à TOUS les `store_password_hash` de la table `magasins`
3. Si match trouvé → token créé avec `{ role: 'store', magasinId: magasin.id }`
4. Si aucun match → 401

### Login dépôt (role=depot)
- Inchangé : mot de passe global via env var DEPOT_PASSWORD_HASH
- Token : `{ role: 'depot', magasinId: null }`

### Login admin (role=admin)
- Inchangé : mot de passe global via env var ADMIN_PASSWORD_HASH
- Token : `{ role: 'admin', magasinId: null }`

### Token en mémoire
- Map change de `token → role` à `token → { role, magasinId }`
- Helper `getMagasinId(req)` extrait le magasinId du token
- `checkAuth` retourne `{ authenticated, role, magasinId }`

---

## Filtrage des données

### Magasin (role=store)
- `magasinId` injecté automatiquement depuis le token
- Tous les GET products filtrés par `WHERE magasin_id = ?`
- Le scan ne peut confirmer que les produits de son magasin (vérification backend)

### Dépôt (role=depot)
- Pas de `magasinId` dans le token
- Le frontend passe `magasinId` en query param (choisi sur l'écran de sélection)
- GET /api/depot/ean/:ean?magasin_id=X → filtre par magasin
- GET /api/products?magasin_id=X → filtre par magasin

### Admin (role=admin)
- Sélecteur de magasin dans le dashboard et la saisie
- `magasin_id` passé en query param
- Option "Tous les magasins" dans le dashboard (pas de filtre)

---

## API — Nouvelles routes magasins

### GET /api/magasins (requireAdmin)
Retourne la liste des magasins (id, name, code, created_at). Pas de hash dans la réponse.

### POST /api/magasins (requireAdmin)
Body : `{ name, code, password }`
- Hash SHA-256 du password côté serveur
- Vérifie unicité du code
- Retourne le magasin créé

### PUT /api/magasins/:id (requireAdmin)
Body : `{ name, code, password }`
- Si password vide → ne pas modifier le hash
- Vérifie unicité du code (exclure self)

### DELETE /api/magasins/:id (requireAdmin)
- Refuse si des produits existent pour ce magasin
- Refuse de supprimer id=1 (Maison Blanche, magasin par défaut)

---

## API — Modifications routes existantes

### GET /api/products
- Si role=store → filtre automatique par magasinId du token
- Si role=depot ou admin → filtre optionnel par query param `magasin_id`

### POST /api/products + POST /api/products/bulk
- Body doit inclure `magasin_id`
- Validation : le magasin doit exister

### GET /api/products/ean/:ean
- Si role=store → ajoute `AND magasin_id = ?` dans la requête
- Si role=depot → filtre par query param `magasin_id`

### GET /api/depot/ean/:ean
- Nouveau query param obligatoire : `magasin_id`
- Filtre : `AND magasin_id = ?`

### GET /api/dashboard/summary
- Query param optionnel `magasin_id`
- Si absent → tous les magasins (vue globale)
- Si présent → filtré

### PATCH /api/scan/:id/confirm
- Vérification : le produit appartient au magasin du token (si role=store)

---

## Frontend — Modifications

### App.jsx
- Stocker `magasinId` dans le state (retourné par checkAuth)
- Passer aux composants enfants
- Nouvelle route `/admin/magasins`

### Navbar.jsx
- Lien "Magasins" dans la section Admin

### AdminMagasins.jsx (NOUVEAU)
- Route : `/admin/magasins`
- Liste des magasins avec nom, code, date
- Formulaire ajout/modification (nom, code, mot de passe)
- Bouton supprimer avec confirmation (bloqué si produits liés)

### AdminInsert.jsx
- Sélecteur de magasin obligatoire en haut de page (dropdown)
- Tous les produits importés reçoivent le magasin_id sélectionné
- Le sélecteur est pré-rempli si un seul magasin existe

### AdminDashboard.jsx
- Sélecteur de magasin en haut (dropdown avec option "Tous les magasins")
- Les cartes résumé, totaux et tableau filtrés selon la sélection
- Exports (STKPERM, transfert, XLSX) filtrés par magasin sélectionné
- Le code CMAG dans les exports vient de la fiche magasin

### StoreList.jsx
- Passe `magasinId` (du token via App state) dans les requêtes API
- Aucun sélecteur visible — transparent pour le magasin

### DepotList.jsx
- Nouvel écran d'accueil : liste des magasins avec compteurs
  - Nom du magasin
  - Nombre de produits en attente de réception
  - Nombre de produits complets
- Clic sur un magasin → charge les produits filtrés
- Bouton retour pour revenir à la sélection
- Le scan vérifie que le produit appartient au magasin sélectionné

### AdminLogin.jsx
- Inchangé (le rôle suffit, le magasin vient du mot de passe)

### NotificationBell.jsx
- Inchangé (les notifications incluent déjà le nom du produit)

### Notifications backend
- Préfixer les messages par le nom du magasin : "Maison Blanche: Produit X — confirmé 5"

---

## SSE — Modifications

### Broadcast
- Tous les événements `product-updated` incluent `magasin_id` dans les données du produit (déjà le cas car on envoie l'objet produit complet)

### Frontend useLiveUpdates
- Si l'utilisateur est sur un magasin spécifique, ignorer les events des autres magasins
- Si l'admin est en vue "Tous", accepter tous les events

---

## Rétrocompatibilité

| Élément | Avant V2 | Après V2 |
|---------|----------|----------|
| Produits Maison Blanche | Pas de magasin_id | magasin_id = 1 |
| Mot de passe magasin | Env var STORE_PASSWORD_HASH | Table magasins (même hash) |
| Mot de passe dépôt | Env var DEPOT_PASSWORD_HASH | Inchangé (env var) |
| Mot de passe admin | Env var ADMIN_PASSWORD_HASH | Inchangé (env var) |
| Login "Maison Blanche" | Fonctionne | Fonctionne (même mot de passe) |
| Surstock en cours | Intact | Intact (magasin_id=1 ajouté) |
| Dashboard | Tous les produits | Sélecteur magasin, défaut "Tous" |

---

## Hors scope V2
- Historique / archivage par campagne
- Utilisateurs nominatifs
- Audit trail
- SMTP par magasin (config globale reste)
- PWA / mode hors ligne
