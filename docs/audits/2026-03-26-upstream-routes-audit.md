# Audit upstream Kimono — 2026-03-26

## Portée

Audit statique complet des connexions Kemono/Coomer utilisées par Kimono, du stockage local associé, des patterns media, des flux de données par page, et des problèmes structurels identifiés avant reconstruction DB.

Périmètre lu pour cet audit :
- `Kimono/lib/api/*`
- `Kimono/app/api/*/route.ts`
- `Kimono/lib/hybrid-content.ts`
- `Kimono/lib/popular-preview-assets.ts`
- `Kimono/lib/post-video-sources.ts`
- `Kimono/lib/media-platform.ts`
- `Kimono/lib/kimono-favorites-route.ts`
- `Kimono/lib/likes-posts-route.ts`
- `Kimono/lib/kimono-login-route.ts`
- `Kimono/lib/server/creator-index-startup.cjs`
- `Kimono/lib/perf-repository.ts`
- `Kimono/lib/data-store.ts`
- `Kimono/lib/server/startup-db-maintenance.cjs`
- pages principales sous `Kimono/app/(protected)/*`

Notes :
- Les routes admin, auth interne, logs et diagnostics sans appel upstream sont exclues des tableaux upstream.
- Les tailles de réponse sont estimées à partir des payloads attendus et du comportement code, pas d’un profiling réseau live.

---

## 1. Tableau récapitulatif des routes upstream

### 1.1 Routes Kemono/Coomer appelées directement

