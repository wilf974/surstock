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
│       ├── App.jsx          # Routes + auth + magasinId/magasinName state (sessionStorage)
│       ├── App.css          # Styles responsive (1366/1024/768/380px), cards, toast, FAB, alerts
│       ├── api.js           # Client API (fetch wrapper, Bearer token, tous les endpoints)
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

## Docker

### Dockerfile (multi-stage)
1. **Stage 1** — Frontend build : `node:20-alpine`, `npm install` + `npm run build` → `/app/frontend/dist`
2. **Stage 2** — Backend + serve : `node:20-alpine`, `npm install --production` backend, copie du dist frontend, expose port 3001, `node backend/server.js`

### docker-compose.yml (production)
- Container `surstock`, expose 3001, Traefik labels pour HTTPS
- Volume `surstock-data:/app/backend/data` (persistance BDD)
- Réseau `myorigines-network` (externe, partagé avec Traefik)

### docker-compose.local.yml (test local)
- Container `surstock-local`, ports `3002:3001`
- Volume `surstock-local-data:/app/backend/data` (séparé de la prod)
- Mêmes env vars que prod

## Base de données

### Table `magasins`
- `id` INTEGER PK AUTOINCREMENT
- `name` TEXT NOT NULL (nom du magasin, ex: "Maison Blanche")
- `code` TEXT NOT NULL UNIQUE (code CMAG pour exports, ex: "0002")
- `store_password_hash` TEXT NOT NULL (hash SHA-256 du mot de passe)
- `created_at` TEXT DEFAULT (datetime('now', 'localtime'))

