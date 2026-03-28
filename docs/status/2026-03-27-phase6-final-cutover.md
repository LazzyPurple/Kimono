# Phase 6 — Bascule finale et nettoyage

Date: 2026-03-27
Statut: termine

## Resume
La Phase 6 finalise la bascule hors des couches legacy `data-store.ts`, `perf-repository.ts`, `creators-cache.ts` et `creator-index-startup.cjs`.
L'application lit maintenant via la nouvelle couche `lib/db/index.ts`, le boot serveur utilise `runCreatorSync`, les appelants frontend consomment les nouvelles routes REST hierarchiques, et les anciennes routes/fichiers ont ete retires.

## 6A — Migration des consommateurs internes legacy
Consommateurs migrés vers la nouvelle couche `lib/db/index.ts` et/ou ses modules de compatibilite :

- `lib/remote-session.ts`
- `lib/kimono-favorites-route.ts`
- `lib/likes-posts-route.ts`
- `lib/admin/admin-sessions.ts`
- `lib/post-video-sources.ts`
- `lib/popular-preview-assets.ts`
- `lib/post-preview-hydration.ts`
- `lib/media-platform.ts`
- `lib/admin/admin-db.ts`
- `lib/server-health.ts`
- `lib/hybrid-content.ts` (dernier migré, plus ancien point de convergence)

Notes importantes :
- `lib/db/index.ts` sert maintenant de point d'entree central.
- Les modules de compatibilite restants dans `lib/db/` sont nommes de facon non-legacy :
  - `app-store.ts`
  - `performance.ts`
  - `performance-cache.ts`
- Les imports frontend qui utilisaient des helpers de cache ont ete reroutes vers `lib/db/performance-cache.ts` pour eviter d'importer des modules server-only depuis le client.

## 6B — Correction de nommage Creator.indexed / updated
Decision retenue : conserver les colonnes runtime `indexed` et `updated`, ce qui minimise le delta sur les catalogues upstream et l'ecriture du job de sync.

Livraison :
- migration SQL ajoutee : `deploy/migrations/v2-fix-creator-columns.sql`
- types DB mis a jour dans `lib/db/types.ts`
- job de sync catalogue mis a jour dans `lib/jobs/creator-sync.ts`
- repository SQL aligne sur `indexed` / `updated`

Effet :
- les nouveaux consommateurs lisent des timestamps createur coherents avec le schema cible retenu
- les anciens ponts `indexedAt` / `updatedAt` n'ont plus vocation a rester apres la bascule finale

## 6C — Suppression des anciens fichiers
Fichiers legacy supprimes :

- `lib/data-store.ts`
- `lib/perf-repository.ts`
- `lib/perf-cache.ts`
- `lib/api/creators-cache.ts`
- `lib/server/creator-index-startup.cjs`

Nettoyage associe :
- les tests qui validaient exclusivement ces fichiers ont ete retires ou realignes
- le build a ete reroute vers les nouveaux modules de compatibilite non-legacy

## 6D — Migration des appelants frontend et suppression des routes legacy
Appelants frontend migrés :

- `/api/search-creators` -> `/api/creators/search`
- `/api/creator-profile` -> `/api/creators/[site]/[service]/[id]`
- `/api/creator-posts` + `/api/creator-posts/search` -> `/api/creators/[site]/[service]/[id]/posts`
- `/api/post` -> `/api/posts/[site]/[service]/[creatorId]/[postId]`
- `/api/popular-posts` -> `/api/posts/popular`
- `/api/recent-posts` -> `/api/posts/recent`
- `/api/kimono-favorites`, `/api/likes/creators` GET, `/api/likes/posts` GET -> `/api/favorites`
- mutations favorites -> `/api/favorites/creators/...` et `/api/favorites/posts/...`
- `/api/kimono-login` + `/api/kimono-session-status` -> `/api/sessions/upstream`
- `/api/media-source/warm` -> `/api/media/warm`
- `/api/media-source/[site]/[sourceFingerprint]` -> `/api/media/[site]/[fp]`
- `/api/preview-assets/[...assetPath]` -> `/api/media/preview/[...path]`
- `/api/download` -> `/api/media/download`
- `/api/cache-jobs/creator-snapshot` -> `/api/jobs/creator-snapshot`
- `/api/cache-jobs/popular-warmup` -> `/api/jobs/popular-warmup`

