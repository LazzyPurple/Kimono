# Deploiement Kimono sur o2switch

Ce guide correspond au flux de prod actuel:
- source principale dans `Kimono/`
- build Linux via WSL Ubuntu
- artefact prebuild dans `deploy/kimono-o2switch-linux-prebuilt.zip`
- runtime MySQL / MariaDB sur o2switch
- auth single-user via `ADMIN_PASSWORD`
- batchs perf via cron cPanel

Le dossier `deploy-package/` doit etre considere comme un ancien artefact derive. Le point de verite est maintenant la source principale du projet.

## 1. Prerequis une seule fois

### Installer WSL Ubuntu

Depuis Windows PowerShell admin:

```powershell
wsl --install -d Ubuntu
```

Redemarre Windows si demande, puis ouvre Ubuntu et termine l'initialisation.

### Installer Node 22 dans WSL

Dans Ubuntu:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

## 2. Base MySQL et variables de prod

Ta base actuelle semble correcte si tu vois bien ces tables dans phpMyAdmin:
- `User`
- `Passkey`
- `Session`
- `KimonoSession`
- `CreatorsCache`
- `CreatorIndex`
- `PostCache`
- `PopularSnapshot`
- `DiscoveryBlock`
- `DiscoveryCache`

Le SQL de reference reste `deploy/o2switch-init.sql`.

Dans cPanel > Node.js App, garde ces variables cote serveur:

```env
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/DBNAME"
AUTH_SECRET="..."
AUTH_URL="https://kimono.paracosm.fr"
ADMIN_PASSWORD="..."
WEBAUTHN_RP_NAME="Kimono"
WEBAUTHN_RP_ID="kimono.paracosm.fr"
WEBAUTHN_ORIGIN="https://kimono.paracosm.fr"
CRON_SECRET="..."
PREVIEW_ASSET_DIR="/home/dosa4307/tmp/kimono-preview-assets"
POPULAR_PREVIEW_RETENTION_DAYS="7"
POPULAR_PREVIEW_CLIP_SECONDS="3"
NODE_ENV="production"
AUTH_DEBUG_LOG="false"
AUTH_DEBUG_LOG_PATH="tmp/auth-debug.log"
AUTH_DEBUG_TOKEN=""
```

Important:
- ne mets pas `LOCAL_DEV_MODE`
- garde `NODE_ENV=production`
- si le mot de passe MySQL contient `@`, `:`, `/`, `#` ou `%`, encode-le dans l'URL
- `CRON_SECRET` sert a proteger les jobs batch de perf en production
- active `AUTH_DEBUG_LOG="true"` uniquement pour diagnostiquer une connexion ou un souci auth, puis remets-le a `false`
- active `AUTH_DEBUG_TOKEN` uniquement pour utiliser la route `/api/debug/auth-check`, puis vide-la apres diagnostic

## 3. Generer le zip de prod

Depuis Windows, dans le dossier du projet:

```powershell
cd C:\Users\lilsm\Workspace\Kimono\Kimono
powershell -ExecutionPolicy Bypass -File .\scripts\build-o2switch-package.ps1
```

Le script:
- copie la source dans un workspace Linux temporaire WSL
- lance `npm ci`
- lance `npm run build --webpack`
- verifie que les traces `.next` ne pointent plus vers des binaires Windows
- prepare un package runtime Linux
- genere `deploy/kimono-o2switch-linux-prebuilt.zip`

Le zip final contient notamment:
- `.next/`
- `app/`
- `components/`
- `contexts/`
- `hooks/`
- `lib/`
- `public/`
- `auth.ts`
- `proxy.ts`
- `server.js`
- `next.config.mjs`
- `package.json`
- `package-lock.json`
- `deploy/o2switch-init.sql`

Le zip n'embarque pas:
- `node_modules`
- `tests`
- `.env.local`
- `dev.db`
- le mode local Prisma / SQLite

## 4. Uploader sur o2switch

Dans le gestionnaire de fichiers cPanel:

1. Ouvre le dossier applicatif `kimono/`.
2. Supprime l'ancien contenu pour repartir proprement.
3. Upload `deploy/kimono-o2switch-linux-prebuilt.zip`.
4. Extrais le zip a la racine de `kimono/`.
5. Verifie que la racine contient bien:
   - `server.js`
   - `package.json`
   - `next.config.mjs`
   - `.next/`
   - `public/`