| Route upstream | Méthode | Appelée depuis | Headers / cookies | Timeout | Params | Réponse attendue | Taille typique | Fréquence | Bucket rate limit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `GET https://kemono.cr/api/v1/creators.txt` puis fallback `GET https://kemono.cr/api/v1/creators` | `GET` | `Kimono/lib/api/kemono.ts`, `Kimono/lib/api/upstream.ts`, `Kimono/lib/server/creator-index-startup.cjs` | `Accept: text/css` | `15000ms` via client `kemono.ts`, `60000ms` via `upstream.ts`, `180000ms` via `creator-index-startup.cjs` | aucun | tableau JSON de créateurs | très gros, potentiellement `108k+` entrées, dizaines de Mo | boot warmup, refresh 24h, resync admin, recherche si index vide/stale | `discover` seulement quand le client axios intercepté est utilisé; **aucun bucket** dans `upstream.ts` et `creator-index-startup.cjs` |
| `GET https://coomer.st/api/v1/creators.txt` puis fallback `GET https://coomer.st/api/v1/creators` | `GET` | `Kimono/lib/api/coomer.ts`, `Kimono/lib/api/upstream.ts`, `Kimono/lib/server/creator-index-startup.cjs` | `Accept: text/css` | `15000ms`, `60000ms`, `180000ms` selon le chemin | aucun | tableau JSON de créateurs | très gros, potentiellement `22k+` à `100k+` entrées | boot warmup, refresh 24h, resync admin, recherche si index vide/stale | `discover` seulement via `coomer.ts`; **aucun bucket** dans `upstream.ts` et `creator-index-startup.cjs` |
| `GET https://{site}/api/v1/recent?o={offset}` | `GET` | `Kimono/lib/api/kemono.ts`, `Kimono/lib/api/coomer.ts`, fan-out via `Kimono/lib/api/unified.ts`, exposé par `/api/recent-posts` | `Accept: text/css` | `15000ms` | `o` offset | tableau JSON de posts | moyen à gros, ~50 posts/page | page Home, pagination | `recent-popular` |
| `GET https://{site}/api/v1/posts/popular?period={period}[&date=...][&o=...]` | `GET` | `Kimono/lib/api/upstream.ts`, `Kimono/lib/hybrid-content.ts`, `/api/popular-posts`, warmup popular | `Accept: text/css` | pas de timeout explicite sur `fetch` | `period`, `date`, `o` | objet JSON `{ info, props, posts }` | moyen à gros, ~50 posts/page | page Popular, préfetch page suivante, warmup popular, resync admin | **aucun bucket direct** dans `upstream.ts` |
| `GET https://{site}/api/v1/{service}/user/{creatorId}/posts?o={offset}[&q=...][&tag=...]` | `GET` | `Kimono/lib/api/kemono.ts`, `Kimono/lib/api/coomer.ts`, `Kimono/lib/api/unified.ts`, `Kimono/lib/hybrid-content.ts`, `/api/creator-posts`, `/api/creator-posts/search` | `Accept: text/css`, `Cookie` optionnel | `15000ms` | `o`, `q`, `tag[]` | tableau JSON de posts | moyen, ~50 posts/page | page Creator, recherche filtrée créateur, jobs snapshot favoris | `creator-read` |
| `GET https://{site}/api/v1/{service}/user/{creatorId}/profile` | `GET` | `Kimono/lib/api/kemono.ts`, `Kimono/lib/api/coomer.ts`, `Kimono/lib/api/unified.ts`, `Kimono/lib/hybrid-content.ts`, `/api/creator-profile` | `Accept: text/css` | `15000ms` | aucun | objet JSON créateur/profil | petit | page Creator, page Post, warm favoris, fallback enrichissement noms | `creator-read` |
| `GET https://{site}/api/v1/{service}/user/{creatorId}/post/{postId}` | `GET` | `Kimono/lib/api/upstream.ts`, `Kimono/lib/hybrid-content.ts`, `/api/post`, `/api/media-source/warm`, `/api/download` | `Accept: text/css`, `Cookie` optionnel | `60000ms` | aucun | objet JSON `{ post }` ou post brut | moyen à gros, détail complet d’un post | page Post, fallback warm/download, lecture détaillée | **aucun bucket direct** dans `upstream.ts` |
| `GET https://{site}/api/v1/account/favorites?type=artist` | `GET` | `Kimono/lib/api/kemono.ts`, `Kimono/lib/api/coomer.ts`, `Kimono/lib/kimono-favorites-route.ts`, `/api/kimono-favorites` | `Accept: text/css`, `Cookie` requis | `15000ms` | `type=artist` | tableau JSON de créateurs favoris | moyen | page Favorites, refresh likes | `account` |
| `GET https://{site}/api/v1/account/favorites?type=post` | `GET` | `Kimono/lib/api/kemono.ts`, `Kimono/lib/api/coomer.ts`, `Kimono/lib/likes-posts-route.ts`, `/api/likes/posts` | `Accept: text/css`, `Cookie` requis | `15000ms` | `type=post` | tableau JSON de posts favoris | moyen | page Favorites, refresh likes posts | `account` |
| `POST https://{site}/api/v1/authentication/login` | `POST` | `Kimono/lib/kimono-login-route.ts`, `/api/kimono-login` | `Accept: text/css`, `Content-Type: application/json` | pas de timeout explicite | body `{ username, password }` | `200` + `set-cookie` session, ou erreur JSON | petit | login manuel | `account` |
| `POST https://{site}/api/v1/favorites/creator/{service}/{creatorId}` | `POST` | `/api/likes/creators` | `Accept: text/css`, `Cookie` requis | `15000ms` | path params | généralement vide / succès HTTP | très petit | toggle like créateur | `account` |
| `DELETE https://{site}/api/v1/favorites/creator/{service}/{creatorId}` | `DELETE` | `/api/likes/creators` | `Accept: text/css`, `Cookie` requis | `15000ms` | path params | généralement vide / succès HTTP | très petit | unlike créateur | `account` |
| `POST https://{site}/api/v1/favorites/post/{service}/{creatorId}/{postId}` | `POST` | `/api/likes/posts` | `Accept: text/css`, `Cookie` requis | `15000ms` | path params | généralement vide / succès HTTP | très petit | toggle like post | **pas de guard explicite** |
| `DELETE https://{site}/api/v1/favorites/post/{service}/{creatorId}/{postId}` | `DELETE` | `/api/likes/posts` | `Accept: text/css`, `Cookie` requis | `15000ms` | path params | généralement vide / succès HTTP | très petit | unlike post | **pas de guard explicite** |
| `GET https://{site}/api/v1/{service}/user/{creatorId}/recommended` | `GET` | `/api/recommended`, `/api/discover/compute` | `Accept: text/css` | `15000ms` | aucun | tableau JSON de créateurs recommandés | petit à moyen | onglet Similar sur page Creator, calcul Discover | `discover` pour `/api/discover/compute`; **aucun guard** pour `/api/recommended` |

### 1.2 Routes media/CDN upstream

