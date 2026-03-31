# Surstock - Plateforme de Gestion de Surstock

## Description
Plateforme full-stack pour gérer les transferts de surstock entre l'entrepôt et le magasin "Maison Blanche". L'admin envoie une liste de produits avec des quantités demandées, le magasin scanne les produits (via douchette ou saisie manuelle) et confirme les quantités envoyées.

## Stack Technique
- **Backend** : Node.js + Express + sql.js (SQLite en JavaScript pur)
- **Frontend** : React 18 (Vite 6) + React Router 6
- **Base de données** : SQLite (fichier persisté dans `/app/backend/data/surstock.db` en Docker)
- **Déploiement** : Docker + Traefik (HTTPS) sur VPS Linux
- **Sécurité** : Helmet, CORS restrictif, rate limiting, auth SHA-256

## Structure du Projet
```
Surstock/
├── CLAUDE.md
├── DEPLOY.md            # Instructions de déploiement VPS
├── Dockerfile           # Multi-stage build (frontend + backend)
├── docker-compose.yml   # Config Docker + Traefik labels
├── .gitignore
├── backend/
│   ├── package.json
│   ├── server.js          # Point d'entrée Express (port 3001) + helmet + cors + rate limit
│   ├── db.js              # Connexion SQLite (sql.js) + init schema + helpers (DB_DIR configurable)
│   └── routes/
│       ├── auth.js        # Login/logout/check + rôles admin/store + middleware requireAdmin/requireStore
│       ├── products.js    # CRUD produits (GET store, POST/DELETE admin) + auto-validation qty=0
│       ├── scan.js        # Confirmation scan (magasin, protégé store)
│       ├── dashboard.js   # Stats et résumé (admin)
│       └── notifications.js # Notifications in-memory (max 50) — admin only
├── frontend/
│   ├── package.json       # Dépendances: react, react-router-dom, xlsx
│   ├── vite.config.js     # Proxy /api → localhost:3001
│   ├── index.html         # Fonts Google (DM Sans, JetBrains Mono)
│   └── src/
│       ├── main.jsx       # Point d'entrée React + BrowserRouter
│       ├── App.jsx        # Routes + gestion auth (rôles admin/store)
│       ├── App.css        # Tous les styles — responsive, cards mobile, hamburger menu
│       ├── api.js         # Client API (fetch wrapper, token auth_token)
│       ├── pages/
│       │   ├── AdminLogin.jsx      # Page de connexion (admin ou store, hash SHA-256 côté client)
│       │   ├── AdminInsert.jsx     # Saisie produits (unitaire + copier/coller + import XLSX 5 colonnes)
│       │   ├── AdminDashboard.jsx  # Tableau de bord + export XLSX (PARKOD + écart)
│       │   ├── StoreScan.jsx       # OBSOLÈTE - redirige vers StoreList
│       │   └── StoreList.jsx       # Liste produits + scan douchette + bouton "Valider à 0" (code 123456)
│       └── components/
│           ├── Navbar.jsx          # Navigation hamburger mobile + liens Magasin/Admin + déconnexion
│           └── NotificationBell.jsx # Cloche notifications (polling 10s, dropdown, admin only)
└── frontend/public/
```

## Commandes de développement
```bash
# Backend
cd backend && npm install && node server.js

# Frontend (dans un autre terminal)
cd frontend && npm install && npm run dev

# Docker (production locale)
docker compose up --build -d

# Alternative si npm run dev ne fonctionne pas (problème bash sur Windows)
cd frontend && node node_modules/vite/bin/vite.js --port 5173
```

## Ports
- Backend API : http://localhost:3001
- Frontend dev : http://localhost:5173 (proxy vers backend via vite.config.js)
- Production : https://sur-stock.myorigines.tech (via Traefik)

## Base de données
Table unique `products` :
- `id` INTEGER PK AUTOINCREMENT
- `ean` TEXT NOT NULL (code-barres EAN) — indexé
- `parkod` TEXT NULL (code PARKOD interne)
- `label` TEXT NOT NULL (libellé produit, format "Marque - Libellé")
- `qty_requested` INTEGER NOT NULL (quantité demandée)
- `qty_sent` INTEGER NULL (quantité envoyée, NULL = pas encore scanné)
- `scanned_at` TEXT NULL (date/heure du scan, format datetime localtime)
- `created_at` TEXT (date création, auto datetime localtime)

Note : migration automatique dans `db.js` — si la colonne `parkod` n'existe pas, elle est ajoutée via ALTER TABLE.
Note : si `qty_requested` = 0 à l'insertion, le produit est auto-validé (`qty_sent` = 0, `scanned_at` rempli).

## Authentification
- **Deux rôles** : `admin` et `store`
- Le mot de passe est hashé en SHA-256 côté frontend avant envoi (pas visible dans F12)
- Les hashs de référence sont dans les variables d'environnement `ADMIN_PASSWORD_HASH` et `STORE_PASSWORD_HASH`
- Tokens en mémoire côté serveur (Map : token → rôle), perdus au redémarrage du backend
- Routes admin protégées par `requireAdmin` (rôle admin uniquement)
- Routes magasin protégées par `requireStore` (rôle admin OU store)
- Rate limiting : 10 tentatives de login max par 15 minutes
- Page de login affichée automatiquement selon la route et le rôle requis

