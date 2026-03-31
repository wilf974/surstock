# Surstock - Maison Blanche

Plateforme de gestion de surstock entre l'entrepot et le magasin Maison Blanche. L'admin envoie une liste de produits, le magasin scanne et confirme les quantites envoyees, le depot scanne pour confirmer la reception.

## Fonctionnalites

### Magasin
- Scan des produits par douchette, camera ou saisie manuelle
- Confirmation de la quantite envoyee avec modale
- Bouton "Valider a 0" avec code de securite
- Impression de la liste des produits

### Depot
- Scan unitaire de chaque produit recu (chaque bip = +1)
- Detection automatique des ecarts (recu != envoye)
- Scanner camera + saisie manuelle EAN/PARKOD

### Administration
- Saisie des produits (unitaire, copier/coller, import XLSX)
- Tableau de bord avec suivi magasin + depot
- Couleurs visuelles : vert (OK), orange (ecart magasin), rouge (ecart depot)
- Export XLSX (PARKOD + ecart)
- Notifications in-app (cloche) pour les scans magasin et depot
- Annulation d'envoi ou de reception
- Reglages SMTP pour notifications email

### Notifications email
- Email automatique a chaque scan depot
- Alerte ecart quand la quantite recue ne correspond pas
- Configuration SMTP Microsoft 365 via l'interface admin

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Backend | Node.js + Express |
| Frontend | React 18 + Vite 6 |
| Base de donnees | SQLite (sql.js) |
| Deploiement | Docker + Traefik (HTTPS) |
| Email | Nodemailer (SMTP) |
| Scan camera | html5-qrcode |

## Installation

### Developpement local

```bash
# Backend
cd backend && npm install && node server.js

# Frontend (autre terminal)
cd frontend && npm install && npm run dev
```

- Backend : http://localhost:3001
- Frontend : http://localhost:5173

### Docker

```bash
docker compose up --build -d
```

Application accessible sur le port 3001.

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `DB_DIR` | Dossier de la base SQLite |
| `ADMIN_PASSWORD_HASH` | Hash SHA-256 du mot de passe admin |
| `STORE_PASSWORD_HASH` | Hash SHA-256 du mot de passe magasin |
| `DEPOT_PASSWORD_HASH` | Hash SHA-256 du mot de passe depot |
| `SETTINGS_SECRET` | Cle de chiffrement pour le mot de passe SMTP |

## Deploiement production

Le projet est deploye via Docker avec Traefik en reverse proxy HTTPS.

```bash
# Sur le VPS
git pull
docker compose up --build -d
```

## Structure

```
Surstock/
├── backend/
│   ├── server.js          # Express + middlewares securite
│   ├── db.js              # SQLite + migrations
│   ├── email.js           # Nodemailer + chiffrement SMTP
│   └── routes/
│       ├── auth.js        # Roles admin/store/depot
│       ├── products.js    # CRUD + import en masse
│       ├── scan.js        # Confirmation magasin
│       ├── depot.js       # Reception depot (scan unitaire)
│       ├── dashboard.js   # Stats admin
│       ├── settings.js    # Config SMTP
│       └── notifications.js # Notifications in-app
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── StoreList.jsx       # Magasin : scan + liste
│       │   ├── DepotList.jsx       # Depot : reception
│       │   ├── AdminInsert.jsx     # Saisie produits
│       │   ├── AdminDashboard.jsx  # Tableau de bord
│       │   └── AdminSettings.jsx   # Reglages SMTP
│       └── components/
│           ├── Navbar.jsx          # Navigation responsive
│           ├── CameraScanner.jsx   # Scanner camera mobile
│           └── NotificationBell.jsx # Cloche notifications
├── Dockerfile
└── docker-compose.yml
```

## Securite

- Authentification par token Bearer (3 roles)
- Mots de passe hashes SHA-256 cote client avant envoi
- Helmet (headers securite)
- CORS restrictif
- Rate limiting sur le login (10 tentatives / 15 min)
- Mot de passe SMTP chiffre AES-256-GCM