| Pattern upstream | Méthode | Construction | Utilisation |
| --- | --- | --- | --- |
| `https://kemono.cr/data{path}` | `GET` | `Kimono/lib/api/helpers.ts` -> `buildFullMediaUrl()` | images et vidéos full-res sur cards, page Post, téléchargement, warm sources |
| `https://coomer.st/data{path}` | `GET` | `Kimono/lib/api/helpers.ts` -> `buildFullMediaUrl()` | idem Coomer |
| `https://img.kemono.cr/thumbnail/data{path}` | `GET` | `buildThumbnailMediaUrl()` | thumbs serveur sur listings |
| `https://img.coomer.st/thumbnail/data{path}` | `GET` | `buildThumbnailMediaUrl()` | thumbs serveur sur listings |
| `https://img.kemono.cr/icons/{service}/{creatorId}` et `/banners/...` | `GET` | `Kimono/lib/api/helpers.ts` -> `proxyCdnUrl()` | avatars / bannières creator |
| `https://img.coomer.st/icons/{service}/{creatorId}` et `/banners/...` | `GET` | `Kimono/lib/api/helpers.ts` -> `proxyCdnUrl()` | avatars / bannières creator |

### 1.3 Observations transverses sur les appels upstream

- Les clients `kemono.ts` et `coomer.ts` ont un vrai rate guard par bucket.
- `Kimono/lib/api/upstream.ts` contourne ce mécanisme pour `creators`, `popular` et `post detail`.
- Plusieurs appels JSON envoient `Accept: text/css`, y compris login, creators, posts, recommended, favorites.
- Aucun header `Accept-Encoding` explicite n’est envoyé.
- Les appels upstream media pour download/warm utilisent `fetch` avec `user-agent` spoofé, `referer` site, et `accept: video/*,*/*;q=0.8`.

---

## 2. Tableau récapitulatif des tables DB

### 2.1 Tables présentes côté MySQL bootstrap (`deploy/o2switch-init.sql`)

| Table | Schéma / clés / index | Alimentée par | TTL / expiration | Boot purge | Taille prod estimée | Lecteurs / écrivains |
| --- | --- | --- | --- | --- | --- | --- |
| `User` | `id PK`, `email UNIQUE`, `totpSecret`, `totpEnabled`, `createdAt` | auth locale | aucune | préservée | très faible | `data-store.ts`, auth/TOTP |
| `Passkey` | `id PK`, `credentialId UNIQUE`, FK `userId` | auth locale | aucune | préservée | très faible | auth |
| `Session` | `id PK`, `token UNIQUE`, FK `userId`, `expiresAt` | auth locale | expiration auth | préservée | faible | auth |
| `KimonoSession` | `id PK`, `site`, `cookie`, `username`, `savedAt` | `/api/kimono-login` | pas de TTL DB strict | préservée | très faible | `data-store.ts`, favorites, likes |
| `CreatorsCache` | `site PK`, `data`, `updatedAt` | warm creators / cache creators | TTL logique 10 min dans `creators-cache.ts` | préservée | 2 lignes, payload très gros | `data-store.ts`, `creator-index-startup.cjs`, `creators-cache.ts` |
| `CreatorIndex` | PK `(site, service, creatorId)`, index `normalizedName`, `(site, syncedAt)` | `creators.txt`/`creators` upstream | frais si `< 36h` (`CREATOR_SNAPSHOT_TTL_MS`) | préservée | très gros, `100k+` lignes | `perf-repository.ts`, `hybrid-content.ts`, search/admin |
| `PostCache` | PK `(site, service, creatorId, postId)`, indexes creator, `expiresAt`, `previewSourceFingerprint` | posts creator, post detail, popular | `expiresAt` par ligne, souvent `+1h` (`SERVER_POST_CACHE_TTL_MS`) ou `+18h` pour popular | purgeable | gros, facilement centaines de milliers | `perf-repository.ts`, `hybrid-content.ts`, admin |
| `PreviewAssetCache` | PK `(site, sourceFingerprint)`, index `lastSeenAt` | media-platform / preview generator | rétention via `lastSeenAt`, cleanup 7 jours | purgeable | moyen à gros | `perf-repository.ts`, `media-platform.ts`, `popular-preview-assets.ts`, admin |
| `MediaSourceCache` | PK `(site, sourceFingerprint)`, indexes `lastSeenAt`, `retentionUntil`, `priorityClass` | warm playback / liked | rétention par classe : `popular 72h`, `liked 336h`, `playback 24h` | purgeable | moyen, potentiellement gros en disque | `perf-repository.ts`, `popular-preview-assets.ts`, `post-video-sources.ts`, admin |
| `CreatorSearchCache` | PK `(site, service, creatorId, normalizedQuery, media, page, perPage)`, index `expiresAt` | recherche créateur fidèle | `3 jours` | purgeable | moyen | `perf-repository.ts`, `hybrid-content.ts`, admin |
| `PopularSnapshot` | PK `(snapshotRunId, rank)`, index lookup et `snapshotDate` | popular live + warmup | frais si `< 18h` (`POPULAR_SNAPSHOT_TTL_MS`) + cleanup date | purgeable | moyen | `perf-repository.ts`, `hybrid-content.ts`, admin |
| `DiscoveryBlock` | `id PK`, unique `(site, service, creatorId)` | `/api/discover/block` | aucune | purgeable | faible | `data-store.ts`, discover |
| `DiscoveryCache` | `id PK`, `data`, `updatedAt` | `/api/discover/compute` | pas de TTL stricte | purgeable | très faible | `data-store.ts`, discover |