## Routes API

### Auth (`/api/auth`)
- `POST /api/auth/login` — Connexion `{password, role}` → `{token, role}` (public, rate limité)
- `POST /api/auth/logout` — Déconnexion (supprime le token)
- `GET /api/auth/check` — Vérifier si le token est valide → `{authenticated, role}`

### Produits (`/api/products`)
- `GET /api/products?status=pending|confirmed` — Liste des produits (protégé store)
- `GET /api/products/ean/:ean` — Chercher un produit non confirmé par EAN (protégé store)
- `POST /api/products` — Ajouter un produit `{ean, parkod?, label, qty_requested}` (protégé admin)
- `POST /api/products/bulk` — Import en masse `{products: [...]}` (protégé admin, body limit 10mb)
- `DELETE /api/products/:id` — Supprimer un produit (protégé admin)
- `DELETE /api/products` — Supprimer tous les produits (protégé admin)

### Scan (`/api/scan`)
- `PATCH /api/scan/:id/confirm` — Confirmer quantité `{qty_sent}` (protégé store)
- `PATCH /api/scan/:id/reset` — Remettre en attente (protégé store)

### Dashboard (`/api/dashboard`)
- `GET /api/dashboard/summary` — Résumé complet (protégé admin)

### Notifications (`/api/notifications`)
- `GET /api/notifications` — Liste des notifications in-memory (admin only)
- `PATCH /api/notifications/read` — Marquer toutes comme lues
- `DELETE /api/notifications` — Effacer toutes les notifications

## Routes Frontend
- `/` → redirige vers `/magasin/liste`
- `/magasin/liste` — Liste des produits + scan douchette + bouton "Valider à 0" (auth store requise)
- `/magasin/scanner` → redirige vers `/magasin/liste`
- `/admin/saisie` — Saisie produits (unitaire + copier/coller + XLSX) (auth admin requise)
- `/admin/tableau-de-bord` — Tableau de bord + export XLSX (auth admin requise)

## Flux métier
1. L'admin saisit les produits via `/admin/saisie`
   - Saisie unitaire : EAN, PARKOD, Marque, Libellé, Quantité
   - Import copier/coller : `EAN;PARKOD;Libellé;Quantité`
   - Import XLSX : 5 colonnes (EAN, PARKOD, Marque, Libellé, Quantité) sans en-tête
   - Les produits avec quantité = 0 sont automatiquement validés
2. Le magasin se connecte avec le mot de passe store sur `/magasin/liste`
3. Le magasin scanne un EAN ou PARKOD avec la douchette (écoute clavier globale)
   - Modale de confirmation avec quantité pré-remplie
   - Bouton "Valider à 0" par ligne avec code de sécurité (123456)
   - Timeout de 500ms pour vider le buffer en cas de frappes accidentelles
4. L'admin voit le tableau de bord avec les écarts et peut exporter en XLSX

## Détails techniques
- **db.js** : helpers `queryAll`, `queryOne`, `run` — `run` sauvegarde automatiquement le fichier .db après chaque écriture. `DB_DIR` env var pour configurer le dossier de la DB.
- **api.js** (frontend) : wrapper fetch avec base URL `/api`, token `auth_token` en sessionStorage
- **CSS** : fichier unique `App.css`, design responsive avec cards mobiles (breakpoint 768px), hamburger menu, modals plein écran sur mobile. Fonts: DM Sans + JetBrains Mono. Palette: navy (#1a2332), blue (#2d7dd2).
- **server.js** : Express + helmet + CORS restrictif + rate limiting + sert le frontend buildé en production
- **Export XLSX** : colonne PARKOD forcée en texte, écart en valeur absolue, sans en-tête

## Déploiement
- **URL** : https://sur-stock.myorigines.tech
- **VPS** : 51.254.132.46, user `debian`
- **Reverse proxy** : Traefik v2.11 sur réseau Docker `myorigines-network`
- **Certificat SSL** : Let's Encrypt automatique via Traefik
- **Port** : 3001 interne uniquement (expose, pas ports)
- **Volume** : `surstock-data` → `/app/backend/data` (persistance DB)
- **IMPORTANT** : ne jamais casser les autres projets du VPS (23+ conteneurs)

### Mise à jour
```bash
# Depuis le poste local
git push origin main

# Sur le VPS
ssh debian@51.254.132.46
cd /home/debian/surstock
git pull
docker compose up --build -d
```

## Variables d'environnement (docker-compose.yml)
- `DB_DIR` : dossier de la base SQLite (défaut: `__dirname`)
- `ADMIN_PASSWORD_HASH` : hash SHA-256 du mot de passe admin
- `STORE_PASSWORD_HASH` : hash SHA-256 du mot de passe magasin