Routes legacy supprimees :

- `app/api/creator-posts/route.ts`
- `app/api/creator-posts/search/route.ts`
- `app/api/creator-profile/route.ts`
- `app/api/post/route.ts`
- `app/api/popular-posts/route.ts`
- `app/api/recent-posts/route.ts`
- `app/api/kimono-favorites/route.ts`
- `app/api/kimono-login/route.ts`
- `app/api/kimono-session-status/route.ts`
- `app/api/likes/creators/route.ts`
- `app/api/likes/posts/route.ts`
- `app/api/recommended/route.ts`
- `app/api/search-creators/route.ts`
- `app/api/media-source/warm/route.ts`
- `app/api/media-source/[site]/[sourceFingerprint]/route.ts`
- `app/api/preview-assets/[...assetPath]/route.ts`
- `app/api/download/route.ts`
- `app/api/cache-jobs/creator-snapshot/route.ts`
- `app/api/cache-jobs/popular-warmup/route.ts`
- routes debug deja retirees precedemment : `app/api/debug/auth-check`, `app/api/debug/env-db`

Point important : les nouvelles routes media et jobs ont ete reecrites pour etre autonomes. Elles ne wrappent plus les anciennes routes retirees.

## 6E — Boot serveur bascule sur runCreatorSync
Boot serveur final :
- `server.js` utilise maintenant `runCreatorSync`
- le scheduling periodique passe par `scheduleCreatorSyncRefresh`
- le vieux warmup `creator-index-startup.cjs` a ete retire
- un wrapper runtime Node est en place dans `lib/server/creator-sync-runtime.cjs`

Effet :
- sync catalogue au boot sans dependre de l'ancien fichier CJS legacy
- refresh periodique maintenu
- plus de reset DB au demarrage

## Correctifs complementaires effectues pendant la bascule
- `lib/hybrid-content.ts` nettoie maintenant correctement les anciens prefixes preview vers `/api/media/preview/...`
- `proxy.ts` protege les nouvelles routes privees `/api/favorites...` et `/api/sessions/upstream` sans reintroduire les anciennes
- `app/api/sessions/upstream/route.ts` gere aussi `DELETE` pour deconnecter une session upstream par site
- la suite de tests a ete realignee sur les nouvelles routes et la nouvelle couche DB

## Verification finale
Commandes executees :

- grep legacy dans `lib/` + `app/` : zero resultat
- `npm test` : OK
- `npm run build` : OK

Resultats :

- `rg -n "data-store|perf-repository|creators-cache|creator-index-startup" lib app` -> aucun match
- `npm test` -> 232/232 verts
- `npm run build` -> OK

Note de contexte :
- le build a du etre relance hors sandbox a cause d'un `spawn EPERM`, mais le build applicatif est bien vert
- il reste un warning Node `MODULE_TYPELESS_PACKAGE_JSON` pendant les tests, non bloquant pour le build ni le runtime

## Etat final
La bascule Phase 6 est terminee.
L'application ne depend plus des anciennes couches DB/routes legacy et repose maintenant sur :

- `lib/config/ttl.ts`
- `lib/db/types.ts`
- `lib/db/repository.ts`
- `lib/db/local-repository.ts`
- `lib/db/index.ts`
- `lib/jobs/creator-sync.ts`
- `lib/server/creator-sync-runtime.cjs`

La prochaine etape naturelle est la mise en prod de la migration SQL v2 + verification des headers `x-kimono-source` sur les routes principales apres deploiement.