### 2.2 Tables gérées par `data-store.ts` mais absentes du bootstrap SQL initial

| Table | Schéma réel | Alimentée par | TTL / expiration | Boot purge | Taille prod estimée | Lecteurs / écrivains |
| --- | --- | --- | --- | --- | --- | --- |
| `FavoriteChronology` | PK `(kind, site, service, creatorId, postId)`, index `(kind, favoritedAt)` | likes creators/posts | aucune, historique logique | préservée | faible à moyen | `data-store.ts`, `likes-posts-route.ts`, `likes/creators`, favorites page |
| `FavoriteSnapshot` | PK `(kind, site)` | upstream favorites creators/posts | fraîcheur logique 45s / stale 10 min côté session cache, pas de TTL DB | préservée | 4 lignes max | `kimono-favorites-route.ts`, `likes-posts-route.ts`, `hybrid-content.ts` |
| `CreatorSnapshot` | PK `(kind, site, service, creatorId, pageOffset, queryKey)`, index `(site, service, creatorId, updatedAt)` | profils/posts de créateurs, snapshots de secours | pas de TTL DB stricte, utilisé comme stale fallback | purgeable | moyen à gros | `data-store.ts`, `hybrid-content.ts` |

### 2.3 Détails de stockage local par table

#### `CreatorIndex`
- Source upstream : `GET /api/v1/creators.txt` ou `/api/v1/creators`
- Écriture :
  - `hybrid-content.ts` via `replaceCreatorSnapshot()`
  - `creator-index-startup.cjs` warmup MySQL direct
- Lecture :
  - `/api/search-creators`
  - `/api/creator-profile` fallback / sync status
  - admin dashboard / explorer
- Politique :
  - snapshot frais si `syncedAt < 36h`
  - warmup boot + refresh 24h
  - non purgé au boot

#### `CreatorsCache`
- Source upstream : même catalogue créateurs que `CreatorIndex`
- Rôle :
  - cache blob brut par site
  - utilisé par `creators-cache.ts`
- TTL logique :
  - `10 min`
- Non purgé au boot

#### `PostCache`
- Sources upstream :
  - `/user/{id}/posts`
  - `/post/{postId}`
  - `/posts/popular`
- Rôle :
  - cache metadata/detail
  - base de `PopularSnapshot`
  - fallback pour creator/post
- TTL :
  - `expiresAt` par enregistrement
  - standard `1h`
  - popular `18h`
- Purgée par reset manuel, plus au boot

#### `PreviewAssetCache`
- Source : pas directement upstream JSON, mais médias upstream `/data...`
- Rôle :
  - stocke métadonnées media, miniatures, clips, états de génération
- TTL / cleanup :
  - cleanup par `lastSeenAt`
  - rétention par défaut 7 jours

#### `MediaSourceCache`
- Source : téléchargements locaux depuis upstream full video
- Rôle :
  - source vidéo locale partagée
  - lecture locale via `/api/media-source`
- TTL / cleanup :
  - `retentionUntil`
  - popular 72h
  - liked 336h
  - playback 24h

