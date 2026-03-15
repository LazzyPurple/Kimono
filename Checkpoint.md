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

- `prisma/schema.prisma` reste dedie au mode local SQLite
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

### 7. Phase `Popular` serveur-first

Un chantier specifique a ete lance pour faire de `Popular` la premiere surface vraiment prechauffee cote serveur.

Ce qui est deja en place :

- detection de la plus longue video d'un post
- calcul de la duree cote serveur
- generation de thumbnail et mini clip de preview
- stockage des assets sur disque serveur
- referencement des assets en base
- deduplication des previews deja traitees via empreinte video stable
- reutilisation d'un asset si une video reste populaire plusieurs jours
- cache HTTP plus agressif et immuable sur les assets de preview

### 8. Hydratation centrale des preview assets

Une couche centrale d'enrichissement des posts a ete ajoutee pour reinjecter des assets serveur quand ils existent deja.

Ce qui est en place :

- helper central d'hydratation des posts a partir du cache de preview assets
- `Popular` reste la source de production des assets serveur
- la couche hybride reutilise ensuite ces assets sur les principaux flux deja branches
- la logique reste suffisamment isolee pour garder une porte ouverte a un futur chemin plus SQL-first pour `Popular`

### 9. Optimisations images et cards media

Un lot de perf image a ete applique sur les listings :

- previews de listing via thumbnails CDN au lieu des images originales pleine resolution
- image detail conservee en pleine resolution sur la page post
- preconnect global vers les origines image et data Kemono / Coomer
- `referrerPolicy="no-referrer"` ajoute sur les images distantes des cards media
- priorisation des premieres cards deja visibles
- lazy loading conserve pour le reste des images
- rendu plus stable des previews media en mode serveur-first

### 10. Durcissement du debug et des logs

Le debug runtime a ete fortement resserre.

Ce qui est en place :

- garde d'acces centralisee pour les surfaces de diagnostic
- acces autorise en local, via session connectee, ou via `AUTH_DEBUG_TOKEN`
- payloads debug assainis pour ne plus exposer topologie DB ou metadata admin sensibles
- `/logs`, `/api/logs`, `/api/debug/auth-check` et `/api/debug/env-db` ne sont plus publics par defaut
- la page logs continue de servir de point d'entree operable en cas d'incident, avec un token de secours si necessaire

### 11. Deploiement o2switch

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

### 12. Logging, UI et hydration

Plusieurs correctifs de stabilite et de presentation ont ete appliques :

- correction de `SakuraDecor` pour supprimer les mismatches SSR / hydration
- migration de plusieurs icones vers Lucide dans le lecteur video
- correction de textes mal encodes
- correction du flux de login qui pouvait spinner a l'infini
- correction du proxy / lecture de session qui creait une boucle vers `/login`
- page `/logs` rendue plus compacte et responsive
- passage progressif de l'interface vers l'anglais
- titres de pages dynamiques
- durees video sur les cards

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
- debug gating et payloads assainis
- preview assets `Popular`
- hydratation centrale des preview assets
- optimisations images CDN / loading priority / lazy loading
- packaging o2switch
- correctif Sakura / UI copy

## Etat actuel de la production

Le projet est fonctionnel, mais encore en phase de stabilisation et de hardening.

Points a surveiller en ce moment :

- la DB de production reste sensible a une mauvaise valeur de `DATABASE_URL`
- les secrets montres dans des captures ou partages doivent etre tournes immediatement
- l'acces diagnostic doit rester exceptionnel et temporaire en prod
- `Popular` est beaucoup plus stable, mais certains listings peuvent encore etre optimises davantage
- toutes les surfaces ne reutilisent pas encore les assets serveur avec le meme niveau de couverture
- le backlog lint source reste ouvert meme si le bruit des artefacts generes a ete retire

## Recommandations court terme

### A faire en priorite

1. finir de propager les preview assets serveur a toutes les listes de posts encore non branchees
2. finaliser le hardening prod en supprimant ce qui reste de debug temporaire une fois la stabilisation finie
3. resorber le backlog lint source maintenant que `deploy-package/**` est ignore
4. regenerer l'artefact o2switch apres chaque lot significatif via `npm run build:o2switch-package`
5. continuer le polish UI et les optimisations de chargement sur les surfaces media les plus visibles
6. introduire a terme un vrai role admin si d'autres types d'utilisateurs arrivent

### A verifier apres chaque deploy

- `/logs` avec session admin ou token de secours si necessaire
- `/api/logs`
- `/api/search-creators`
- `/api/popular-posts`
- `/api/preview-assets/...`
- login admin
- navigation `/search`, `/creator`, `/post`, `/popular`, `/home`

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
- debug et logs securises
- phase `Popular` serveur-first avec preview assets dedupliques
- hydratation centrale des previews et optimisation images CDN sur les listings
- plusieurs correctifs auth, session, hydration et UX

Le projet est nettement plus structure qu'au depart. La phase actuelle est une phase de stabilisation finale avant generalisation complete des previews serveur, nettoyage du backlog lint et rotation des derniers secrets exposes.
