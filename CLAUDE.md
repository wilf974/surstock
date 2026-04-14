# Surstock - Plateforme de Gestion de Surstock

## Description
Plateforme full-stack multi-magasin pour gérer les transferts de surstock entre l'entrepôt, les magasins et le dépôt. L'admin envoie une liste de produits vers un magasin spécifique, le magasin scanne et confirme les quantités envoyées, le dépôt sélectionne un magasin puis scanne pour confirmer la réception (scan unitaire, chaque bip = +1).

## Stack Technique
- **Backend** : Node.js + Express + sql.js (SQLite en JavaScript pur)
- **Frontend** : React 18 (Vite 6) + React Router 6
- **Base de données** : SQLite (fichier persisté dans `/app/backend/data/surstock.db` en Docker)
- **Déploiement** : Docker + Traefik (HTTPS) sur VPS Linux
- **Sécurité** : Helmet, CORS restrictif, rate limiting, auth SHA-256
- **Email** : Nodemailer (SMTP Microsoft 365)
- **Temps réel** : Server-Sent Events (SSE)
- **Scan camera** : html5-qrcode

## Structure du Projet
```
Surstock/
├── CLAUDE.md
├── README.md
├── DEPLOY.md              # Instructions de déploiement VPS
├── Dockerfile             # Multi-stage build (frontend + backend)
├── docker-compose.yml     # Config Docker + Traefik labels + env vars
├── .gitignore
├── backend/
│   ├── package.json
│   ├── server.js            # Express + middlewares sécurité + SSE endpoint
│   ├── db.js                # SQLite + migrations auto (parkod, qty_received, received_at, exported_at)
│   ├── email.js             # Nodemailer + chiffrement AES-256-GCM du mdp SMTP
│   ├── events.js            # Server-Sent Events broadcast temps réel
│   └── routes/
│       ├── auth.js          # Rôles admin/store/depot + middlewares requireAdmin/Store/Depot/Auth + checkToken
│       ├── products.js      # CRUD + bulk import + export/unexport (tag traité) + EAN padStart 13
│       ├── scan.js          # Confirmation magasin (qty_sent=0 auto-valide dépôt) + notifications
│       ├── depot.js         # Réception dépôt scan unitaire (+1 par scan) + email notif + notifications
│       ├── dashboard.js     # Stats admin (total, confirmés, pending, écarts, received, totalReceived)
│       ├── settings.js      # Config SMTP (GET masqué, PUT chiffré, POST test)
│       └── notifications.js # Notifications in-memory (max 50) + addNotification helper
├── frontend/
│   ├── package.json         # react, react-router-dom, xlsx, html5-qrcode
│   ├── vite.config.js       # Proxy /api → localhost:3001
│   ├── index.html           # Fonts Google (DM Sans, JetBrains Mono)
│   └── src/
│       ├── main.jsx         # Point d'entrée React + BrowserRouter
│       ├── App.jsx          # Routes + auth (rôles admin/store/depot) + isAdmin/isStore/isDepot
│       ├── App.css          # Styles responsive, cards mobile, hamburger menu, toast, FAB caméra
│       ├── api.js           # Client API (fetch wrapper, token auth_token, tous les endpoints)
│       ├── hooks/
│       │   └── useLiveUpdates.js  # Hook SSE pour mise à jour temps réel
│       ├── pages/
│       │   ├── AdminLogin.jsx      # Login (admin/store/depot), hash SHA-256 côté client
│       │   ├── AdminInsert.jsx     # Saisie produits (unitaire + copier/coller + import XLSX 5 colonnes)
│       │   ├── AdminDashboard.jsx  # Tableau de bord complet (voir détails ci-dessous)
│       │   ├── AdminSettings.jsx   # Réglages SMTP (host, port, encryption, user, mdp, from, to)
│       │   ├── AdminMagasins.jsx   # CRUD magasins (nom, code CMAG, mot de passe)
│       │   ├── StoreList.jsx       # Magasin: scan douchette/caméra/manuel + valider à 0 + impression (filtré par magasinId)
│       │   ├── DepotList.jsx       # Dépôt: sélection magasin + scan unitaire (+1 par bip) + caméra/manuel
│       │   └── StoreScan.jsx       # OBSOLÈTE - redirige vers StoreList
│       └── components/
│           ├── Navbar.jsx            # Hamburger mobile, sections Magasin/Dépôt/Admin, déconnexion
│           ├── CameraScanner.jsx     # Scanner caméra (autofocus continu, tous formats barcode)
│           ├── NotificationBell.jsx  # Cloche notifications admin (polling 10s, dropdown)
│           └── Toast.jsx             # Toast fixe en bas d'écran (succès/erreur/warning)
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
```

