# Surstock - Plateforme de Gestion de Surstock

## Description
Plateforme full-stack multi-magasin pour gérer les transferts de surstock entre les magasins et le dépôt. L'admin envoie une liste de produits vers un magasin spécifique, le magasin scanne et confirme les quantités envoyées, le dépôt sélectionne un magasin puis scanne pour confirmer la réception (scan unitaire, chaque bip = +1).

## Stack Technique
- **Backend** : Node.js + Express + sql.js (SQLite en JavaScript pur)
- **Frontend** : React 18 (Vite 6) + React Router 6
- **Base de données** : SQLite (fichier persisté dans `/app/backend/data/surstock.db` en Docker)
- **Déploiement** : Docker + Traefik (HTTPS) sur VPS Linux
- **Sécurité** : Helmet, CORS restrictif, rate limiting, auth SHA-256
- **Email** : Nodemailer (SMTP Microsoft 365)
- **Temps réel** : Server-Sent Events (SSE) — mise à jour chirurgicale par produit
- **Scan caméra** : html5-qrcode (autofocus continu)

## Structure du Projet
```
Surstock/
├── CLAUDE.md
├── README.md
├── DEPLOY.md                # Instructions de déploiement VPS
├── roadmap.md               # Roadmap V1/V2/V3
├── Dockerfile               # Multi-stage build (frontend + backend)
├── docker-compose.yml       # Config Docker prod (Traefik)
├── docker-compose.local.yml # Config Docker test local (port 3002)
├── .gitignore
├── docs/superpowers/
│   ├── specs/               # Specs de design validées
│   └── plans/               # Plans d'implémentation
├── backend/
│   ├── package.json
│   ├── server.js            # Express + middlewares sécurité + SSE + CORS
│   ├── db.js                # SQLite + migrations auto (magasins, products, settings)
│   ├── email.js             # Nodemailer + chiffrement AES-256-GCM du mdp SMTP
│   ├── events.js            # SSE broadcast temps réel (product-updated, products-changed)
│   └── routes/
│       ├── auth.js          # Login multi-magasin + rôles + middlewares + getMagasinId/getRole
│       ├── magasins.js      # CRUD magasins (nom, code CMAG, mot de passe)
│       ├── products.js      # CRUD produits filtré par magasin_id + EAN padStart 13
│       ├── scan.js          # Confirmation magasin (qty_sent=0 auto-valide dépôt) + notif préfixée magasin
│       ├── depot.js         # Réception dépôt scan unitaire (+1) filtré par magasin_id + email + notif
│       ├── dashboard.js     # Stats admin filtrées par magasin_id optionnel
│       ├── settings.js      # Config SMTP (GET masqué, PUT chiffré, POST test)
│       └── notifications.js # Notifications in-memory (max 50) préfixées par nom magasin
├── frontend/
│   ├── package.json         # react, react-router-dom, xlsx, html5-qrcode
│   ├── vite.config.js       # Proxy /api → localhost:3001
│   ├── index.html           # Fonts Google (DM Sans, JetBrains Mono)
│   └── src/
│       ├── main.jsx         # Point d'entrée React + BrowserRouter
│       ├── App.jsx          # Routes + auth + magasinId/magasinName state
│       ├── App.css          # Styles responsive (1366/1024/768/380px), cards, toast, FAB, alerts
│       ├── api.js           # Client API (tous les endpoints avec magasin_id support)
│       ├── hooks/
│       │   └── useLiveUpdates.js  # Hook SSE filtré par magasinId
│       ├── pages/
│       │   ├── AdminLogin.jsx      # Login (admin/store/depot), hash SHA-256 côté client
│       │   ├── AdminInsert.jsx     # Saisie produits + sélecteur magasin obligatoire
│       │   ├── AdminDashboard.jsx  # Dashboard + filtre magasin + exports conditionnés
│       │   ├── AdminSettings.jsx   # Réglages SMTP (host, port, encryption, user, mdp, from, to)
│       │   ├── AdminMagasins.jsx   # CRUD magasins (nom, code CMAG, mot de passe)
│       │   ├── StoreList.jsx       # Magasin: scan + valider à 0 + impression (filtré auto par token)
│       │   ├── DepotList.jsx       # Dépôt: écran sélection magasin + scan unitaire + alerte plein écran
│       │   └── StoreScan.jsx       # OBSOLÈTE - redirige vers StoreList
│       └── components/
│           ├── Navbar.jsx            # Sous-titre dynamique selon rôle/magasin connecté
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

# Docker test local (port 3002)
docker compose -f docker-compose.local.yml up --build -d

# Docker production
docker compose up --build -d
```

## Ports
- Backend API : http://localhost:3001
- Frontend dev : http://localhost:5173
- Docker local : http://localhost:3002
- Production : https://sur-stock.myorigines.tech

