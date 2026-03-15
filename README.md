# Kimono

Kimono est un frontend personnel unifie pour consulter du contenu provenant de `Kemono` et `Coomer` dans une seule interface Next.js.

Le projet fonctionne en deux modes :

- `LOCAL_DEV_MODE=true` : developpement local avec Prisma + SQLite
- production : MySQL + SQL brut pour o2switch / cPanel

Les routes applicatives restent identiques entre les deux modes. Ce qui change, c'est la couche de donnees, certains garde-fous d'auth, et une partie du diagnostic runtime.

## Etat actuel

### Authentification et acces admin

- auth single-user via `ADMIN_PASSWORD`
- support TOTP / 2FA en production
- bypass total de l'auth en mode local avec `LOCAL_DEV_MODE=true`
- `/login` redirige vers `/search` en local
- layouts et routes adaptes pour ne pas emuler de session NextAuth en local
- l'utilisateur admin est cree a la premiere connexion reussie si necessaire

### Diagnostic et logs

Les surfaces de diagnostic ne sont plus publiques par defaut.

- `/logs`, `/api/logs`, `/api/debug/auth-check` et `/api/debug/env-db` sont proteges
- acces autorise si session connectee valide
- acces de secours possible avec `AUTH_DEBUG_TOKEN`
- `AUTH_DEBUG_LOG` et `AUTH_DEBUG_LOG_PATH` restent disponibles pour ecrire un log auth structure sur disque

Exemples :

- page logs : `/logs?debugToken=...`
- API logs : `/api/logs?debugToken=...`
- header alternatif : `x-auth-debug-token: ...`

Important :

- ne laisser `AUTH_DEBUG_TOKEN` que temporairement si le login prod est casse
- considerer tout secret visible dans une capture ou un partage comme compromis

### Donnees, cache et perf

- couche partagee `data-store` pour eviter que les routes parlent directement a MySQL
- backend local Prisma / SQLite sur `Kimono/prisma/dev.db`
- backend production MySQL via SQL brut
- cache hybride serveur + navigateur pour la recherche, les pages createur, les pages post et certaines previews
- stockage indexe des createurs
- cache canonique des posts
- snapshots de populaires
- jobs de prechauffage prevus pour cron cPanel

### Previews media serveur-first

Le chantier principal en cours est une approche serveur-first sur `Popular`, reutilisee progressivement ailleurs.

Ce qui est en place :

- batch `popular-warmup`
- detection de la plus longue video
- duree precalculee cote serveur
- generation de thumbnail et mini clip serveur
- deduplication des assets deja traites via empreinte stable
- serving des assets via `/api/preview-assets/...`
- helper central d'hydratation des preview assets en sortie serveur
- reutilisation des previews serveur dans les principaux flux de listing deja branches sur la couche hybride

### Optimisations images

Les listings medias utilisent maintenant une strategie plus legere :

- thumbnails CDN Kemono / Coomer pour les previews de listing
- image pleine resolution conservee pour la page post detail
- preconnect global vers `img.kemono.cr`, `img.coomer.st`, `kemono.cr`, `coomer.st`
- cache HTTP immuable et plus agressif sur `/api/preview-assets/...`
- `referrerPolicy="no-referrer"` sur les images distantes des cards media
- mode serveur-first renforce dans `MediaCard` avec preview clip au hover desktop et rendu plus stable par defaut

### UI / experience

- lecteur video avec icones Lucide
- correction du decor Sakura pour supprimer les mismatches d'hydratation
- plusieurs libelles UI sont en cours de passage vers l'anglais
- titres de pages dynamiques en cours d'harmonisation
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
- `Checkpoint.md` : resume d'avancement
- `Roadmap.md` : suivi du reste a faire et prochaines priorites

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

Variables utiles pour le diagnostic securise :

```env
AUTH_DEBUG_LOG=true
AUTH_DEBUG_LOG_PATH=/home/<user>/kimono/tmp/auth-debug.log
AUTH_DEBUG_TOKEN=<long-secret-temporaire>
```

Variables utiles pour la phase `Popular` serveur-first :

```env
PREVIEW_ASSET_DIR=/home/<user>/tmp/kimono-preview-assets
POPULAR_PREVIEW_RETENTION_DAYS=7
POPULAR_PREVIEW_CLIP_SECONDS=3
```

Important :

- ne pas activer `LOCAL_DEV_MODE` en production
- preferer un mot de passe MySQL URL-safe pour `DATABASE_URL`
- ne garder `AUTH_DEBUG_TOKEN` que temporairement
- si `PREVIEW_ASSET_DIR` n'est pas defini, les assets tombent dans un dossier local du projet

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

## Batchs et warmup

Deux jobs principaux existent :

- `creator-snapshot`
- `popular-warmup`

`popular-warmup` sert maintenant a :

- preparer les snapshots `Popular`
- generer les assets de preview
- reutiliser les assets deja generes si la video source a deja ete traitee
- nettoyer les assets trop anciens selon la retention

## Verification recente

Les derniers lots verifies localement passent :

- `npm test`
- `npm run build`

La couverture inclut notamment :

- auth / proxy / debug gating
- data store local et repository perf
- preview assets `Popular`
- hydratation centrale des preview assets
- optimisations images CDN et priorites de chargement
- packaging o2switch

## Documentation complementaire

- guide de deploiement : `Kimono/DEPLOY.md`
- resume de progression : `Checkpoint.md`
- plan de travail restant : `Roadmap.md`

## Statut

Le projet a ete fortement refactorise ces dernieres sessions :

- split local / prod
- perf hybride
- packaging o2switch
- logging central securise
- phase `Popular` serveur-first
- hydratation centrale des previews
- optimisation du chargement image sur les listings
- correction de plusieurs regressions auth / DB / hydration

Le chantier principal encore en cours est le hardening final de la production et la poursuite de la reduction du cout client sur les surfaces media les plus lourdes.
