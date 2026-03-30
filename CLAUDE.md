# Surstock - Plateforme de Gestion de Surstock

## Description
Plateforme full-stack pour gérer les transferts de surstock entre l'entrepôt et le magasin "Maison Blanche". L'admin envoie une liste de produits avec des quantités demandées, le magasin scanne les produits (via douchette ou saisie manuelle) et confirme les quantités envoyées.

## Stack Technique
- **Backend** : Node.js + Express + sql.js (SQLite en JavaScript pur)
- **Frontend** : React 18 (Vite 6) + React Router 6
- **Base de données** : SQLite (fichier `backend/surstock.db`)
- **Déploiement** : Docker (docker-compose) sur VPS Linux

## Structure du Projet
```
Surstock/
├── CLAUDE.md
├── docker-compose.yml
├── backend/
│   ├── package.json
│   ├── server.js          # Point d'entrée Express (port 3001)
│   ├── db.js              # Connexion SQLite (sql.js) + init schema + helpers
│   └── routes/
│       ├── auth.js        # Login/logout/check token + middleware requireAdmin
│       ├── products.js    # CRUD produits (GET public, POST/DELETE admin)
│       ├── scan.js        # Confirmation scan (magasin, public)
│       └── dashboard.js   # Stats et résumé (admin)
├── frontend/
│   ├── package.json
│   ├── vite.config.js     # Proxy /api → localhost:3001
│   ├── index.html
│   └── src/
│       ├── main.jsx       # Point d'entrée React + BrowserRouter
│       ├── App.jsx        # Routes de l'application
│       ├── App.css        # Tous les styles (fichier unique)
│       ├── api.js         # Client API (fetch wrapper)
│       ├── pages/
│       │   ├── AdminLogin.jsx      # Page de connexion admin (mot de passe)
│       │   ├── AdminInsert.jsx     # Saisie produits (unitaire + import en masse)
│       │   ├── AdminDashboard.jsx  # Tableau de bord avec écarts
│       │   ├── StoreScan.jsx       # OBSOLÈTE - redirige vers StoreList
│       │   └── StoreList.jsx       # Liste produits + scan intégré (écoute clavier globale)
│       └── components/
│           └── Navbar.jsx          # Navigation (Magasin / Administration)
└── frontend/public/
```

## Commandes de développement
```bash
# Backend
cd backend && npm install && node server.js

# Frontend (dans un autre terminal)
cd frontend && npm install && npm run dev

# Alternative si npm run dev ne fonctionne pas (problème bash sur Windows)
cd frontend && node node_modules/vite/bin/vite.js --port 5173
```

## Ports
- Backend API : http://localhost:3001
- Frontend dev : http://localhost:5173 (proxy vers backend via vite.config.js)

## Base de données
Table unique `products` :
- `id` INTEGER PK AUTOINCREMENT
- `ean` TEXT NOT NULL (code-barres EAN) — indexé
- `parkod` TEXT NULL (code PARKOD interne)
- `label` TEXT NOT NULL (libellé produit)
- `qty_requested` INTEGER NOT NULL (quantité demandée)
- `qty_sent` INTEGER NULL (quantité envoyée, NULL = pas encore scanné)
- `scanned_at` TEXT NULL (date/heure du scan, format datetime localtime)
- `created_at` TEXT (date création, auto datetime localtime)

Note : migration automatique dans `db.js` — si la colonne `parkod` n'existe pas, elle est ajoutée via ALTER TABLE.

## Authentification
- Les routes admin (POST/DELETE products, dashboard) sont protégées par un token Bearer
- Le magasin (GET products, scan) est accessible sans authentification
- Login via `POST /api/auth/login` avec mot de passe → retourne un token stocké en sessionStorage
- Tokens en mémoire côté serveur (Set), perdus au redémarrage du backend
- Page de login affichée automatiquement quand on accède à une route `/admin/*` sans être connecté
- Bouton "Déconnexion" dans la navbar quand l'admin est connecté

## Routes API

### Auth (`/api/auth`)
- `POST /api/auth/login` — Connexion `{password}` → `{token}` (public)
- `POST /api/auth/logout` — Déconnexion (supprime le token)
- `GET /api/auth/check` — Vérifier si le token est valide

### Produits (`/api/products`)
- `GET /api/products?status=pending|confirmed` — Liste des produits (filtre optionnel)
- `GET /api/products/ean/:ean` — Chercher un produit non confirmé par EAN
- `POST /api/products` — Ajouter un produit `{ean, parkod?, label, qty_requested}`
- `POST /api/products/bulk` — Import en masse `{products: [{ean, parkod?, label, qty_requested}]}`
- `DELETE /api/products/:id` — Supprimer un produit
- `DELETE /api/products` — Supprimer tous les produits

### Scan (`/api/scan`)
- `PATCH /api/scan/:id/confirm` — Confirmer quantité `{qty_sent}`
- `PATCH /api/scan/:id/reset` — Remettre en attente

### Dashboard (`/api/dashboard`)
- `GET /api/dashboard/summary` — Résumé complet (totaux, écarts, liste enrichie avec `diff`)

## Routes Frontend
- `/` → redirige vers `/magasin/liste`
- `/magasin/liste` — Liste des produits + barre de scan intégrée (page principale magasin)
- `/magasin/scanner` → redirige vers `/magasin/liste`
- `/admin/saisie` — Saisie des produits (unitaire + import en masse)
- `/admin/tableau-de-bord` — Tableau de bord avec cartes résumé, totaux et détail des écarts

## Flux métier
1. L'admin saisit les produits (EAN, PARKOD optionnel, libellé, qté) via `/admin/saisie`
   - Saisie unitaire via formulaire
   - Import en masse par copier/coller : `EAN;PARKOD;Libellé;Quantité` ou `EAN;Libellé;Quantité`
2. Le magasin accède à `/magasin/liste` et voit tous les produits avec leur statut
3. Le magasin scanne un EAN ou PARKOD directement avec la douchette (écoute clavier globale, pas de champ de saisie)
   - La page capte les caractères envoyés par la douchette via un listener `keydown` global
   - À la réception du Enter (fin de scan), une modale s'ouvre avec les infos du produit et un champ quantité pré-rempli
   - La ligne du produit est mise en surbrillance dans le tableau
   - Le magasin confirme ou modifie la quantité envoyée
   - Timeout de 500ms pour vider le buffer en cas de frappes accidentelles
4. L'admin voit le tableau de bord sur `/admin/tableau-de-bord` avec les écarts (OK, sous, sur)

## Détails techniques
- **db.js** : helpers `queryAll`, `queryOne`, `run` — `run` sauvegarde automatiquement le fichier .db après chaque écriture
- **api.js** (frontend) : wrapper fetch avec base URL `/api`, gestion d'erreurs
- **CSS** : fichier unique `App.css`, design responsive (breakpoint 768px), palette bleue (#2c3e50, #3498db)
- **server.js** : sert aussi le frontend buildé (`frontend/dist`) en production avec fallback SPA

## Déploiement
- Développement local d'abord (Windows)
- Puis push sur Git
- Pull sur VPS Linux + Docker