#### `CreatorSearchCache`
- Source : recherche créateur fidèle recalculée à partir de `/user/{id}/posts`
- TTL :
  - `3 jours`
- Rôle :
  - éviter de rescanner l’upstream pour les mêmes filtres `q/media/page`

#### `PopularSnapshot`
- Source : `/posts/popular`
- TTL :
  - fraîcheur `18h`
  - nettoyage des snapshots plus anciens via date

#### `FavoriteSnapshot`
- Source :
  - `account/favorites?type=artist`
  - `account/favorites?type=post`
- Rôle :
  - fallback quand session upstream down/expired

#### `FavoriteChronology`
- Source :
  - `POST/DELETE favorites/creator`
  - `POST/DELETE favorites/post`
- Rôle :
  - tri "Added first"
  - restitution ordre de favoris même si upstream ne le donne pas proprement

#### `CreatorSnapshot`
- Source :
  - profil créateur live
  - posts créateur live
- Rôle :
  - fallback stale quand `PostCache` ou upstream indisponible

#### `DiscoveryCache` / `DiscoveryBlock`
- Source :
  - `recommended` upstream à partir des favoris snapshot
- Rôle :
  - cache global Discover
  - liste de créateurs exclus

### 2.4 Incohérences SQLite / MySQL / bootstrap

1. `deploy/o2switch-init.sql` ne crée pas `FavoriteChronology`, `FavoriteSnapshot`, `CreatorSnapshot`.
2. `deploy/o2switch-init.sql` a une version plus pauvre de `PreviewAssetCache` que `perf-repository.ts`.
3. `perf-repository.ts` ajoute des colonnes de migration runtime (`mediaKind`, `mimeType`, `width`, `height`, `nativeThumbnailUrl`, `probeStatus`, `artifactStatus`, `firstSeenAt`, `hotUntil`, `retryAfter`, `generationAttempts`, `lastError`, `lastObservedContext`) non visibles dans le bootstrap SQL initial.
4. Le schéma de prod réel dépend donc de migrations opportunistes au runtime, pas seulement du SQL de déploiement.

---

## 3. Tableau récapitulatif des patterns media

| Pattern | Construction | Cache headers / policy | Utilisé côté client |
| --- | --- | --- | --- |
| `https://{site}/data{path}` | `Kimono/lib/api/helpers.ts` -> `buildFullMediaUrl()` | dépend upstream | `MediaCard`, page Post, `VideoPlayer`, download fallback |
| `https://img.{site}/thumbnail/data{path}` | `buildThumbnailMediaUrl()` | dépend upstream CDN | listings, preview image candidates |
| `https://img.{site}/icons/{service}/{creatorId}` | `proxyCdnUrl(site, path)` | dépend CDN | `CreatorCard`, page Creator, page Post |
| `https://img.{site}/banners/{service}/{creatorId}` | `proxyCdnUrl(site, path)` | dépend CDN | potentiels headers creator |
| `/api/preview-assets/{relativePath}` | `popular-preview-assets.ts` -> `buildPreviewAssetPublicUrl()` | `public, max-age=86400, stale-while-revalidate=604800, immutable`, `206` range support | `MediaCard`, `resolveListingPostMedia`, previews générés localement |
| `/api/media-source/{site}/{sourceFingerprint}` | `popular-preview-assets.ts` -> `buildMediaSourcePublicUrl()` | `public, max-age=86400, stale-while-revalidate=604800, immutable`, `206` range support | `VideoPlayer` pour lecture locale |
| `/api/download?...` | construit par `VideoPlayer`/page Post via source descriptor | `private, no-store`, `Content-Disposition: attachment` | téléchargement vidéo same-origin sans souci CORS |

### Referrer / headers media notables

- Téléchargement source local :
  - `user-agent` navigateur spoofé
  - `referer: https://coomer.st/` ou `https://kemono.cr/`
  - `accept: video/*,*/*;q=0.8`
- Images de page Post :
  - `referrerPolicy="no-referrer"`

---

## 4. Flux de données par page

### 4.1 Home

```text
Client page /home
  -> GET /api/recent-posts?offset=N
    -> lib/recent-posts-route.ts
      -> lib/api/unified.ts.fetchRecentPosts()
        -> kemono.ts GET /api/v1/recent?o=N
        -> coomer.ts GET /api/v1/recent?o=N
      -> hydratePostsWithMediaPlatform()
        -> lit/écrit PreviewAssetCache
        -> lit/touche éventuellement MediaSourceCache
Fallback:
  - pas de stale DB explicite
  - erreur API => liste vide côté UI
Cache:
  - browser cache 24h
```

