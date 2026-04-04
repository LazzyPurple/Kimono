# Deploiement Kimono sur o2switch

Ce guide correspond au flux de prod actuel :
- source principale dans `Kimono/`
- build Linux via WSL Ubuntu
- artefact prebuild dans `deploy/kimono-o2switch-linux-prebuilt.zip`
- runtime PostgreSQL sur o2switch
- auth single-user via `ADMIN_PASSWORD`

`deploy-package/` n'est plus une source de verite. Le point de verite est la source principale du projet.

## 1. Variables de production

Dans cPanel > Node.js App, configure au minimum :

```env
DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DBNAME"
AUTH_SECRET="..."
AUTH_URL="https://kimono.paracosm.fr"
ADMIN_PASSWORD="..."
WEBAUTHN_RP_NAME="Kimono"
WEBAUTHN_RP_ID="kimono.paracosm.fr"
WEBAUTHN_ORIGIN="https://kimono.paracosm.fr"
NODE_ENV="production"
AUTH_DEBUG_LOG="false"
AUTH_DEBUG_BYPASS="false"
```

Notes :
- encode le mot de passe PostgreSQL si besoin dans l'URL
- `AUTH_DEBUG_LOG` et `AUTH_DEBUG_BYPASS` sont temporaires pour le diagnostic
- le schema de reference est `deploy/o2switch-init.sql`

## 2. Generer le zip de prod

Depuis Windows :

```powershell
cd C:\Users\lilsm\Workspace\Kimono\Kimono
powershell -ExecutionPolicy Bypass -File .\scripts\build-o2switch-package.ps1
```

Le script :
- copie la source dans un workspace Linux WSL
- lance `npm ci`
- lance `npm run build --webpack`
- prepare un package runtime Linux
- genere `deploy/kimono-o2switch-linux-prebuilt.zip`

## 3. Deployer sur o2switch

Dans le gestionnaire de fichiers cPanel :

1. Ouvre le dossier applicatif `kimono/`
2. Supprime l'ancien contenu
3. Upload `deploy/kimono-o2switch-linux-prebuilt.zip`
4. Extrais le zip a la racine de `kimono/`
5. Verifie la presence de :
   - `server.js`
   - `package.json`
   - `.next/`
   - `app/`
   - `lib/`

## 4. Configuration Node.js App

Dans cPanel :
- Node.js version : `22.x`
- Application mode : `Production`
- Application root : `kimono`
- Application startup file : `server.js`

Puis :
1. clique sur `Run NPM Install`
2. clique sur `Save` si besoin
3. clique sur `Restart`

Le runtime ne doit pas rebuilder Next. Il doit seulement installer les dependances runtime puis demarrer Passenger.

## 5. Verification rapide

Controle post-deploiement :
- `/login` repond
- la connexion avec `ADMIN_PASSWORD` fonctionne
- `/health` repond
- `/logs` repond
- `/search`, `/popular`, `/favorites` et `/admin` repondent

## 6. Diagnostic

Si l'application ne demarre pas :

1. note l'`Error ID` Passenger
2. ouvre les logs cPanel / Passenger
3. verifie en priorite :
   - archive incomplete
   - mauvais `Application root`
   - mauvais `server.js`
   - variable `DATABASE_URL` invalide
   - droits PostgreSQL manquants

Fichiers utiles :
- `scripts/build-o2switch-package.ps1`
- `scripts/build-o2switch-package.sh`
- `scripts/o2switch-package-config.mjs`
- `server.js`
- `deploy/o2switch-init.sql`