## Base de données

Table `magasins` :
- `id` INTEGER PK AUTOINCREMENT
- `name` TEXT NOT NULL (nom du magasin, ex: "Maison Blanche")
- `code` TEXT NOT NULL UNIQUE (code CMAG pour exports, ex: "0002")
- `store_password_hash` TEXT NOT NULL (hash SHA-256 du mot de passe)
- `created_at` TEXT (auto)

Table `products` :
- `id` INTEGER PK AUTOINCREMENT
- `ean` TEXT NOT NULL — padStart(13, '0') à l'insertion et recherche
- `parkod` TEXT NULL (code PARKOD interne, 8 chars typiquement)
- `label` TEXT NOT NULL (format "CodeMarque - NomMarque - Libellé")
- `qty_requested` INTEGER NOT NULL
- `qty_sent` INTEGER NULL (NULL = pas encore envoyé par magasin)
- `scanned_at` TEXT NULL
- `qty_received` INTEGER NULL (NULL = pas encore reçu, incrémenté +1 par scan dépôt)
- `received_at` TEXT NULL
- `exported_at` TEXT NULL (tag "traité" pour l'admin)
- `magasin_id` INTEGER DEFAULT 1 (FK vers magasins)
- `created_at` TEXT (auto)

Table `settings` (clé-valeur pour config SMTP) :
- `key` TEXT PK
- `value` TEXT NOT NULL

Règles auto :
- `qty_requested = 0` à l'insertion → auto-valide magasin ET dépôt
- `qty_sent = 0` confirmé par magasin → auto-valide dépôt
- Maison Blanche (id=1) créé automatiquement à la migration depuis STORE_PASSWORD_HASH env var

## Authentification

### Multi-magasin
- **Le mot de passe identifie le magasin** — pas de sélecteur au login store
- Chaque magasin a son propre mot de passe dans la table `magasins`
- Le token porte `{ role, magasinId }` — magasinId est null pour admin et depot
- Login store : compare le hash à tous les `store_password_hash` de la table `magasins`

### Rôles
- `admin` : accès complet, mot de passe global via env var ADMIN_PASSWORD_HASH
- `store` : accès à ses produits uniquement (filtré auto par magasinId du token)
- `depot` : accès global, sélectionne le magasin manuellement, mot de passe global via env var DEPOT_PASSWORD_HASH

### Middlewares
- `requireAdmin` : admin uniquement
- `requireStore` : admin + store (pas depot)
- `requireDepot` : admin + depot (pas store)
- `requireAuth` : tous les rôles authentifiés
- `getMagasinId(req)` / `getRole(req)` : helpers pour extraire du token

### Sécurité
- Rate limiting : 10 tentatives login / 15 min
- CORS : `sur-stock.myorigines.tech`, `localhost:5173`, `localhost:3001`, `localhost:3002`
- Helmet : headers de sécurité
- Champ quantité magasin : max 4 chiffres, bloque les scans douchette accidentels

## Routes API

### Auth (`/api/auth`)
- `POST /login` — `{password, role}` → `{token, role, magasinId?, magasinName?}`
- `POST /logout`
- `GET /check` → `{authenticated, role, magasinId}`

### Magasins (`/api/magasins`)
- `GET /` — liste magasins (requireAuth — accessible store/depot/admin)
- `POST /` — créer `{name, code, password}` (requireAdmin, hash serveur)
- `PUT /:id` — modifier (requireAdmin, password optionnel)
- `DELETE /:id` — supprimer (requireAdmin, refuse si id=1 ou produits liés)

### Produits (`/api/products`)
- `GET /?status=...&magasin_id=X` (requireAuth, auto-filtré pour store)
- `GET /ean/:ean?magasin_id=X` (requireAuth, padStart 13)
- `POST /` — `{..., magasin_id}` (requireAdmin)
- `POST /bulk` — `{products, magasin_id}`, body limit 10mb (requireAdmin)
- `PATCH /export` — marquer traités `{ids}` (requireAdmin)
- `PATCH /unexport` — démarquer `{ids}` (requireAdmin)
- `DELETE /:id` / `DELETE /` (requireAdmin)

### Scan magasin (`/api/scan`)
- `PATCH /:id/confirm` — `{qty_sent}`, si 0 auto-valide dépôt (requireStore)
- `PATCH /:id/reset` (requireAdmin)

### Dépôt (`/api/depot`)
- `GET /ean/:ean?magasin_id=X` — produit envoyé non complètement reçu (requireDepot)
- `PATCH /:id/scan` — incrémente qty_received +1 (requireDepot)
- `PATCH /:id/reset` (requireAdmin)

### Dashboard (`/api/dashboard`)
- `GET /summary?magasin_id=X` — totaux + produits avec diff (requireAdmin)

### Settings (`/api/settings`)
- `GET /smtp` — config masquée (requireAdmin)
- `PUT /smtp` — `{host, port, encryption, user, password, from, to}` (requireAdmin)
- `POST /smtp/test` (requireAdmin)

### Notifications (`/api/notifications`)
- `GET /` / `PATCH /read` / `DELETE /` (requireAdmin)

### SSE (`/api/events`)
- `GET ?token=xxx` — events: product-updated (objet produit), products-changed (reload)

## Routes Frontend
- `/` → `/magasin/liste`
- `/magasin/liste` — scan + valider à 0 + impression + filtre marque (auth store)
- `/depot/liste` — sélection magasin → scan unitaire + caméra/manuel (auth depot)
- `/admin/saisie` — saisie + sélecteur magasin obligatoire (auth admin)
- `/admin/tableau-de-bord` — dashboard + filtre magasin (auth admin)
- `/admin/reglages` — config SMTP (auth admin)
- `/admin/magasins` — CRUD magasins (auth admin)

## Navbar dynamique
- **Store** : `SURSTOCK / {nom du magasin connecté}`
- **Dépôt** : `SURSTOCK / Dépôt`
- **Admin** : `SURSTOCK / Administration`
- **Non connecté** : `SURSTOCK`

## Tableau de bord admin
- Sélecteur magasin obligatoire pour STKPERM et Transfert
- Cartes résumé cliquables (filtrent automatiquement)
- Filtres : recherche, marque, statut général, date, statut dépôt, traité, magasin
- Couleurs : vert (tout OK), bleu (envoyé), orange (écart magasin), rouge (écart dépôt), gris (attente)
- Tooltip détail au survol des écarts
- Actions : annuler envoi/réception, marquer/démarquer traités

## Exports (requièrent un magasin sélectionné)

### STKPERM .md
- `UPDATE ARTMAG SET STKPERM = X WHERE CMAG = '{code_magasin}' AND CMARQ/CCATEG/CPROD`
- PARKOD : CMARQ = chars[0:3], CCATEG = chars[3:5], CPROD = chars[5:8]
- Avec réf XLSX (col G = PARKOD, col AN = STKPERM) : AN > 0 → valeur XLSX, sinon calcul
- Sans réf XLSX : STKPERM = qty_requested - qty_sent

### Transfert (format WinDev)
- `TT{du2}{au2}{parkod}{espaces}{qty}  ;{date};1600;{intitulé};;{codeDu};{codeAu}`
- codeDu = code CMAG du magasin sélectionné
- Nom fichier : `V{DDMMYY}{sequence}.000393`

### Export XLSX
- Colonnes : PARKOD (texte) + écart (valeur absolue)

## Dépôt — Fonctionnement
- Écran d'accueil : liste des magasins avec compteurs (en attente / complets)
- Clic → page scan filtrée par magasin
- Scan unitaire : chaque bip = +1 sur qty_received, pas de saisie de quantité
- Alerte plein écran rouge 3s si produit non trouvé dans la liste
- Email notification à chaque scan (si SMTP configuré)
- Bouton retour pour changer de magasin

## SSE — Temps réel
- Broadcast du produit complet (pas juste l'id) pour mise à jour chirurgicale
- Frontend filtre par magasinId — ignore les events d'autres magasins
- `products-changed` (ajout/suppression) → reload complet
- `product-updated` (scan) → update un seul produit dans le state
- Reconnexion auto après 5s si déconnexion

## Déploiement
- **URL** : https://sur-stock.myorigines.tech
- **VPS** : 51.254.132.46, user `debian`
- **Reverse proxy** : Traefik v2.11 sur réseau Docker `myorigines-network`
- **Certificat SSL** : Let's Encrypt automatique
- **IMPORTANT** : ne jamais casser les autres projets du VPS (23+ conteneurs)

### Mise à jour
```bash
git push origin main
ssh debian@51.254.132.46 "cd /home/debian/surstock && git pull && docker compose up --build -d"
```

## Variables d'environnement (docker-compose.yml)
- `DB_DIR` : dossier de la base SQLite
- `ADMIN_PASSWORD_HASH` : hash SHA-256 du mot de passe admin
- `STORE_PASSWORD_HASH` : hash SHA-256 du mot de passe Maison Blanche (migration initiale uniquement)
- `DEPOT_PASSWORD_HASH` : hash SHA-256 du mot de passe dépôt
- `SETTINGS_SECRET` : clé de chiffrement AES-256-GCM pour le mot de passe SMTP

## Mots de passe par défaut
- Admin : `@dm1n1str@t3uR!)`
- Maison Blanche : `Maison Blanche` (géré dans table magasins, pas en env var)
- Dépôt : `123456`
- Code validation "Valider à 0" (magasin) : `123456`
- Nouveaux magasins : mot de passe défini par l'admin via /admin/magasins
