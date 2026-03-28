# Audit Phase 1 — DB, routes API, types et TTL actuels

Date: 2026-03-26
Périmètre lu: `deploy/o2switch-init.sql`, `lib/data-store.ts`, `lib/perf-repository.ts`, `lib/hybrid-content.ts`, `lib/api/kemono.ts`, `lib/api/coomer.ts`, `prisma/schema.prisma`, `app/api/*/route.ts`

## Résumé exécutif

L’existant repose aujourd’hui sur deux couches de persistance partiellement parallèles:

- `lib/data-store.ts` pour l’auth, les sessions Kimono, les snapshots favoris/discover et les snapshots créateur hérités
- `lib/perf-repository.ts` pour les index/cache MySQL de prod et leur miroir SQLite local

Les écarts les plus importants constatés sont:

- le bootstrap MySQL [`o2switch-init.sql`](C:/Users/lilsm/Workspace/Kimono/Kimono/deploy/o2switch-init.sql) est incomplet par rapport au runtime réel
- le schéma Prisma local [`schema.prisma`](C:/Users/lilsm/Workspace/Kimono/Kimono/prisma/schema.prisma) est en retard sur plusieurs tables et colonnes déjà utilisées en prod/runtime
- plusieurs données sont stockées en double ou en quasi-double:
  - `CreatorsCache` + `CreatorIndex`
  - `PostCache` + `CreatorSnapshot(posts)`
  - `FavoriteSnapshot` + cache session en mémoire
- des headers upstream `Accept: text/css` restent présents à plusieurs endroits
- certains endpoints content sont déjà propres (`x-kimono-source`, orchestrateur `hybrid-content`), mais d’autres contournent encore les conventions visées (`recommended`, `likes/posts`, diagnostics/admin)

## 1.1 Tables actuelles

### Vue d’ensemble

| Table | Présente bootstrap SQL | Présente runtime | Présente Prisma | Verdict |
| --- | --- | --- | --- | --- |
| `User` | oui | oui | oui | GARDER |
| `Passkey` | oui | oui | oui | GARDER |
| `Session` | oui | oui | oui | GARDER |
| `KimonoSession` | oui | oui | oui | GARDER |
| `CreatorsCache` | oui | oui | oui | FUSIONNER avec `CreatorIndex` |
| `CreatorIndex` | oui | oui | oui | GARDER pour l’instant, RESTRUCTURER ensuite |
| `FavoriteChronology` | non | oui | non | GARDER pour l’instant, RESTRUCTURER ensuite |
| `FavoriteSnapshot` | non | oui | non | FUSIONNER à évaluer |
| `CreatorSnapshot` | non | oui | non | FUSIONNER avec `PostCache` / `CreatorIndex` |
| `PostCache` | oui | oui | oui | GARDER pour l’instant, RESTRUCTURER ensuite |
| `PreviewAssetCache` | oui | oui | oui mais incomplet | RESTRUCTURER |
| `MediaSourceCache` | oui | oui | non | GARDER pour l’instant, RESTRUCTURER ensuite |
| `CreatorSearchCache` | oui | oui | non | RESTRUCTURER / utilité à réévaluer |
| `PopularSnapshot` | oui | oui | oui | FUSIONNER avec `PostCache` ou table dérivée à réévaluer |
| `DiscoveryBlock` | oui | oui | oui | GARDER |
| `DiscoveryCache` | oui | oui | oui | GARDER pour l’instant, RESTRUCTURER ensuite |

### `User`

- Colonnes:
  - `id VARCHAR(191) PK`
  - `email VARCHAR(191) UNIQUE NOT NULL`
  - `totpSecret VARCHAR(191) NULL`
  - `totpEnabled BOOLEAN NOT NULL DEFAULT 0`
  - `createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`
- Colonnes runtime absentes du bootstrap SQL: aucune
- Rôle réel: état utilisateur durable auth/2FA
- Consommateurs:
  - lecture/écriture via [`lib/data-store.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/data-store.ts)
  - [`app/api/auth/totp/setup/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/auth/totp/setup/route.ts)
  - auth stack via NextAuth handlers
- Verdict: **GARDER**

### `Passkey`

- Colonnes:
  - `id VARCHAR(191) PK`
  - `userId VARCHAR(191) NOT NULL`
  - `credentialId VARCHAR(191) UNIQUE NOT NULL`
  - `publicKey TEXT NOT NULL`
  - `counter BIGINT NOT NULL`
  - `deviceName VARCHAR(191) NULL`
  - `createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`
  - FK `userId -> User.id`
- Colonnes runtime absentes du bootstrap SQL: aucune
- Rôle réel: auth WebAuthn durable
- Consommateurs: auth stack NextAuth / WebAuthn
- Verdict: **GARDER**

### `Session`

- Colonnes:
  - `id VARCHAR(191) PK`
  - `userId VARCHAR(191) NOT NULL`
  - `token VARCHAR(191) UNIQUE NOT NULL`
  - `expiresAt DATETIME(3) NOT NULL`
  - FK `userId -> User.id`