### 4.2 Popular

```text
Client page /popular/[site]
  -> GET /api/popular-posts?site&period&date&offset
    -> hybrid-content.getPopularPosts()
      -> lit PopularSnapshot + PostCache
      -> sinon upstream GET /api/v1/posts/popular
      -> hydrate posts + previews
      -> écrit PostCache
      -> remplace PopularSnapshot
Fallback:
  - stale snapshot DB
  - sinon { posts: [], info: null, props: null }
Cache:
  - browser cache 24h
  - snapshot DB 18h
```

### 4.3 Search

```text
Client page /search
  -> GET /api/search-creators?q&filter&sort&service&page&perPage
    -> hybrid-content.searchCreatorsPage()
      -> lit CreatorIndex
      -> si site stale/missing: resync via creators.txt/creators
Fallback:
  - réponse vide + source stale-cache
Cache:
  - browser cache 10 min
  - CreatorIndex 36h fraîcheur logique
```

### 4.4 Creator

```text
Client page /creator/[site]/[service]/[id]
  -> GET /api/creator-profile
    -> hybrid-content.getCreatorProfile()
      -> lit CreatorIndex
      -> sinon upstream /profile
      -> écrit CreatorIndex + CreatorSnapshot(profile)
      -> fallback stale CreatorSnapshot

  -> GET /api/creator-posts?offset=...
    -> hybrid-content.getCreatorPosts()
      -> lit PostCache frais
      -> sinon upstream /posts
      -> écrit PostCache + CreatorSnapshot(posts)
      -> fallback stale CreatorSnapshot(posts)

  -> GET /api/creator-posts/search?...q/media/page
    -> hybrid-content.searchCreatorPosts()
      -> lit CreatorSearchCache
      -> sinon scan upstream /posts (jusqu’à 10 pages)
      -> écrit CreatorSearchCache
      -> fallback stale CreatorSearchCache

  -> GET /api/recommended
    -> upstream /recommended direct
Fallback:
  - profile/posts: stale cache ou snapshot
  - recommended: liste vide
Cache:
  - browser cache 24h pour profile/posts/recommended
  - CreatorSearchCache 3 jours
```

### 4.5 Post

```text
Client page /post/[site]/[service]/[user]/[id]
  -> GET /api/post
    -> hybrid-content.getPostDetail()
      -> lit PostCache(full) frais
      -> sinon upstream /post/{id}
      -> écrit PostCache(full)
      -> hydrate videoSources via MediaSourceCache
      -> fallback stale PostCache ou CreatorSnapshot(posts)

  -> GET /api/creator-profile
    -> même flux que page Creator

  -> POST /api/media-source/warm (si lecture locale coomer)
    -> lit MediaSourceCache par fingerprint
    -> sinon refetch getPostDetail() puis valide path
    -> download local source si besoin

  -> GET /api/media-source/{site}/{fingerprint}
    -> stream fichier local

  -> GET /api/download?... (download vidéo)
    -> stream local si dispo
    -> sinon refetch detail + proxy upstream vidéo
Fallback:
  - stale PostCache / snapshot
  - player upstream direct si source locale absente
Cache:
  - browser cache 24h sur /api/post
  - PostCache 1h
  - MediaSourceCache suivant priorityClass
```

### 4.6 Favorites

```text
Client page /favorites
  -> GET /api/kimono-favorites?site=kemono|coomer
    -> kimono-favorites-route.ts
      -> session cache fresh 45s / stale 10 min
      -> upstream /account/favorites?type=artist avec cookie
      -> écrit FavoriteSnapshot(kind=creator)
      -> lit FavoriteChronology
      -> fallback FavoriteSnapshot

  -> GET /api/likes/posts?site=...
    -> likes-posts-route.ts
      -> session cache fresh 45s / stale 10 min
      -> upstream /account/favorites?type=post avec cookie
      -> écrit FavoriteSnapshot(kind=post)
      -> lit FavoriteChronology
      -> hydrate media previews
      -> fallback FavoriteSnapshot

  -> POST /api/kimono-login
    -> upstream /authentication/login
    -> écrit KimonoSession

  -> POST/DELETE /api/likes/creators
    -> upstream favorites/creator
    -> écrit FavoriteChronology

  -> POST/DELETE /api/likes/posts
    -> upstream favorites/post
    -> écrit FavoriteChronology
Fallback:
  - snapshot favori stale si upstream down
  - sinon état logged out / expired
Cache:
  - session upstream cache 45s fresh / 10 min stale
  - snapshots DB persistants
```