## Ports
- Backend API : http://localhost:3001
- Frontend dev : http://localhost:5173
- Production : https://sur-stock.myorigines.tech

## Base de données
Table `products` :
- `id` INTEGER PK AUTOINCREMENT
- `ean` TEXT NOT NULL — padStart(13, '0') à l'insertion et recherche
- `parkod` TEXT NULL (code PARKOD interne, 8 chars typiquement)
- `label` TEXT NOT NULL (format "CodeMarque - NomMarque - Libellé")
- `qty_requested` INTEGER NOT NULL
- `qty_sent` INTEGER NULL (NULL = pas encore envoyé par magasin)
- `scanned_at` TEXT NULL
- `qty_received` INTEGER NULL (NULL = pas encore reçu par dépôt, incrémenté +1 par scan)
- `received_at` TEXT NULL
- `exported_at` TEXT NULL (tag "traité" pour l'admin)
- `created_at` TEXT (auto)

- `magasin_id` INTEGER DEFAULT 1 (FK vers magasins)

Table `magasins` :
- `id` INTEGER PK AUTOINCREMENT
- `name` TEXT NOT NULL (nom du magasin)
- `code` TEXT NOT NULL UNIQUE (code CMAG, ex: '0002')
- `store_password_hash` TEXT NULL (hash SHA-256 du mot de passe magasin)
- `created_at` TEXT (auto)

Table `settings` (clé-valeur pour config SMTP) :
- `key` TEXT PK
- `value` TEXT NOT NULL

Règles auto :
- `qty_requested = 0` à l'insertion → auto-valide magasin ET dépôt
- `qty_sent = 0` confirmé par magasin → auto-valide dépôt

## Authentification
- **3 rôles** : `admin`, `store`, `depot`
- Mots de passe hashés SHA-256 côté client avant envoi
- Hashs de référence via env vars : `ADMIN_PASSWORD_HASH`, `STORE_PASSWORD_HASH`, `DEPOT_PASSWORD_HASH`
- Tokens en mémoire (Map token → rôle), perdus au redémarrage
- Rate limiting : 10 tentatives login / 15 min
- `requireAdmin` : admin uniquement
- `requireStore` : admin + store (pas depot)
- `requireDepot` : admin + depot (pas store)
- `requireAuth` : tous les rôles authentifiés (pour GET products)

## Routes API

### Auth (`/api/auth`)
- `POST /login` — `{password, role}` → `{token, role, magasinId?, magasinName?}` (store login retourne magasinId)
- `POST /logout`
- `GET /check` → `{authenticated, role, magasinId?}`

### Produits (`/api/products`)
- `GET /?status=pending|confirmed|awaiting_receipt|received&magasin_id=X` (requireAuth, auto-filtré pour store)
- `GET /ean/:ean` (requireAuth, padStart 13)
- `POST /` — ajout unitaire `{..., magasin_id}` (requireAdmin)
- `POST /bulk` — import en masse `{products, magasin_id}`, body limit 10mb (requireAdmin)
- `PATCH /export` — marquer traités `{ids}` (requireAdmin)
- `PATCH /unexport` — démarquer `{ids}` (requireAdmin)
- `DELETE /:id` (requireAdmin)
- `DELETE /` — tout supprimer (requireAdmin)

### Scan magasin (`/api/scan`)
- `PATCH /:id/confirm` — `{qty_sent}`, si 0 auto-valide dépôt (requireStore)
- `PATCH /:id/reset` (requireAdmin)

### Magasins (`/api/magasins`)
- `GET /` — liste tous les magasins (requireAuth)
- `POST /` — créer `{name, code, password}` (requireAdmin)
- `PUT /:id` — modifier `{name, code, password?}` (requireAdmin)
- `DELETE /:id` — supprimer (requireAdmin, échoue si produits existent)

### Dépôt (`/api/depot`)
- `GET /ean/:ean?magasin_id=X` — cherche produit envoyé non complètement reçu (requireDepot)
- `PATCH /:id/scan` — incrémente qty_received +1 (requireDepot)
- `PATCH /:id/reset` (requireAdmin)

### Dashboard (`/api/dashboard`)
- `GET /summary?magasin_id=X` — totaux + tous les produits avec diff (requireAdmin)

### Settings (`/api/settings`)
- `GET /smtp` — config masquée (requireAdmin)
- `PUT /smtp` — sauvegarder `{host, port, encryption, user, password, from, to}` (requireAdmin)
- `POST /smtp/test` — envoyer email de test (requireAdmin)

### Notifications (`/api/notifications`)
- `GET /` — liste in-memory max 50 (requireAdmin)
- `PATCH /read` — tout marquer lu (requireAdmin)
- `DELETE /` — tout effacer (requireAdmin)

### SSE (`/api/events`)
- `GET ?token=xxx` — flux temps réel, events: product-updated, products-changed

## Routes Frontend
- `/` → `/magasin/liste`
- `/magasin/liste` — scan douchette/caméra/manuel + valider à 0 + impression + filtre marque (auth store)
- `/depot/liste` — sélection magasin + réception scan unitaire + caméra/manuel + filtre marque (auth depot)
- `/admin/saisie` — saisie produits + sélecteur magasin + import XLSX + live update (auth admin)
- `/admin/tableau-de-bord` — dashboard complet + filtre magasin (auth admin)
- `/admin/reglages` — config SMTP (auth admin)
- `/admin/magasins` — CRUD magasins (auth admin)

## Tableau de bord admin — Détails
- Cartes résumé : total, envoyés, en attente, écart magasin, réceptionnés, écart dépôt
- Totaux : demandé, envoyé, reçu, écart global
- **Filtres** : recherche texte, marque, statut général (tout OK/envoyé/attente/écart mag/écart dépôt), date, statut dépôt (réceptionnés/en cours/non reçus/écart), traité (tous/non traités/traités)
- **Couleurs lignes** : vert (tout OK), bleu (envoyé attente dépôt), orange (écart magasin), rouge (écart dépôt), gris (en attente)
- **Tooltip** au survol des lignes en écart avec détail chiffré
- **Légende** visuelle
- **Actions** : annuler envoi, annuler réception, marquer/démarquer traités
- **Exports** : XLSX (PARKOD + écart), STKPERM .md (avec import réf XLSX auto), fichier transfert (format WinDev)

## Export STKPERM
- Génère des requêtes SQL `UPDATE ARTMAG SET STKPERM = X WHERE CMAG = '{code_magasin}' AND CMARQ/CCATEG/CPROD`
- PARKOD décomposé : CMARQ = 3 premiers chars, CCATEG = 2 suivants, CPROD = 3 restants
- **Avec réf XLSX** (bouton "Charger réf. XLSX") : colonne G = PARKOD 8 chars, colonne AN = STKPERM
  - Si AN > 0 → STKPERM = valeur du XLSX
  - Si AN = 0 → STKPERM = qty_requested - qty_sent
- **Sans réf XLSX** : STKPERM = qty_requested - qty_sent

## Export Transfert
- Format fichier WinDev : `TT{du2}{au2}{parkod}{espaces}{qty}  ;{date};1600;{intitulé};;{codeDu};{codeAu}`
- Espaces quantité : <10 = 3 espaces, <100 = 2 espaces, >=100 = 0
- Nom fichier : `V{DDMMYY}{sequence}.000393`
- Paramètres configurables : code source (0002), destination (0000), intitulé (ST.MB), séquence (01, 02...)

## Déploiement
- **URL** : https://sur-stock.myorigines.tech
- **VPS** : 51.254.132.46, user `debian`
- **Reverse proxy** : Traefik v2.11 sur réseau Docker `myorigines-network`
- **Certificat SSL** : Let's Encrypt automatique via Traefik
- **IMPORTANT** : ne jamais casser les autres projets du VPS (23+ conteneurs)

### Mise à jour
```bash
git push origin main
ssh debian@51.254.132.46 "cd /home/debian/surstock && git pull && docker compose up --build -d"
```

## Variables d'environnement (docker-compose.yml)
- `DB_DIR` : dossier de la base SQLite
- `ADMIN_PASSWORD_HASH` : hash SHA-256 du mot de passe admin
- `STORE_PASSWORD_HASH` : hash SHA-256 du mot de passe magasin (Maison Blanche)
- `DEPOT_PASSWORD_HASH` : hash SHA-256 du mot de passe dépôt (123456)
- `SETTINGS_SECRET` : clé de chiffrement AES-256-GCM pour le mot de passe SMTP

## Mots de passe
- Admin : `@dm1n1str@t3uR!)`
- Magasin : `Maison Blanche`
- Dépôt : `123456`
- Code validation "Valider à 0" : `123456`