- Colonnes runtime absentes du bootstrap SQL: aucune
- Rôle réel: sessions auth Kimono
- Consommateurs: auth stack NextAuth
- Verdict: **GARDER**

### `KimonoSession`

- Colonnes:
  - `id VARCHAR(191) PK`
  - `site VARCHAR(191) NOT NULL`
  - `cookie TEXT NOT NULL`
  - `username VARCHAR(191) NOT NULL`
  - `savedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`
- Colonnes runtime absentes du bootstrap SQL: aucune
- Rôle réel: session upstream persistée Kemono/Coomer
- Consommateurs:
  - [`lib/data-store.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/data-store.ts)
  - [`lib/kimono-login-route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/kimono-login-route.ts)
  - [`lib/remote-session.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/remote-session.ts)
  - routes `kimono-login`, `kimono-favorites`, `kimono-session-status`, `likes/*`, `creator-posts`, `creator-posts/search`, `post`, `media-source/warm`
- Verdict: **GARDER**

### `CreatorsCache`

- Colonnes:
  - `site VARCHAR(191) PK`
  - `data LONGTEXT NOT NULL`
  - `updatedAt DATETIME(3) NOT NULL`
- Colonnes runtime absentes du bootstrap SQL: aucune
- Rôle réel: blob brut du catalogue complet d’un site
- Consommateurs:
  - [`lib/api/creators-cache.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/api/creators-cache.ts)
  - [`lib/api/kemono.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/api/kemono.ts)
  - [`lib/api/coomer.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/api/coomer.ts)
  - [`lib/server/creator-index-startup.cjs`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/server/creator-index-startup.cjs)
- Verdict: **FUSIONNER avec `CreatorIndex`**
  - stocke le même catalogue déjà normalisé dans `CreatorIndex`

### `CreatorIndex`

- Colonnes:
  - `site VARCHAR(32) NOT NULL`
  - `service VARCHAR(191) NOT NULL`
  - `creatorId VARCHAR(191) NOT NULL`
  - `name VARCHAR(191) NOT NULL`
  - `normalizedName VARCHAR(191) NOT NULL`
  - `favorited INT NOT NULL DEFAULT 0`
  - `updatedAt DATETIME(3) NULL`
  - `indexedAt DATETIME(3) NULL`
  - `profileImageUrl TEXT NULL`
  - `bannerImageUrl TEXT NULL`
  - `publicId VARCHAR(191) NULL`
  - `postCount INT NULL`
  - `rawPreviewPayload LONGTEXT NULL`
  - `syncedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`
  - PK `(site, service, creatorId)`
  - index `normalizedName`
  - index `(site, syncedAt)`
- Colonnes runtime absentes du bootstrap SQL: aucune
- Rôle réel: index durable et searchable des créateurs
- Consommateurs:
  - écriture par [`lib/perf-repository.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/perf-repository.ts) et [`lib/server/creator-index-startup.cjs`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/server/creator-index-startup.cjs)
  - lecture par [`lib/hybrid-content.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/hybrid-content.ts), admin DB explorer, dashboard santé
  - routes `search-creators`, `creator-profile`, jobs snapshot/admin resync
- Verdict: **GARDER pour l’instant, RESTRUCTURER ensuite**

### `FavoriteChronology`

- Présence:
  - runtime `data-store.ts`: oui
  - bootstrap SQL: non
  - Prisma: non
- Colonnes runtime:
  - `kind VARCHAR(32) NOT NULL`
  - `site VARCHAR(32) NOT NULL`
  - `service VARCHAR(191) NOT NULL`
  - `creatorId VARCHAR(191) NOT NULL`
  - `postId VARCHAR(191) NOT NULL DEFAULT ''`
  - `favoritedAt DATETIME(3) NOT NULL`
  - PK `(kind, site, service, creatorId, postId)`
  - index `(kind, favoritedAt)`
- Rôle réel: ordre utilisateur exact des likes/favorites
- Consommateurs:
  - [`lib/data-store.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/data-store.ts)
  - [`lib/kimono-favorites-route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/kimono-favorites-route.ts)
  - [`lib/likes-posts-route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/likes-posts-route.ts)
  - routes `likes/creators`, `likes/posts`, `admin/db/[table]`
- Verdict: **GARDER pour l’instant, RESTRUCTURER ensuite**
  - utile fonctionnellement, mais hors bootstrap et hors Prisma

### `FavoriteSnapshot`

- Présence:
  - runtime `data-store.ts`: oui
  - bootstrap SQL: non
  - Prisma: non
- Colonnes runtime:
  - `kind VARCHAR(32) NOT NULL`
  - `site VARCHAR(32) NOT NULL`
  - `data LONGTEXT NOT NULL`
  - `updatedAt DATETIME(3) NOT NULL`
  - PK `(kind, site)`
- Rôle réel: snapshot persistant de secours des favoris créateurs/posts
- Consommateurs:
  - [`lib/kimono-favorites-route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/kimono-favorites-route.ts)
  - [`lib/likes-posts-route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/likes-posts-route.ts)
  - [`app/api/discover/compute/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/discover/compute/route.ts)
  - admin routes `resync-favorites`, `admin/db/[table]`
- Verdict: **FUSIONNER à évaluer**
  - recouvre partiellement le cache session upstream mémoire

### `CreatorSnapshot`

- Présence:
  - runtime `data-store.ts`: oui
  - bootstrap SQL: non
  - Prisma: non
- Colonnes runtime:
  - `kind VARCHAR(32) NOT NULL`
  - `site VARCHAR(32) NOT NULL`
  - `service VARCHAR(191) NOT NULL`
  - `creatorId VARCHAR(191) NOT NULL`
  - `pageOffset INT NOT NULL DEFAULT 0`
  - `queryKey VARCHAR(255) NOT NULL DEFAULT ''`
  - `data LONGTEXT NOT NULL`
  - `updatedAt DATETIME(3) NOT NULL`
  - PK `(kind, site, service, creatorId, pageOffset, queryKey)`
  - index `(site, service, creatorId, updatedAt)`
- Rôle réel: snapshot de secours profil/posts créateur
- Consommateurs:
  - [`lib/hybrid-content.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/hybrid-content.ts)
  - [`app/api/creator-posts/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/creator-posts/route.ts) en `scope=snapshot`
  - jobs `cache-jobs/creator-snapshot`
- Verdict: **FUSIONNER avec `PostCache` / `CreatorIndex`**
  - doublonne un fallback déjà approché par `PostCache` et `CreatorIndex`
### `PostCache`

- Colonnes:
  - `site`, `service`, `creatorId`, `postId`
  - `title`, `excerpt`
  - `publishedAt`, `addedAt`, `editedAt`
  - `previewImageUrl`, `videoUrl`, `thumbUrl`, `mediaType`, `authorName`
  - `rawPreviewPayload`, `rawDetailPayload`
  - `detailLevel`, `sourceKind`
  - `longestVideoUrl`, `longestVideoDurationSeconds`
  - `previewThumbnailAssetPath`, `previewClipAssetPath`
  - `previewStatus`, `previewGeneratedAt`, `previewError`, `previewSourceFingerprint`
  - `cachedAt`, `expiresAt`
  - PK `(site, service, creatorId, postId)`
  - indexes creator, `expiresAt`, `previewSourceFingerprint`
- Colonnes runtime absentes du bootstrap SQL: aucune
- Rôle réel: cache de métadonnées et détails de posts, avec enrichissement preview/media
- Consommateurs:
  - lecture/écriture massive par [`lib/hybrid-content.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/hybrid-content.ts)
  - preview hydration, popular warmup, post detail, creator posts, popular
  - admin DB explorer
- Verdict: **GARDER pour l’instant, RESTRUCTURER ensuite**

### `PreviewAssetCache`

- Colonnes bootstrap SQL:
  - `site`, `sourceVideoUrl`, `sourceFingerprint`
  - `durationSeconds`
  - `thumbnailAssetPath`, `clipAssetPath`
  - `status`, `generatedAt`, `lastSeenAt`, `error`
- Colonnes runtime supplémentaires absentes du bootstrap SQL:
  - `mediaKind`
  - `mimeType`
  - `width`
  - `height`
  - `nativeThumbnailUrl`
  - `probeStatus`
  - `artifactStatus`
  - `firstSeenAt`
  - `hotUntil`
  - `retryAfter`
  - `generationAttempts`
  - `lastError`
  - `lastObservedContext`
- Prisma: ne contient que la version bootstrap, pas les colonnes runtime ci-dessus
- Rôle réel: registre des mini-assets serveur + métadonnées média enrichies
- Consommateurs:
  - [`lib/popular-preview-assets.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/popular-preview-assets.ts)
  - [`lib/media-platform.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/media-platform.ts)
  - [`lib/post-preview-hydration.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/post-preview-hydration.ts)
  - routes preview/media/admin
- Verdict: **RESTRUCTURER**

### `MediaSourceCache`

- Présence:
  - bootstrap SQL: oui
  - runtime: oui
  - Prisma: non
- Colonnes:
  - `site`, `sourceVideoUrl`, `sourceFingerprint`
  - `localVideoPath`
  - `downloadStatus`, `downloadedAt`, `lastSeenAt`, `retentionUntil`
  - `fileSizeBytes`, `mimeType`
  - `downloadError`, `downloadAttempts`
  - `lastObservedContext`, `priorityClass`, `retryAfter`, `firstSeenAt`
  - PK `(site, sourceFingerprint)`
  - indexes `lastSeenAt`, `retentionUntil`, `priorityClass`
- Colonnes runtime absentes du bootstrap SQL: aucune
- Rôle réel: cache source vidéo locale pour playback/liked
- Consommateurs:
  - [`lib/popular-preview-assets.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/popular-preview-assets.ts)
  - [`lib/media-platform.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/media-platform.ts)
  - [`lib/post-video-sources.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/post-video-sources.ts)
  - routes `post`, `media-source/warm`, `media-source/[site]/[sourceFingerprint]`, `download`, admin purge/db
- Verdict: **GARDER pour l’instant, RESTRUCTURER ensuite**

### `CreatorSearchCache`

- Présence:
  - bootstrap SQL: oui
  - runtime: oui
  - Prisma: non
- Colonnes:
  - `site`, `service`, `creatorId`
  - `normalizedQuery`, `media`, `page`, `perPage`
  - `payloadJson`
  - `cachedAt`, `expiresAt`
  - PK `(site, service, creatorId, normalizedQuery, media, page, perPage)`
  - index `expiresAt`
- Rôle réel: cache des recherches filtrées paginées dans la page créateur
- Consommateurs:
  - [`lib/hybrid-content.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/hybrid-content.ts)
  - [`app/api/creator-posts/search/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/creator-posts/search/route.ts)
  - admin DB explorer
- Verdict: **RESTRUCTURER / utilité à réévaluer**

### `PopularSnapshot`

- Colonnes:
  - `snapshotRunId`, `rank`
  - `site`, `period`, `rangeKey`, `pageOffset`, `snapshotDate`, `syncedAt`
  - `postSite`, `postService`, `creatorId`, `postId`
  - PK `(snapshotRunId, rank)`
  - indexes lookup and `snapshotDate`
- Colonnes runtime absentes du bootstrap SQL: aucune
- Rôle réel: index ordonné des posts popular pour un run donné
- Consommateurs:
  - [`lib/hybrid-content.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/hybrid-content.ts)
  - [`app/api/popular-posts/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/popular-posts/route.ts)
  - jobs `popular-warmup`, admin resync/db
- Verdict: **FUSIONNER avec `PostCache` ou table dérivée à réévaluer**

### `DiscoveryBlock`

- Colonnes:
  - `id VARCHAR(191) PK`
  - `site VARCHAR(191) NOT NULL`
  - `service VARCHAR(191) NOT NULL`
  - `creatorId VARCHAR(191) NOT NULL`
  - `blockedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`
  - unique `(site, service, creatorId)`
- Colonnes runtime absentes du bootstrap SQL: aucune
- Rôle réel: blocage manuel pour recommandations Discover
- Consommateurs:
  - [`app/api/discover/block/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/discover/block/route.ts)
  - [`app/api/discover/results/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/discover/results/route.ts)
  - [`app/api/discover/compute/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/discover/compute/route.ts)
- Verdict: **GARDER**

### `DiscoveryCache`

- Colonnes:
  - `id VARCHAR(191) PK`
  - `data LONGTEXT NOT NULL`
  - `updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`
- Colonnes runtime absentes du bootstrap SQL: aucune
- Rôle réel: cache global des recommandations Discover calculées
- Consommateurs:
  - [`app/api/discover/compute/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/discover/compute/route.ts)
  - [`app/api/discover/results/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/discover/results/route.ts)
- Verdict: **GARDER pour l’instant, RESTRUCTURER ensuite**

## 1.2 Routes API actuelles

### Légende verdict

- **GARDER**: rôle utile et encore cohérent
- **RENOMMER**: nomenclature actuelle peu cohérente
- **FUSIONNER**: recouvre une autre route ou un même contrat métier
- **SUPPRIMER**: debug/legacy ou contournement manifeste

### Tableau des routes

| Route | Tables DB lues/écrites | Upstream déclenché | Types principaux | Verdict |
| --- | --- | --- | --- | --- |
| `/api/auth/[...nextauth]` | `User`, `Passkey`, `Session` via NextAuth | non direct | handlers auth | GARDER |
| `/api/auth/totp/setup` | `User` | non | session auth, `StoredUser` | GARDER |
| `/api/kimono-login` | `KimonoSession` écriture | `POST /api/v1/authentication/login` | `KimonoLoginResult` | GARDER |
| `/api/kimono-session-status` | `KimonoSession` lecture | non | simple JSON status | GARDER |
| `/api/kimono-favorites` GET | `KimonoSession`, `FavoriteSnapshot`, `FavoriteChronology` | `/api/v1/account/favorites?type=artist` | `KimonoFavoritesPayload` | GARDER |
| `/api/kimono-favorites` DELETE | `KimonoSession` suppression | non | `{ success: boolean }` | GARDER |
| `/api/likes/creators` GET | `KimonoSession`, `FavoriteSnapshot`, `FavoriteChronology` via helper | `/api/v1/account/favorites?type=artist` | array de `FavoriteCreatorListItem` | FUSIONNER à terme avec `/api/kimono-favorites` |
| `/api/likes/creators` POST/DELETE | `FavoriteChronology` écriture | `POST/DELETE /api/v1/favorites/creator/...` | body JSON libre | GARDER |
| `/api/likes/posts` GET | `KimonoSession`, `FavoriteSnapshot`, `FavoriteChronology`, `CreatorIndex` indirect, `PostCache` indirect | `/api/v1/account/favorites?type=post` | `LikesPostsPayload` | GARDER |
| `/api/likes/posts` POST/DELETE | `FavoriteChronology` écriture | `POST/DELETE /api/v1/favorites/post/...` | body JSON libre | GARDER |
| `/api/search-creators` | `CreatorIndex` | amont indirect seulement si index vide/obsolète au niveau jobs | `SearchFilter`, `SearchSort`, `HybridSearchResult` | RENOMMER |
| `/api/creator-profile` | `CreatorIndex`, `CreatorSnapshot` fallback | `/api/v1/{service}/user/{id}/profile` | `UnifiedCreator` | RENOMMER |
| `/api/creator-posts` | `PostCache`, `CreatorSnapshot`, `KimonoSession` indirect | `/api/v1/{service}/user/{id}/posts` | `UnifiedPost[]` ou snapshot scope payload | FUSIONNER avec route posts cible future |
| `/api/creator-posts/search` | `CreatorSearchCache`, `PostCache`, `KimonoSession` indirect | `/api/v1/{service}/user/{id}/posts?q=...` | `HybridCreatorPostsSearchResult` | FUSIONNER avec route posts cible future |
| `/api/post` | `PostCache`, `MediaSourceCache` | `/api/v1/{service}/user/{id}/post/{postId}` | `UnifiedPost & { videoSources }` | RENOMMER |
| `/api/popular-posts` | `PopularSnapshot`, `PostCache` | `/api/v1/posts/popular` | `HybridPopularResult` | RENOMMER |
| `/api/recent-posts` | pas de cache DB direct, hydratation preview indirecte | `/api/v1/recent` sur les deux sites | `UnifiedPost[]` | RENOMMER |
| `/api/recommended` | aucune | `/api/v1/{service}/user/{id}/recommended` | array libre | FUSIONNER avec discover ou SUPPRIMER |
| `/api/discover/compute` | `FavoriteSnapshot`, `DiscoveryCache`, `DiscoveryBlock` | `/api/v1/{service}/user/{id}/recommended` | `Favorite`, `RecommendedCreator`, `ScoredCreator` | GARDER |
| `/api/discover/results` | `DiscoveryCache`, `DiscoveryBlock` | non | `{ creators, updatedAt, total }` | GARDER |
| `/api/discover/block` | `DiscoveryBlock` | non | body `{ site, service, creatorId }` | GARDER |
| `/api/media-source/warm` | `MediaSourceCache`, `PostCache` indirect | detail post upstream si miss | payload local warm | GARDER |
| `/api/media-source/[site]/[sourceFingerprint]` | `MediaSourceCache` | non | stream local | GARDER |
| `/api/preview-assets/[...assetPath]` | aucune DB, filesystem | non | stream asset | GARDER |
| `/api/download` | `MediaSourceCache`, `PostCache` indirect | fetch direct du media upstream si source locale absente | stream attachment | GARDER |
| `/api/cache-jobs/creator-snapshot` | `CreatorIndex`, `CreatorSnapshot`, `PostCache`, `FavoriteSnapshot` indirect | catalogue créateurs, profils, posts | body `sites[]` | GARDER |
| `/api/cache-jobs/popular-warmup` | `PopularSnapshot`, `PostCache`, `PreviewAssetCache`, `MediaSourceCache` | `/api/v1/posts/popular` | body `sites[]`, `periods[]`, `recentOffsets[]` | GARDER |
| `/api/admin/db/[table]` | lecture tables admin listées | non | `AdminDbTableKey` | GARDER |
| `/api/admin/sessions` | `KimonoSession`, TOTP état via auth | non | payload admin sessions | GARDER |
| `/api/admin/sessions/[site]` | `KimonoSession` suppression | non | `{ site }` | GARDER |
| `/api/admin/actions/reset-db` | purge tables rebuildables | non | action admin | GARDER |
| `/api/admin/actions/resync-creator-index` | `CreatorIndex`, `CreatorsCache` | `/api/v1/creators(.txt)` | action admin | GARDER |
| `/api/admin/actions/resync-popular` | `PopularSnapshot`, `PostCache`, preview caches | `/api/v1/posts/popular` | action admin | GARDER |
| `/api/admin/actions/resync-favorites` | `KimonoSession`, `FavoriteSnapshot`, `PostCache` indirect | favorites upstream | action admin | GARDER |
| `/api/admin/actions/purge-media` | `PreviewAssetCache`, `MediaSourceCache` | non | action admin | GARDER |
| `/api/admin/actions/clear-cooldown` | état rate guard mémoire/fichier | non | action admin | GARDER |
| `/api/health` | lecture multi-tables via diagnostics | non | payload santé | GARDER |
| `/api/logs` GET/POST | logs applicatifs | non | logs payload | GARDER |
| `/api/debug/auth-check` | debug auth | non | debug payload | SUPPRIMER à terme |
| `/api/debug/env-db` | debug env DB | non | debug payload | SUPPRIMER à terme |

### Notes route par route

- Les routes content les plus propres actuellement sont `search-creators`, `creator-profile`, `creator-posts/search`, `popular-posts`, `post`:
  - validation minimale présente
  - passage par `hybrid-content`
  - `x-kimono-source` déjà renvoyé
- Les routes les moins alignées avec la cible:
  - [`/api/recommended`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/recommended/route.ts): fetch direct, `Accept: text/css`, pas de `canRequest()`, pas de header source, aucun cache
  - [`/api/likes/posts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/likes/posts/route.ts): axios direct, pas de rate guard uniforme, `Accept: text/css`
  - [`/api/recent-posts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/recent-posts/route.ts): pas de `x-kimono-source`, pas de fallback structuré
  - [`/api/creator-posts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/creator-posts/route.ts): garde encore un `scope=snapshot` legacy
## 1.3 Types TypeScript actuels

### Familles de types

#### Types upstream bruts

- [`lib/api/kemono.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/api/kemono.ts)
  - `Creator`
  - `Post`
- [`lib/api/coomer.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/api/coomer.ts)
  - réutilise `Creator` et `Post` de `kemono.ts`

#### Types unifiés côté app

- [`lib/api/helpers.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/api/helpers.ts)
  - `Site`
  - `PostVideoSource`
  - `UnifiedPost`
  - `UnifiedCreator`
  - `ResolvedPostMedia`
  - `ResolvedListingPostMedia`
- [`lib/api/unified.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/api/unified.ts)
  - réexporte `Site`, `UnifiedPost`, `UnifiedCreator`

#### Types de stockage/auth legacy

- [`lib/data-store.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/data-store.ts)
  - `SupportedSite`
  - `StoredUser`
  - `StoredKimonoSession`
  - `StoredCacheRecord`
  - `StoredDiscoveryBlock`
  - `StoredFavoriteChronology`
  - `StoredFavoriteChronologyKind`
  - `StoredFavoriteSnapshotKind`
  - `StoredCreatorSnapshotKind`
  - `DataStore`

#### Types repository/cache prod

- [`lib/perf-repository.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/perf-repository.ts)
  - `Site`
  - `CreatorSnapshotInput`
  - `SearchCreatorRecord`
  - `SearchCreatorsPageResult`
  - `PostCacheInput`
  - `PostCacheRecord`
  - `PreviewAssetCacheInput/Record`
  - `MediaSourcePriorityClass`
  - `MediaSourceCacheInput/Record`
  - `CreatorSearchCacheMedia`
  - `CreatorSearchCachePayload/Input/Record`
  - `PopularSnapshotInput/Result`
  - `PerformanceRepository`

#### Types métier / payloads de routes

- [`lib/hybrid-content.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/hybrid-content.ts)
  - `HybridSearchResult`
  - `HybridCreatorPostsSearchResult`
  - `HybridPopularResult`
  - `PopularWarmupPreviewSummary`
- [`lib/kimono-favorites-route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/kimono-favorites-route.ts)
  - `KimonoFavoritesPayload`
- [`lib/likes-posts-route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/likes-posts-route.ts)
  - `LikesPostsPayload`
- [`lib/kimono-login-route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/kimono-login-route.ts)
  - `KimonoLoginResult`

### Incohérences majeures

1. `Creator` upstream vs stockage local
- `lib/api/kemono.ts::Creator` a `indexed` et `updated` typés `string`
- `perf-repository.ts::SearchCreatorRecord` expose `updated` et `indexed` comme `string | null`
- `CreatorIndex` SQL les stocke en `DATETIME`
- incohérence de contrat entre upstream brut, DB et payloads app

2. `Post` upstream est trop strict et incomplet
- `lib/api/kemono.ts::Post` impose:
  - `title: string`
  - `content: string`
  - `published: string`
  - `added: string`
  - `edited: string`
  - `file: { name; path }`
- en pratique l’API upstream peut renvoyer des champs `null`, absents, ou des structures partielles
- le type ne modélise pas non plus plusieurs champs déjà évoqués comme importants:
  - `tags`
  - `prev`
  - `next`
  - `fav_count`

3. même entité, noms différents selon couches
- `UnifiedPost.user` = identifiant créateur upstream
- `PostCacheRecord.creatorId` = même concept
- `SearchCreatorRecord.id` = même concept que `creatorId`
- cette variation rend les mappings plus fragiles qu’ils ne devraient l’être

4. `StoredCacheRecord` masque trop d’informations
- `data-store.ts` fait porter `FavoriteSnapshot`, `CreatorSnapshot`, `DiscoveryCache`, `CreatorsCache` par un type opaque:
  - `data: string`
  - `updatedAt: Date`
- conséquence:
  - pas de contrat de contenu partagé
  - parsing JSON dispersé
  - duplication de validation dans plusieurs helpers

5. Prisma n’est pas aligné sur les types runtime
- absents du schéma Prisma:
  - `MediaSourceCache`
  - `CreatorSearchCache`
  - `FavoriteChronology`
  - `FavoriteSnapshot`
  - `CreatorSnapshot`
- incomplet dans Prisma:
  - `PreviewAssetCache` n’a pas les colonnes runtime enrichies

6. `UnifiedPost` mélange brut upstream + enrichissement Kimono
- pratique pour le rendu
- mais brouille la frontière entre:
  - données sources upstream
  - cache DB
  - enrichissements media
  - état de playback local

## 1.4 TTL actuels

### TTL présents dans les fichiers cibles

| Fichier | Constante / usage | Valeur | Unité | Rôle |
| --- | --- | --- | --- | --- |
| `lib/perf-cache.ts` | `CREATOR_SNAPSHOT_TTL_MS` | `36 * 60 * 60 * 1000` | 36h | fraîcheur `CreatorIndex` / snapshots créateur |
| `lib/perf-cache.ts` | `POPULAR_SNAPSHOT_TTL_MS` | `18 * 60 * 60 * 1000` | 18h | fraîcheur `PopularSnapshot` |
| `lib/perf-cache.ts` | `SERVER_POST_CACHE_TTL_MS` | `60 * 60 * 60 * 1000` | 1h | expiration `PostCache` côté serveur |
| `lib/perf-cache.ts` | `BROWSER_POST_CACHE_TTL_MS` | `24 * 60 * 60 * 1000` | 24h | cache navigateur des posts |
| `lib/hybrid-content.ts` | `ttlMs = SERVER_POST_CACHE_TTL_MS` | 1h par défaut | ms | défaut d’expiration à l’upsert `PostCache` |
| `lib/hybrid-content.ts` | `CREATOR_FILTERED_SEARCH_CACHE_TTL_MS` | `3 * 24 * 60 * 60 * 1000` | 3j | expiration `CreatorSearchCache` |
| `lib/perf-repository.ts` | `isSnapshotFresh(..., CREATOR_SNAPSHOT_TTL_MS)` | 36h | ms | `searchCreatorsPage().snapshotFresh` |
| `lib/perf-repository.ts` | `isSnapshotFresh(..., POPULAR_SNAPSHOT_TTL_MS)` | 18h | ms | `getPopularSnapshot().snapshotFresh` |
| `lib/data-store.ts` | aucun TTL hardcodé | n/a | n/a | couche de stockage seulement |

### TTL adjacents découverts pendant la lecture

Ces TTL ne sont pas dans les trois fichiers cibles stricts, mais ils pilotent déjà du comportement réel:

| Fichier | Constante | Valeur | Rôle |
| --- | --- | --- | --- |
| `lib/api/creators-cache.ts` | `CACHE_TTL_MS` | 10 min | fraîcheur `CreatorsCache` utilisé par `searchCreators()` legacy |
| `lib/kimono-favorites-route.ts` | `FAVORITES_FRESH_TTL_MS` | 45 s | cache session upstream favoris créateurs |
| `lib/kimono-favorites-route.ts` | `FAVORITES_STALE_TTL_MS` | 10 min | stale cache session upstream favoris créateurs |
| `lib/likes-posts-route.ts` | `FAVORITE_POSTS_FRESH_TTL_MS` | 45 s | cache session upstream favoris posts |
| `lib/likes-posts-route.ts` | `FAVORITE_POSTS_STALE_TTL_MS` | 10 min | stale cache session upstream favoris posts |
| `lib/server/creator-index-startup.cjs` | `CREATOR_INDEX_REFRESH_TTL_MS` | 24h | refresh périodique boot/catalogue |

### Constats TTL

- les TTL ne sont pas centralisés
- `perf-cache.ts` est déjà une pseudo-source de vérité partielle, mais:
  - les favoris ont leurs propres TTL ailleurs
  - le catalogue boot a encore son TTL à part
  - la recherche filtrée créateur a son TTL hardcodé dans `hybrid-content.ts`
- `data-store.ts` ne connaît aucun TTL, ce qui pousse la logique de fraîcheur dans les consumers
## Problèmes identifiés à ce stade

### P0

1. Bootstrap MySQL incomplet par rapport au runtime réel
- Fichiers:
  - [`deploy/o2switch-init.sql`](C:/Users/lilsm/Workspace/Kimono/Kimono/deploy/o2switch-init.sql)
  - [`lib/data-store.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/data-store.ts)
- Problème:
  - `FavoriteChronology`, `FavoriteSnapshot`, `CreatorSnapshot` existent au runtime mais pas dans le bootstrap
- Impact:
  - un MySQL “à froid” ne reflète pas le vrai schéma fonctionnel
  - nécessité de migrations runtime implicites
- Fix suggéré:
  - faire de `o2switch-init.sql` la source de vérité complète

2. Prisma local ne reflète pas le runtime prod actuel
- Fichier:
  - [`prisma/schema.prisma`](C:/Users/lilsm/Workspace/Kimono/Kimono/prisma/schema.prisma)
- Problème:
  - tables et colonnes manquantes déjà utilisées en prod/runtime
- Impact:
  - dev local trompeur
  - risque de divergence entre tests locaux et prod
- Fix suggéré:
  - synchroniser intégralement Prisma avec le schéma cible, sans changer l’approche SQLite-only

3. `Accept: text/css` reste encore partout dans les appels upstream
- Fichiers principaux:
  - [`lib/api/kemono.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/api/kemono.ts)
  - [`lib/api/coomer.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/api/coomer.ts)
  - [`lib/api/upstream.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/api/upstream.ts)
  - [`lib/kimono-login-route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/kimono-login-route.ts)
  - [`app/api/likes/creators/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/likes/creators/route.ts)
  - [`app/api/likes/posts/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/likes/posts/route.ts)
  - [`app/api/discover/compute/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/discover/compute/route.ts)
  - [`app/api/recommended/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/recommended/route.ts)
  - [`lib/server/creator-index-startup.cjs`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/server/creator-index-startup.cjs)
- Impact:
  - contrat HTTP incohérent
  - contrainte utilisateur non respectée
- Fix suggéré:
  - centraliser les headers upstream et remplacer par `Accept: application/json, text/plain, */*`

### P1

4. Redondance forte entre `CreatorsCache` et `CreatorIndex`
- Fichiers:
  - [`lib/api/creators-cache.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/api/creators-cache.ts)
  - [`lib/server/creator-index-startup.cjs`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/server/creator-index-startup.cjs)