### 4.7 Discover

```text
Client page /discover
  -> GET /api/discover/results
    -> lit DiscoveryCache + DiscoveryBlock

  -> POST /api/discover/compute
    -> lit FavoriteSnapshot(kind=creator) pour kemono+coomer
    -> prend max 50 favoris
    -> pour chaque favori appelle upstream /recommended
    -> applique rate guard bucket discover
    -> écrit DiscoveryCache(global)

  -> POST/DELETE /api/discover/block
    -> écrit DiscoveryBlock
Fallback:
  - si aucun snapshot favoris: 409
  - sinon recommandations vides
Cache:
  - browser cache 24h sur résultats
  - DiscoveryCache sans TTL stricte
```

---

## 5. Problèmes identifiés

### P0

1. **Les appels upstream `popular`, `post detail` et `creator catalog` contournent le rate guard global**
   - Emplacement : `Kimono/lib/api/upstream.ts`, `Kimono/lib/server/creator-index-startup.cjs`
   - Impact : perf / résilience
   - Détail : `fetchPopularPostsFromSite()`, `fetchAllCreatorsFromSite()` et `fetchPostDetailFromSite()` n’utilisent pas les clients interceptés `kemono.ts` / `coomer.ts`.
   - Risque : pas de cooldown central sur certaines routes très lourdes.
   - Fix suggéré : unifier tous les appels upstream via un seul client par site, avec buckets explicites.

2. **`fetchPopularPostsFromSite()` n’a pas de timeout explicite**
   - Emplacement : `Kimono/lib/api/upstream.ts`
   - Impact : perf / disponibilité
   - Détail : appel `fetch()` direct sans `AbortController`.
   - Fix suggéré : ajouter un timeout contrôlé et le raccorder au guard.

3. **Le bootstrap SQL MySQL n’est pas la source de vérité complète du schéma**
   - Emplacement : `Kimono/deploy/o2switch-init.sql`, `Kimono/lib/perf-repository.ts`, `Kimono/lib/data-store.ts`
   - Impact : fonctionnel / maintenance
   - Détail : plusieurs tables et colonnes existent seulement via migrations runtime.
   - Fix suggéré : réaligner `o2switch-init.sql` sur le schéma runtime réel, ou introduire de vraies migrations versionnées.

### P1

4. **Usage systématique de `Accept: text/css` pour des endpoints JSON**
   - Emplacement : `Kimono/lib/api/kemono.ts`, `Kimono/lib/api/coomer.ts`, `Kimono/lib/api/upstream.ts`, `Kimono/app/api/recommended/route.ts`, `Kimono/app/api/discover/compute/route.ts`, `Kimono/lib/kimono-login-route.ts`, `Kimono/app/api/likes/*`
   - Impact : maintenabilité / compatibilité proxy/WAF
   - Fix suggéré : remplacer par `Accept: application/json, text/plain, */*`.

5. **Catalogue créateurs stocké en double**
   - Emplacement : `CreatorIndex` + `CreatorsCache`
   - Impact : stockage
   - Détail : `CreatorsCache` stocke le blob complet brut, tandis que `CreatorIndex` stocke chaque ligne normalisée.
   - Fix suggéré : décider si `CreatorsCache` reste un artefact de warm/debug ou doit être supprimé.

6. **`/api/recommended` n’applique pas de rate guard**
   - Emplacement : `Kimono/app/api/recommended/route.ts`
   - Impact : perf / risque 429
   - Détail : contrairement à `/api/discover/compute`, l’onglet Similar appelle upstream sans bucket `discover`.
   - Fix suggéré : mutualiser avec la même fonction guarded que Discover.

7. **`/api/likes/posts` ne passe pas par `upstream-rate-guard`**
   - Emplacement : `Kimono/app/api/likes/posts/route.ts`
   - Impact : risque 429 compte/session
   - Détail : contrairement aux likes creators, pas de `canRequest()`/`registerRateLimit()`.
   - Fix suggéré : appliquer le bucket `account` sur les mutations favorites post.

