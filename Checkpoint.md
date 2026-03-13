# Kimono - Checkpoint

Ce document sert de resume d'etat du projet et de memo de progression.

## Ce qui a ete mis en place

### 1. Split local / production

Le projet fonctionne maintenant avec deux backends clairement separes :

- local : Prisma + SQLite avec `LOCAL_DEV_MODE=true`
- production : MySQL + SQL brut pour o2switch

Details importants :

- `isLocalDevMode()` centralise l'activation du mode local
- le mode local est force hors production uniquement
- les routes restent les memes entre local et prod
- les acces DB passent par une couche partagee au lieu d'importer directement `lib/db.ts`

### 2. Authentification locale simplifiee

En local :

- bypass total de l'ecran d'entree
- `/login` redirige vers `/search`
- le layout protege ne depend plus d'une session NextAuth
- logout / TOTP / passkey sont masques
- aucune fausse session NextAuth n'est generee

En production :

- comportement MySQL / auth principal conserve
- TOTP setup desactive en mode local
- plusieurs correctifs ont ete apportes autour du login, du proxy et de la lecture de session

### 3. Prisma / SQLite local

Le support Prisma a ete reintroduit cote source pour le developpement local :

- `prisma/schema.prisma` pointe de nouveau vers SQLite en local
- client Prisma local dedie
- scripts `prisma:generate` et `prisma:push`
- tests de couverture du mode local

### 4. Couche de donnees partagee

Une couche repository / service a ete introduite pour factoriser les operations de donnees utilisees par l'application :

- utilisateur admin unique
- TOTP
- sessions Kimono / Coomer
- cache createurs
- blocs et cache de decouverte
- cache de posts et snapshots populaires

Cette couche choisit dynamiquement entre :

- Prisma / SQLite en local
- SQL brut MySQL en prod

### 5. Refonte performance hybride

Une refonte importante du chargement a ete ajoutee.

Pieces principales :

- index createurs en base
- cache canonique de posts
- snapshots de populaires
- cache hybride serveur + navigateur
- fallback live vers Kemono / Coomer si la base n'est pas chaude
- re-ecriture en cache apres fetch upstream

Routes principales branchees sur ce modele :

- `/api/search-creators`
- `/api/popular-posts`
- `/api/creator-posts`
- `/api/creator-profile`
- `/api/post`

### 6. Jobs de prechauffage

Des jobs serveurs existent pour alimenter la base de cache :

- creator snapshot
- popular warmup

Ils sont prevus pour etre appeles via cron cPanel en production.

### 7. Deploiement o2switch

Le flux de deploiement a ete fortement remis a plat.

Ce qui a ete ajoute :

- `server.js` canonique a la racine de l'app
- build prod force en Webpack
- packaging Linux prebuild via WSL
- manifest runtime dedie
- zip final dans `Kimono/deploy/`
- documentation de deploiement mise a jour

Objectif :

- construire localement un artefact Linux propre
- ne plus faire de build Next.js sur o2switch
- ne laisser au serveur que l'installation runtime et le redemarrage Passenger

### 8. Logging et debug

Une couche de logging centralisee a ete ajoutee :

- logger structure central
- route `/api/logs`
- page `/logs`
- integration des logs auth, DB, API, serveur et client
- fusion du runtime auth / DB probe dans `/logs`

Notes :

- `/logs` est volontairement publique temporairement pour debloquer le debug prod
- `/api/debug/auth-check` est encore present comme secours temporaire
- ces routes doivent etre fermees ou supprimees une fois la stabilisation terminee

### 9. Correctifs UI / hydration

Plusieurs correctifs de stabilite et de presentation ont ete appliques :

- correction de `SakuraDecor` pour supprimer les mismatches SSR / hydration
- migration de plusieurs icones vers Lucide dans le lecteur video
- correction de textes mal encodes
- correction du flux de login qui pouvait spinner a l'infini
- correction du proxy / lecture de session qui creait une boucle vers `/login`
- page `/logs` rendue plus compacte et responsive

## Tests et outillage ajoutes

Une couverture de tests a ete ajoutee ou etendue autour de :

- local dev mode
- auth guards
- auth proxy
- login flow
- Prisma local
- data store local
- repository perf
- cache navigateur
- hybrid content
- logs dashboard / logs route / logs layout
- packaging o2switch
- correctif Sakura / UI copy

## Etat actuel de la production

Le projet est fonctionnel, mais encore en phase de stabilisation.

Points a surveiller en ce moment :

- erreurs DB encore visibles par moments dans `/logs`
- sensibilite de `DATABASE_URL` en production quand le mot de passe MySQL contient des caracteres speciaux
- debug auth encore volontairement expose pour investigation
- quelques regressions UI / responsive / traduction encore a traiter
- certains endpoints likes / favorites / kimono session ont deja ete durcis, mais l'ensemble n'est pas encore totalement fiabilise

## Recommandations court terme

### A faire en priorite

1. stabiliser completement la configuration DB de production
2. fermer ou securiser `/logs` et `/api/debug/auth-check`
3. finaliser l'anglais de l'UI
4. corriger le responsive des cards
5. ajouter les titres de page dynamiques
6. ajouter la duree video sur les post cards / media cards

### A verifier apres chaque deploy

- `/logs`
- `/api/logs`
- `/api/search-creators`
- `/api/popular-posts`
- login admin
- navigation `/search`, `/creator`, `/post`

## Commandes utiles

### Local

```bash
npm run dev
npm test
npm run build
npm run prisma:generate
npm run prisma:push
```

### Packaging o2switch

```powershell
cd C:\Users\lilsm\Workspace\Kimono\Kimono
npm run build:o2switch-package
```

### Debug MySQL cote serveur

```bash
/usr/bin/mariadb -u dosa4307_kimono -p -h localhost dosa4307_kimono
```

## Resume ultra court

Kimono a beaucoup evolue pendant cette passe :

- architecture local / prod separee
- caching hybride et prechauffage
- deploiement Linux prebuild pour o2switch
- outils de debug serveur enfin visibles via `/logs`
- plusieurs correctifs auth, session, hydration et UX

Le projet est beaucoup mieux structure qu'au depart, mais la phase actuelle reste une phase de hardening avant de refermer les routes de debug et de finaliser la polish UI.
