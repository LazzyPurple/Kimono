# Kimono

Kimono est un frontend personnel unifie pour consulter du contenu provenant de `Kemono` et `Coomer` dans une seule interface Next.js.

Le projet supporte maintenant deux modes distincts :

- `LOCAL_DEV_MODE=true` : mode local de developpement avec Prisma + SQLite
- production : mode MySQL + SQL brut pour o2switch / cPanel

Les routes applicatives restent identiques entre les deux modes. Seules la couche d'acces aux donnees et la logique d'entree changent.

## Etat actuel

### Authentification

- auth single-user via `ADMIN_PASSWORD`
- support TOTP / 2FA en production
- bypass total de l'auth en mode local avec `LOCAL_DEV_MODE=true`
- routes et layouts adaptes pour ne pas emuler de session NextAuth en local
- route de debug auth temporaire pour diagnostic serveur

### Donnees et cache

- couche partagee `data-store` pour eviter que les routes parlent directement a MySQL
- backend local Prisma / SQLite sur `Kimono/prisma/dev.db`
- backend production MySQL via SQL brut
- cache hybride serveur + navigateur pour accelerer la recherche, les pages createur, les pages post et les previews
- stockage indexe des createurs
- cache canonique des posts
- snapshots des posts populaires
- jobs de prechauffage prevus pour cron cPanel

### UI / experience

- lecteur video avec icones Lucide
- correction du decor Sakura pour supprimer les mismatches d'hydratation
- correction de plusieurs textes moji-bakes
- page `/logs` pour centraliser le debug runtime, auth, DB, API et client

### Deploiement

- build de production force en Webpack
- packaging Linux prebuild via WSL pour o2switch
- artefact genere dans `Kimono/deploy/`
- bootstrap Node.js via `Kimono/server.js`

## Structure du repo

- `Kimono/` : application principale Next.js
- `Kimono/prisma/` : schema Prisma local SQLite
- `Kimono/deploy/` : SQL et artefacts de deploiement
- `Kimono/scripts/` : packaging o2switch, generation runtime package, utilitaires
- `Kimono/tests/` : tests unitaires et integration legere

## Lancement en local

### Prerequis

- Node.js 22 recommande
- npm

### Installation

```bash
git clone <votre-url>
cd Kimono/Kimono
npm install
```

### Variables d'environnement locales

Le mode local ne s'active jamais automatiquement. Il faut un flag explicite.

Exemple de `.env.local` :

```env
LOCAL_DEV_MODE=true
DATABASE_URL="file:./prisma/dev.db"
AUTH_SECRET="dev-secret"
AUTH_URL="http://localhost:3000"
ADMIN_PASSWORD="dev-password"
WEBAUTHN_ORIGIN="http://localhost:3000"
WEBAUTHN_RP_ID="localhost"
WEBAUTHN_RP_NAME="Kimono"
```

### Commandes utiles

```bash
npm run dev
npm test
npm run build
npm run prisma:generate
npm run prisma:push
```

En mode local :

- l'entree est bypass
- `/login` redirige vers `/search`
- l'app utilise SQLite via Prisma

## Production o2switch

La production continue de fonctionner en MySQL avec la couche SQL brute.

Variables principales cote serveur :

```env
NODE_ENV=production
DATABASE_URL=mysql://user:password@localhost:3306/database
AUTH_SECRET=...
AUTH_URL=https://kimono.paracosm.fr
ADMIN_PASSWORD=...
WEBAUTHN_ORIGIN=https://kimono.paracosm.fr
WEBAUTHN_RP_ID=kimono.paracosm.fr
WEBAUTHN_RP_NAME=Kimono
```

Important :

- ne pas activer `LOCAL_DEV_MODE` en production
- si le mot de passe MySQL contient des caracteres speciaux, preferer un mot de passe URL-safe pour `DATABASE_URL`

## Packaging o2switch

Le build de deploiement se fait localement en Linux via WSL, puis l'artefact est uploade sur le serveur.

Commande :

```powershell
cd C:\Users\lilsm\Workspace\Kimono\Kimono
npm run build:o2switch-package
```

Le zip final attendu est :

- `C:\Users\lilsm\Workspace\Kimono\Kimono\deploy\kimono-o2switch-linux-prebuilt.zip`

Ensuite sur o2switch :

1. uploader le zip dans le dossier applicatif
2. extraire
3. lancer `Run NPM Install`
4. redemarrer l'application Node.js

## Debug temporaire

Des surfaces de debug temporaires existent pendant la phase de stabilisation :

- `/logs`
- `/api/logs`
- `/api/debug/auth-check`

Ces routes doivent etre re-securisees ou supprimees une fois le debug termine.

## Documentation complementaire

- guide de deploiement : `Kimono/DEPLOY.md`
- resume de progression : `Checkpoint.md`

## Statut

Le projet a ete fortement refactorise ces dernieres sessions :

- split local / prod
- perf hybride
- packaging o2switch
- logging central
- correction de plusieurs regressions auth / DB / hydration

Il reste encore des correctifs de stabilisation et de finition UI a faire, documentes dans `Checkpoint.md`.