### Table `products`
- `id` INTEGER PK AUTOINCREMENT
- `ean` TEXT NOT NULL — padStart(13, '0') à l'insertion et recherche
- `parkod` TEXT DEFAULT NULL (code PARKOD interne, 8 chars typiquement)
- `label` TEXT NOT NULL (format "CodeMarque - NomMarque - Libellé")
- `qty_requested` INTEGER NOT NULL DEFAULT 0
- `qty_sent` INTEGER DEFAULT NULL (NULL = pas encore envoyé par magasin)
- `scanned_at` TEXT DEFAULT NULL
- `qty_received` INTEGER DEFAULT NULL (NULL = pas encore reçu, incrémenté +1 par scan dépôt)
- `received_at` TEXT DEFAULT NULL
- `exported_at` TEXT DEFAULT NULL (tag "traité" pour l'admin)
- `magasin_id` INTEGER DEFAULT 1 (FK vers magasins)
- `created_at` TEXT DEFAULT (datetime('now', 'localtime'))
- Index : `idx_products_ean` sur products(ean)

### Table `settings` (clé-valeur pour config SMTP)
- `key` TEXT PK
- `value` TEXT NOT NULL

### Migrations auto (db.js, try/catch pour idempotence)
1. `ALTER TABLE products ADD COLUMN parkod TEXT DEFAULT NULL`
2. `ALTER TABLE products ADD COLUMN qty_received INTEGER DEFAULT NULL`
3. `ALTER TABLE products ADD COLUMN received_at TEXT DEFAULT NULL`
4. `ALTER TABLE products ADD COLUMN exported_at TEXT DEFAULT NULL`
5. `ALTER TABLE products ADD COLUMN magasin_id INTEGER DEFAULT 1`
6. `UPDATE products SET qty_received = 0, received_at = scanned_at WHERE qty_sent = 0 AND qty_received IS NULL`

### Seeding auto
- Si table `magasins` vide → INSERT Maison Blanche (id=1, code='0002', hash depuis env var STORE_PASSWORD_HASH)

### Règles auto
- `qty_requested = 0` à l'insertion → auto-valide magasin ET dépôt (qty_sent=0, qty_received=0)
- `qty_sent = 0` confirmé par magasin → auto-valide dépôt (qty_received=0)

### Helpers db.js
- `queryAll(sql, params)` → tableau d'objets
- `queryOne(sql, params)` → objet ou null
- `run(sql, params)` → `{ lastInsertRowid, changes }`
- `saveDb()` → export vers fichier
- `getDb()` → lazy-load + init

## Authentification

### Multi-magasin
- **Le mot de passe identifie le magasin** — pas de sélecteur au login store
- Chaque magasin a son propre mot de passe dans la table `magasins`
- Le frontend hash le mot de passe en SHA-256 avant envoi
- Login store : compare le hash reçu directement à tous les `store_password_hash` de la table `magasins` (pas de double hash)
- Le token porte `{ role, magasinId }` — magasinId est null pour admin et depot
- Token stocké dans `sessionStorage` (clés: `auth_token`, `auth_role`, `auth_magasin_name`)

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
- `POST /` — créer `{name, code, password}` (requireAdmin, hash côté serveur)
- `PUT /:id` — modifier `{name, code, password?}` (requireAdmin, password optionnel)
- `DELETE /:id` — supprimer (requireAdmin, refuse si id=1 ou produits liés)

### Produits (`/api/products`)
- `GET /?status=pending|confirmed|awaiting_receipt|received&magasin_id=X` (requireAuth, auto-filtré pour store via token)
- `GET /ean/:ean?magasin_id=X` (requireAuth, padStart 13)
- `POST /` — ajout unitaire `{ean, parkod, label, qty_requested, magasin_id}` (requireAdmin)
- `POST /bulk` — import en masse `{products: [...], magasin_id}`, body limit 10mb (requireAdmin)
- `PATCH /export` — marquer traités `{ids: [...]}` (requireAdmin)
- `PATCH /unexport` — démarquer `{ids: [...]}` (requireAdmin)
- `DELETE /:id` — supprimer un produit (requireAdmin)
- `DELETE /` — tout supprimer (requireAdmin)

### Scan magasin (`/api/scan`)
- `PATCH /:id/confirm` — `{qty_sent}`, si 0 auto-valide dépôt (requireStore)
- `PATCH /:id/reset` — annuler l'envoi (requireAdmin)

### Dépôt (`/api/depot`)
- `GET /ean/:ean?magasin_id=X` — produit envoyé non complètement reçu (requireDepot)
- `PATCH /:id/scan` — incrémente qty_received +1 (requireDepot)
- `PATCH /:id/reset` — annuler la réception (requireAdmin)

### Dashboard (`/api/dashboard`)
- `GET /summary?magasin_id=X` — totaux + tous les produits avec diff (requireAdmin)

### Settings (`/api/settings`)
- `GET /smtp` — config masquée, mot de passe retourné comme '****' (requireAdmin)
- `PUT /smtp` — `{host, port, encryption, user, password, from, to}` (requireAdmin, chiffrement AES-256-GCM)
- `POST /smtp/test` — envoyer email de test (requireAdmin)

### Notifications (`/api/notifications`)
- `GET /` — liste in-memory max 50 (requireAdmin)
- `PATCH /read` — tout marquer lu (requireAdmin)
- `DELETE /` — tout effacer (requireAdmin)

### SSE (`/api/events`)
- `GET ?token=xxx` — flux temps réel
- Events : `product-updated` (objet produit complet), `products-changed` (signal reload)

## Routes Frontend
- `/` → `/magasin/liste`
- `/magasin/liste` — scan douchette/caméra/manuel + valider à 0 + impression + filtre marque (auth store)
- `/depot/liste` — sélection magasin → scan unitaire + caméra/manuel + filtre marque (auth depot)
- `/admin/saisie` — saisie produits + sélecteur magasin obligatoire + import XLSX (auth admin)
- `/admin/tableau-de-bord` — dashboard complet + filtre magasin + exports (auth admin)
- `/admin/reglages` — config SMTP (auth admin)
- `/admin/magasins` — CRUD magasins (auth admin)

## Navbar dynamique
- **Store** : `SURSTOCK / {nom du magasin connecté}`
- **Dépôt** : `SURSTOCK / Dépôt`
- **Admin** : `SURSTOCK / Administration`
- **Non connecté** : `SURSTOCK`

## Page Magasin (StoreList.jsx)

### Modes de scan
1. **Douchette** : détection auto sur touche Enter dans le champ EAN
2. **Caméra** : bouton FAB → composant CameraScanner (autofocus continu, tous formats barcode)
3. **Saisie manuelle** : input texte + submit

### Traitement du scan (processScannedCode)
- EAN paddé à 13 chiffres : `code.trim().padStart(13, '0')`
- Recherche dans les produits : match sur `p.ean === ean || p.parkod === ean`
- Ne matche que les produits en attente (`qty_sent === null`)
- Détecte les produits déjà confirmés avec message warning
- Auto-focus sur le champ quantité après sélection

### Modal de confirmation
- Affiche : nom produit, EAN, PARKOD (si présent), quantité demandée
- Input : "Quantité envoyée" (number, 0-9999, max 4 chiffres)
- Calcul diff : `parseInt(qtySent) - qty_requested`
- Texte diff : "(quantité exacte)" si 0, "(X de moins)" si négatif, "(+X de plus)" si positif
- Confirme via `api.confirmScan(id, qty_sent)`

### Valider à 0
- Fonction `openZeroModal(product)` pour produits en attente
- Code de validation requis : `123456`
- Erreur si mauvais code : "Code incorrect"
- Succès : appelle `api.confirmScan(product.id, 0)` → auto-valide dépôt
- Modal rendu via `createPortal` vers `document.body`

### Filtres
- Boutons : 'all', 'pending', 'confirmed'
- Sélecteur marque : extraite du label après ' - '
- Scroll infini : page size 100, trigger sur intersection sentinel

### Impression
- Colonnes : EAN, PARKOD, Libellé, Qté
- Style : Arial 12px, border-collapse, 11px font pour th/td
- Titre : "Liste des produits — Surstock ({count} produits)"

## Page Dépôt (DepotList.jsx)

### Écran sélection magasin (état initial)
- Cartes pour chaque magasin
- Affichage : nom magasin (grand), compteur en attente + compteur complets
- Clic → entre en mode scan pour ce magasin

### Scan unitaire
- Même logique EAN que StoreList (`padStart(13, '0')`)
- API : `api.getDepotProductByEan(ean, magasinId)` (logique priorité côté serveur)
- Auto-scan : `api.scanDepot(product.id)` → incrémente qty_received +1
- Pas de modal de saisie de quantité — chaque bip = +1
- Affichage restant : `qty_sent - qty_received`

### Alertes
- **409** : produit déjà complètement reçu (warning)
- **400** : produit pas encore envoyé par le magasin (alerte)
- **404** : produit non trouvé → **alerte plein écran rouge** (icône "!", texte centré, auto-dismiss 3s)

### Badges de statut
- "En cours (X/Y)" : réception partielle
- "Complet" : qty_received = qty_sent
- "Écart" : qty_received > qty_sent (sur-réception)

### Filtres
- 'all' : tous les produits confirmés
- 'awaiting_receipt' : qty_received < qty_sent
- 'received' : qty_received = qty_sent
- Sélecteur marque

### Email notification
- Envoi automatique à chaque scan (si SMTP configuré, côté backend)
- Bouton retour pour changer de magasin

## Page Saisie Admin (AdminInsert.jsx)

### Sélecteur magasin (obligatoire)
- Champ requis sur tous les modes d'import
- Affiche `magasin.name (magasin.code)`
- Auto-sélection si un seul magasin existe
- Chargé via `api.getMagasins()` au mount

### Mode unitaire
- Champs : EAN, PARKOD, Marque, Libellé, Quantité
- Construction label : `marque ? '${marque} - ${label}' : label`
- API : `api.addProduct({ ean, parkod, label, qty_requested, magasin_id })`

### Mode copier-coller (bulk)
- Séparateurs acceptés : `;` ou tabulation
- Format 4 champs : `EAN;PARKOD;Libellé;Quantité`
- Format 3 champs : `EAN;Libellé;Quantité` (sans PARKOD)
- Parsing : `line.split(/[;\t]/)`
- API : `api.addProductsBulk(items, magasinId)`

### Mode import XLSX
- Input file : `.xlsx, .xls`
- Lecture : `XLSX.read(data)` → première feuille → `sheet_to_json(sheet, { header: 1, raw: false })`
- **Format 5 colonnes** : [0]=EAN, [1]=PARKOD, [2]=Marque, [3]=Libellé, [4]=Quantité
- **Format 4 colonnes** : [0]=EAN, [1]=PARKOD, [2]=Libellé, [4]=Quantité
- Construction label : `marque ? '${marque} - ${label}' : label`
- API : `api.addProductsBulk(items, magasinId)`

## Tableau de bord admin (AdminDashboard.jsx)

### Sélecteur magasin
- Filtre optionnel pour la vue
- **Obligatoire** pour les exports STKPERM et Transfert (boutons désactivés sinon)

### Cartes résumé (cliquables → filtrent automatiquement)
- Total produits
- Confirmés (qty_sent not null)
- En attente (qty_sent null)
- Avec écart magasin (qty_sent ≠ qty_requested)
- Réceptionnés (qty_received not null)
- Écart dépôt (affiché uniquement si count > 0)

### Barre de totaux
- Total demandé, total envoyé, total reçu, écart global

### Filtres
- **Recherche texte** : EAN, PARKOD, label (case-insensitive)
- **Marque** : extraite du label après ' - '
- **Statut général** : tout OK, envoyé, en attente, écart magasin, écart dépôt
- **Date** : prefix match sur received_at ou scanned_at
- **Statut dépôt** : réceptionnés, en cours (partiel), non reçus, écart
- **Traité** : tous, non traités, traités (exported_at)

### Couleurs des lignes
- **Vert** (`row-status-complete`) : qty_received = qty_sent et diff = 0
- **Bleu** (`row-status-sent`) : envoyé, attente dépôt, diff = 0
- **Orange** (`row-status-store-discrepancy`) : qty_sent ≠ null, diff ≠ 0
- **Rouge** (`row-status-depot-discrepancy`) : qty_received ≥ qty_sent mais qty_received ≠ qty_sent
- **Gris** (`row-status-pending`) : qty_sent null

### Tooltips (survol des lignes en écart)
- Écart magasin : "Magasin: envoyé X / demandé Y (écart +/-Z)"
- Écart dépôt : "Dépôt: reçu X / envoyé Y (écart +/-Z)"
- Réception partielle : "Réception en cours: X/Y"

### Légende
- Vert : "Tout OK"
- Bleu : "Envoyé (attente dépôt)"
- Orange/Rouge : "Écart détecté"
- Gris : "En attente"

### Actions
- Annuler envoi (reset scan magasin)
- Annuler réception (reset scan dépôt)
- Marquer traités (exported_at = now)
- Démarquer traités (exported_at = null)

## Exports (requièrent un magasin sélectionné)

### Export STKPERM (.md)
- Format SQL : `UPDATE ARTMAG SET STKPERM = {value} WHERE CMAG = '{code_magasin}' AND CMARQ = '{cmarq}' AND CCATEG = '{ccateg}' AND CPROD = '{cprod}';`
- Décomposition PARKOD 8 chars : CMARQ = chars[0:3], CCATEG = chars[3:5], CPROD = chars[5:8]
- **Avec réf XLSX** (bouton "Charger réf. XLSX") :
  - Colonne G (index 6) = PARKOD 8 chars
  - Colonne AN (index 39) = valeur STKPERM
  - Si AN > 0 → STKPERM = valeur du XLSX
  - Si AN = 0 → STKPERM = max(0, qty_requested - qty_sent)
- **Sans réf XLSX** : STKPERM = max(0, qty_requested - qty_sent)

### Export Transfert (format WinDev)
- Modal avec 4 paramètres : codeDu (défaut '0002'), codeAu (défaut '0000'), intitulé (défaut 'ST.MB'), séquence (défaut '01')
- Format ligne : `TT{du2}{au2}{parkod}{espaces}{qty}  ;{date};1600;{intitule};;{codeDu};{codeAu}` + CRLF
- Espaces quantité : <10 = 3 espaces, <100 = 2 espaces, >=100 = 0
- codeDu = code CMAG du magasin sélectionné
- Nom fichier : `V{DDMMYY}{sequence zero-padded 2}.000393`

### Export XLSX
- Colonnes : PARKOD (forcé type string 's' pour conserver les zéros) + écart (valeur absolue)
- Nom fichier : `export_parkod_quantite.xlsx`

## Page Réglages SMTP (AdminSettings.jsx)

### Champs de configuration
- `host` : serveur SMTP (défaut: `smtp.office365.com`)
- `port` : port (défaut: `587`)
- `encryption` : sélecteur STARTTLS / SSL / NONE (défaut: `STARTTLS`)
- `user` : adresse email
- `password` : mot de passe (masqué comme `****` au chargement, effacé au focus)
- `from` : adresse expéditeur
- `to` : adresse(s) destinataire(s)

### Actions
- Sauvegarder : `PUT /api/settings/smtp` (chiffrement AES-256-GCM du mot de passe)
- Tester : `POST /api/settings/smtp/test` → envoie un email de test

## Page Magasins Admin (AdminMagasins.jsx)

### Création
- Champs requis : name, code, password
- Hash du mot de passe côté serveur (pas côté client)
- API : `POST /api/magasins`

### Modification
- Champs : name (requis), code (requis), password (optionnel — si vide, non modifié)
- API : `PUT /api/magasins/:id`

### Suppression
- Confirmation : "Supprimer le magasin \"{name}\" ? Cette action est irréversible."
- Échoue si produits liés au magasin
- Échoue si id = 1 (Maison Blanche protégé)
- API : `DELETE /api/magasins/:id`

### Affichage
- Colonnes : nom, code CMAG, date de création (format fr-FR)

## SSE — Temps réel
- Broadcast du produit complet (pas juste l'id) pour mise à jour chirurgicale
- Frontend filtre par magasinId — ignore les events d'autres magasins
- `products-changed` (ajout/suppression) → reload complet de la liste
- `product-updated` (scan) → update un seul produit dans le state
- Reconnexion auto après 5s si déconnexion

## Déploiement
- **URL** : https://sur-stock.myorigines.tech
- **VPS** : 51.254.132.46, user `debian`
- **Chemin VPS** : `/home/debian/surstock`
- **Reverse proxy** : Traefik v2.11 sur réseau Docker `myorigines-network`
- **Certificat SSL** : Let's Encrypt automatique via Traefik
- **IMPORTANT** : ne jamais casser les autres projets du VPS (23+ conteneurs)

### Mise à jour
```bash
git push origin main
ssh debian@51.254.132.46 "cd /home/debian/surstock && git pull && docker compose up --build -d"
```

### Backup BDD avant mise à jour
```bash
ssh debian@51.254.132.46 "cd /home/debian/surstock && docker compose exec surstock cp /app/backend/data/surstock.db /app/backend/data/surstock.db.bak.$(date +%Y%m%d)"
```

### Vérification post-déploiement
```bash
ssh debian@51.254.132.46 "cd /home/debian/surstock && docker compose ps && docker compose logs --tail=5"
```

## Variables d'environnement (docker-compose.yml)
- `DB_DIR` : dossier de la base SQLite (`/app/backend/data`)
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