## 5. Configuration Node.js App dans cPanel

Garde l'application existante avec:
- Node.js version: `22.x`
- Application mode: `Production`
- Application root: `kimono`
- Application startup file: `server.js`

Ensuite:
1. clique sur `Run NPM Install`
2. clique sur `Save` si besoin
3. clique sur `Restart`

Le serveur ne doit pas refaire un build Next. Il doit seulement installer les dependances runtime puis demarrer Passenger.

## 6. Jobs batch de performance

Les endpoints suivants sont prevus pour un cron nocturne:
- `POST /api/cache-jobs/creator-snapshot`
- `POST /api/cache-jobs/popular-warmup`

En production, ils exigent `CRON_SECRET` via:
- header `x-cron-secret`
- ou query string `?secret=...`

Exemples `curl`:

```bash
curl -X POST 'https://kimono.paracosm.fr/api/cache-jobs/creator-snapshot?secret=TON_SECRET'
```

```bash
curl -X POST 'https://kimono.paracosm.fr/api/cache-jobs/popular-warmup?secret=TON_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{"sites":["kemono","coomer"],"periods":["recent"],"recentOffsets":[0,50,100]}'
```

Recommandation cron cPanel:
- `creator-snapshot` une fois par nuit
- `popular-warmup` juste apres, ou quelques minutes plus tard

Notes preview assets `Popular`:
- `popular-warmup` genere et/ou reutilise les thumbnails, mini clips et durees video des posts `Popular`
- les assets sont stockes sur disque dans `PREVIEW_ASSET_DIR`
- un meme post/video populaire sur plusieurs jours reutilise ses assets si la source et le fingerprint sont identiques
- la retention par defaut est de 7 jours

## 7. Verification apres mise en ligne

Controle rapide:
- la page d'accueil charge sans ecran Passenger
- `/login` repond
- la connexion avec `ADMIN_PASSWORD` fonctionne
- un utilisateur admin apparait dans `User` apres premiere connexion
- `/search`, `/popular`, `/creator/...` et `/post/...` repondent correctement
- les jobs batch renvoient un JSON `ok: true`

## 8. Diagnostic auth temporaire

Si le login echoue et que les logs Passenger restent opaques, tu peux utiliser une route de diagnostic temporaire.

Dans cPanel > Node.js App:
- mets `AUTH_DEBUG_TOKEN` sur une valeur longue et aleatoire
- clique sur `Save`
- clique sur `Restart`

Etat auth + DB sans tester de mot de passe:

```text
https://kimono.paracosm.fr/api/debug/auth-check?token=TON_TOKEN
```

Test de correspondance du mot de passe configure via SSH / terminal:

```bash
curl -X POST 'https://kimono.paracosm.fr/api/debug/auth-check?token=TON_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"password":"TON_MOT_DE_PASSE"}'
```

Une fois le diagnostic termine:
- vide `AUTH_DEBUG_TOKEN`
- clique sur `Save`
- clique sur `Restart`

## 9. Mise a jour ulterieure

A chaque nouvelle release:

```powershell
cd C:\Users\lilsm\Workspace\Kimono\Kimono
powershell -ExecutionPolicy Bypass -File .\scripts\build-o2switch-package.ps1
```

Puis:
- upload du nouveau zip
- extraction dans `kimono/`
- `Run NPM Install`
- `Restart`

## 10. Depannage Passenger

Si l'application ne demarre pas et affiche un `Error ID` Passenger:

1. note l'`Error ID`
2. ouvre le log Passenger dans cPanel / terminal / SSH
3. cherche cet identifiant exact
4. traite en priorite:
   - dependance manquante
   - mauvais `Application root`
   - mauvais `server.js`
   - variable d'environnement absente ou invalide
   - archive incomplete ou extraite au mauvais niveau

## 11. Fichiers utiles

- `scripts/build-o2switch-package.ps1`: wrapper Windows
- `scripts/build-o2switch-package.sh`: build Linux via WSL
- `scripts/o2switch-package-config.mjs`: regles de packaging runtime
- `server.js`: bootstrap Node / Passenger
- `deploy/o2switch-init.sql`: schema MySQL de reference