- Impact:
  - double stockage du même catalogue
  - complexité de fraîcheur inutile
- Fix suggéré:
  - converger vers une seule table catalogue/searchable

5. `CreatorSnapshot` chevauche `PostCache` et `CreatorIndex`
- Fichier:
  - [`lib/hybrid-content.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/hybrid-content.ts)
- Impact:
  - double logique de fallback
  - complexité route `/api/creator-posts`
- Fix suggéré:
  - basculer vers un seul cache de posts/profils avec stratégie stale claire

6. `FavoriteSnapshot` duplique le cache session upstream
- Fichiers:
  - [`lib/kimono-favorites-route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/kimono-favorites-route.ts)
  - [`lib/likes-posts-route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/likes-posts-route.ts)
- Impact:
  - deux niveaux de cache pour la même donnée
  - invalidation plus difficile
- Fix suggéré:
  - clarifier si le snapshot est un fallback durable ou un vrai cache primaire

7. `PreviewAssetCache` est déjà “v2 runtime” mais bootstrap/Prisma sont restés “v1”
- Fichier:
  - [`lib/perf-repository.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/perf-repository.ts)
- Impact:
  - schéma non homogène
  - risque de bugs subtils entre local/prod/bootstrap
- Fix suggéré:
  - reconstruire la table avec son contrat complet

