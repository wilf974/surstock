# Déploiement Surstock - sur-stock.myorigines.tech

## Prérequis
- VPS Linux avec Docker et Docker Compose installés
- DNS `sur-stock.myorigines.tech` pointant vers le VPS (déjà fait)
- D'autres projets HTTPS tournent déjà sur le VPS — NE PAS les casser

## Architecture sur le VPS

Le VPS utilise probablement déjà un reverse proxy (Nginx ou Traefik) pour gérer le HTTPS des autres projets. Il faut s'intégrer dans l'architecture existante.

---

## Étapes de déploiement

### 1. Vérifier l'architecture existante du VPS

```bash
# Identifier le reverse proxy existant
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"

# Vérifier si nginx/traefik tourne en natif
systemctl status nginx 2>/dev/null
systemctl status traefik 2>/dev/null

# Vérifier les ports utilisés
ss -tlnp | grep -E ':(80|443)\s'
```

**IMPORTANT** : Identifier comment les autres projets gèrent le HTTPS avant de continuer. Ne rien modifier sur les configurations existantes.

---

### 2. Cloner le projet

```bash
cd /opt  # ou le dossier habituel des projets sur le VPS
git clone <URL_DU_REPO> surstock
cd surstock
```

---

### 3. Adapter docker-compose.yml pour la production

Le `docker-compose.yml` du repo expose le port 3001. En production, ce port ne doit PAS être exposé publiquement — c'est le reverse proxy qui fait le lien.

Modifier `docker-compose.yml` sur le VPS :

```yaml
services:
  surstock:
    build: .
    expose:
      - "3001"
    environment:
      - DB_DIR=/app/backend/data
    volumes:
      - surstock-data:/app/backend/data
    restart: unless-stopped
    networks:
      - web  # Le réseau Docker partagé avec le reverse proxy

volumes:
  surstock-data:

networks:
  web:
    external: true
```

> **Note** : Le nom du réseau (`web`) doit correspondre à celui utilisé par le reverse proxy existant. Vérifier avec `docker network ls`.

---

### 4a. Si le VPS utilise Nginx (natif ou conteneur)

#### Nginx natif (systemctl)

Créer `/etc/nginx/sites-available/sur-stock.myorigines.tech` :

```nginx
server {
    listen 80;
    server_name sur-stock.myorigines.tech;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Activer le site
ln -s /etc/nginx/sites-available/sur-stock.myorigines.tech /etc/nginx/sites-enabled/

# Tester la config (NE CASSE PAS les autres sites)
nginx -t

# Recharger seulement si le test passe
systemctl reload nginx

# Obtenir le certificat SSL avec Certbot
certbot --nginx -d sur-stock.myorigines.tech
```

> Si Nginx est natif, exposer le port 3001 en local uniquement dans docker-compose :
> `ports: ["127.0.0.1:3001:3001"]` au lieu de `expose`.

#### Nginx en conteneur Docker

Ajouter un fichier de config dans le dossier partagé du conteneur nginx et le connecter au même réseau Docker. Le `proxy_pass` pointe vers `http://surstock:3001`.

---

### 4b. Si le VPS utilise Traefik

Ajouter les labels au service `surstock` dans `docker-compose.yml` :

```yaml
services:
  surstock:
    build: .
    expose:
      - "3001"
    environment:
      - DB_DIR=/app/backend/data
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.surstock.rule=Host(`sur-stock.myorigines.tech`)"
      - "traefik.http.routers.surstock.entrypoints=websecure"
      - "traefik.http.routers.surstock.tls.certresolver=letsencrypt"
      - "traefik.http.services.surstock.loadbalancer.server.port=3001"
    volumes:
      - surstock-data:/app/backend/data
    restart: unless-stopped
    networks:
      - web

volumes:
  surstock-data:

networks:
  web:
    external: true
```

---

### 5. Lancer le projet

```bash
cd /opt/surstock
docker compose up --build -d
```

### 6. Vérifier

```bash
# Le conteneur tourne
docker compose ps

# Les logs sont OK
docker compose logs -f

# Le site répond
curl -I https://sur-stock.myorigines.tech
```

---

## Checklist sécurité

- [ ] Le port 3001 n'est PAS exposé publiquement (uniquement via reverse proxy)
- [ ] Les autres sites HTTPS fonctionnent toujours après le déploiement
- [ ] Le certificat SSL est valide (`certbot` ou Traefik auto)
- [ ] `nginx -t` passe avant tout reload (si Nginx)
- [ ] Le volume `surstock-data` persiste la base de données

## Mise à jour future

```bash
cd /opt/surstock
git pull
docker compose up --build -d
```