8. **Le warm playback refetch le détail de post si le fingerprint n’est pas trouvé**
   - Emplacement : `Kimono/app/api/media-source/warm/route.ts`
   - Impact : perf
   - Détail : fallback coûteux vers `getPostDetail()` pour valider le path.
   - Fix suggéré : conserver un mapping path -> fingerprint dans le payload client, ou un état serveur plus léger dédié au warm.

### P2

9. **`CreatorSnapshot` et `PostCache` se recouvrent partiellement**
   - Emplacement : `Kimono/lib/hybrid-content.ts`, `Kimono/lib/data-store.ts`, `Kimono/lib/perf-repository.ts`
   - Impact : stockage / complexité
   - Détail : les deux stockent des vues de posts créateur; l’un sert de cache frais, l’autre de fallback snapshot persistant.
   - Fix suggéré : clarifier les rôles, voire fusionner si une seule stratégie stale suffit.

10. **`FavoriteSnapshot` et session upstream cache doublonnent le même besoin**
    - Emplacement : `Kimono/lib/session-upstream-cache.ts`, `Kimono/lib/kimono-favorites-route.ts`, `Kimono/lib/likes-posts-route.ts`
    - Impact : complexité
    - Détail : il existe un cache session court et un snapshot DB plus durable pour les mêmes favoris.
    - Fix suggéré : documenter formellement la hiérarchie fresh/stale, ou réduire les couches.

11. **La route `discover/compute` ne traite que les snapshots de favoris, jamais le live**
    - Emplacement : `Kimono/app/api/discover/compute/route.ts`
    - Impact : fonctionnel
    - Détail : si les snapshots sont absents ou vieux, Discover reste incomplet.
    - Fix suggéré : proposer un mode "refresh favorites then compute" ou au moins signaler l’âge des snapshots.

12. **Des routes Kimono sont exposées mais servent surtout de compatibilité ou fallback**
    - Emplacement : `/api/creator-posts` avec `scope=snapshot`, `/api/recommended`
    - Impact : maintenance
    - Détail : certains chemins sont encore utilisés pour compatibilité mais ne devraient plus être la source principale.
    - Fix suggéré : inventorier les consommateurs restants et retirer ce qui n’est plus nécessaire.

### P3

13. **`creators-cache.ts` conserve un cache logique peu utilisé**
    - Emplacement : `Kimono/lib/api/creators-cache.ts`
    - Impact : hygiène
    - Détail : l’essentiel de la recherche repose désormais sur `CreatorIndex`.
    - Fix suggéré : vérifier les consommateurs réels et supprimer si redondant.

14. **Le commentaire et certaines chaînes montrent encore des artefacts d’encodage / ancienne logique**
    - Emplacement : `recent-posts`, quelques commentaires/traces
    - Impact : polish / maintenance
    - Fix suggéré : nettoyage mineur.

---

## 6. Synthèse

Kimono parle à Kemono/Coomer via quatre grandes familles de flux :
- catalogue créateurs (`creators.txt` / `creators`)
- listings/posts (`recent`, `popular`, `creator posts`, `post detail`)
- état compte (`login`, `favorites artist/post`, mutations favorite)
- recommandations (`recommended`)

Le stockage local est structuré en trois couches :
- **index durable** : `CreatorIndex`, `CreatorsCache`
- **caches de contenu** : `PostCache`, `PopularSnapshot`, `CreatorSearchCache`, `CreatorSnapshot`
- **caches media** : `PreviewAssetCache`, `MediaSourceCache`
- **état utilisateur** : `KimonoSession`, `FavoriteChronology`, `FavoriteSnapshot`, auth

Le principal point faible systémique n’est pas l’absence de cache, mais le fait que les chemins upstream ne sont pas uniformisés :
- une partie du trafic passe dans des clients guardés,
- une autre partie contourne le guard,
- le schéma DB réel dépend de migrations opportunistes au runtime.

Avant une reconstruction DB propre, les deux actions les plus rentables sont :
1. réaligner le schéma bootstrap avec le schéma runtime réel,
2. unifier les appels upstream derrière une seule abstraction avec timeout + bucket rate limit systématiques.