8. `/api/recommended` contourne l’orchestration centrale
- Fichier:
  - [`app/api/recommended/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/recommended/route.ts)
- Impact:
  - pas de rate guard unifié
  - pas de `x-kimono-source`
  - pas de cache/fallback structuré
- Fix suggéré:
  - fusionner dans une couche orchestrée type `hybrid-content`

9. `/api/likes/posts` n’utilise pas le même traitement rate limit que `/api/likes/creators`
- Fichiers:
  - [`app/api/likes/posts/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/likes/posts/route.ts)
  - [`app/api/likes/creators/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/likes/creators/route.ts)
- Impact:
  - gestion 429 incohérente
  - mutations account moins robustes
- Fix suggéré:
  - factoriser les mutations favorites derrière un même helper rate-guardé

### P2

10. Types upstream trop optimistes
- Fichier:
  - [`lib/api/kemono.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/api/kemono.ts)
- Impact:
  - erreurs silencieuses possibles sur champs `null`/absents
  - mappings défensifs dispersés ailleurs
- Fix suggéré:
  - assouplir et réaligner les interfaces sur l’API réelle

11. Les TTL sont déjà dispersés
- Fichiers:
  - [`lib/perf-cache.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/perf-cache.ts)
  - [`lib/hybrid-content.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/hybrid-content.ts)
  - favoris/session helpers
- Impact:
  - maintenance plus difficile
  - audit de fraîcheur non trivial
- Fix suggéré:
  - centraliser vers un futur `lib/config/ttl.ts`

12. Nommage des routes API hétérogène
- Exemples:
  - `search-creators`
  - `creator-profile`
  - `creator-posts`
  - `popular-posts`
  - `recent-posts`
- Impact:
  - surface API moins prévisible
- Fix suggéré:
  - converger vers une convention hiérarchique stable

### P3

13. Routes debug encore exposées dans l’arbre API
- Fichiers:
  - [`app/api/debug/auth-check/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/debug/auth-check/route.ts)
  - [`app/api/debug/env-db/route.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/app/api/debug/env-db/route.ts)
- Impact:
  - dette d’exploitation
- Fix suggéré:
  - soit les intégrer à l’admin, soit les supprimer

14. `data-store.ts` porte trop de responsabilités
- Fichier:
  - [`lib/data-store.ts`](C:/Users/lilsm/Workspace/Kimono/Kimono/lib/data-store.ts)
- Impact:
  - auth, sessions, snapshots, discover et favoris dans une seule interface
- Fix suggéré:
  - isoler la future couche DB par domaine

## Conclusion Phase 1

Le système tourne aujourd’hui, mais avec un schéma réel éclaté entre:

- bootstrap SQL incomplet
- migrations runtime implicites
- Prisma local en retard
- types TS fragmentés

Les points les plus structurants avant reconstruction sont désormais cartographiés:

- tables exactes et écarts bootstrap/runtime/Prisma
- routes à garder/fusionner/renommer/supprimer
- familles de types et incohérences de contrat
- TTL dispersés à centraliser

Fin de la Phase 1. Aucune proposition d’architecture cible ni modification de code métier dans ce document.
