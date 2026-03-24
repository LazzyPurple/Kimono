# Plan d'implementation - Media Platform V1

Date : 2026-03-19
Priorite : P0
Statut : Pret a demarrer

## Resume

L'objectif est de transformer la logique media actuelle, encore largement structuree autour de `Popular`, en une vraie brique transverse reutilisable par toutes les surfaces serveur.

Le plan retenu suit la direction validee ensemble :

- approche `Passive+`
- unite canonique par source media
- mutualisation des metadonnees + thumbnail + clip court
- petit probe synchrone leger avant rendu
- generation opportuniste en fond, non bloquante
- fenetre chaude 72h
- retention disque plus longue que la fenetre chaude
- architecture ouverte a une evolution plus active plus tard

Le plan ci-dessous est volontairement incremental et reutilise au maximum les briques deja presentes :

- `PreviewAssetCache`
- `PostCache`
- `PopularSnapshot`
- `popular-preview-assets.ts`
- `post-preview-hydration.ts`
- `hybrid-content.ts`
- `perf-repository.ts`

## Objectifs V1

1. Sortir d'une logique media centree sur `Popular` sans casser ce qui fonctionne deja.
2. Permettre a toutes les surfaces serveur de reutiliser la connaissance media deja acquise.
3. Eviter les re-probes, re-generations et re-chauffages inutiles pour une meme source media.
4. Normaliser la presentation media fournie aux posts avant rendu.
5. Garder une trajectoire simple vers une plateforme media plus active plus tard.

## Non-objectifs V1

- ne pas reécrire toute la couche media d'un coup
- ne pas basculer vers une vraie file de jobs externe en V1
- ne pas faire piloter la generation serveur par le client
- ne pas refaire en meme temps le design system complet
- ne pas changer la page post detail pour masquer la full-res upstream

## Strategie d'implementation

### Principe cle

V1 ne doit pas jeter le systeme actuel `PreviewAssetCache` / `popular-preview-assets`.

Au contraire, on s'appuie dessus comme pont de migration.

Recommendation d'implementation :

- conserver `PreviewAssetCache` comme noyau de depart
- l'etendre pour lui faire porter le role de registre media V1
- introduire une couche de service `MediaPlatform` qui abstrait l'existant
- eviter d'exposer directement `popular-preview-assets.ts` aux autres modules

En clair :

- `Popular` cesse d'etre la seule brique riche
- mais l'existant `Popular` reste la source de verite initiale et la base technique de migration

## Cible V1

### Tables / stockage

#### 1. Evolution pragmatique de `PreviewAssetCache`

Au lieu de creer immediatement deux nouvelles tables completement separees (`MediaSource` et `MediaArtifact`), V1 commence par etendre `PreviewAssetCache` pour lui faire absorber le role de registre source + artefacts legers.

Nouveaux champs proposes :

- `mediaKind` (`image`, `video`, `unknown`)
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

Champs deja utiles a conserver :

- `site`
- `sourceVideoUrl` ou, plus largement en V1, future `sourceMediaUrl`
- `sourceFingerprint`
- `durationSeconds`
- `thumbnailAssetPath`
- `clipAssetPath`
- `status` (a migrer progressivement vers `probeStatus` + `artifactStatus`)
- `generatedAt`
- `lastSeenAt`
- `error`

#### 2. Layout disque conserve en V1

On garde la logique de stockage disque actuelle des preview assets, avec adaptation progressive si necessaire.

But :

- ne pas casser `/api/preview-assets/...`
- ne pas reouvrir un chantier de migration de fichiers trop tot

### Service central

Creer un nouveau module du type :

- `lib/media-platform.ts`

Responsabilites :

- observer des sources media a partir d'un ou plusieurs posts
- normaliser les URLs source
- calculer le fingerprint canonique
- lire / creer / mettre a jour le registre media
- faire un probe synchrone leger si necessaire
- hydrater les posts avec la presentation media disponible
- declencher une generation opportuniste en fond si des artefacts manquent

API cible V1 :

- `observePostsMedia(posts, context)`
- `hydratePostsWithMediaPlatform(posts, context)`
- `observeAndHydratePosts(posts, context)`
- `scheduleMissingArtifacts(entries, context)`
- `cleanupColdMediaAssets(options)`

### Contrat de presentation media standard

V1 doit standardiser les champs media injectes dans les posts, sans imposer une refonte complete du modele applicatif.

Contrat cible cote `UnifiedPost` / presentation :

- `previewThumbnailUrl`
- `previewClipUrl`
- `longestVideoDurationSeconds`
- `previewStatus`
- `previewGeneratedAt`
- `previewError`
- `previewSourceFingerprint`
- `mediaProbeStatus`
- `mediaArtifactStatus`
- `mediaKind`
- `nativeThumbnailUrl`
- `isMediaHot`

But :

- unifier ce que les pages recoivent
- deplacer la logique media hors des pages

## Lots d'implementation

### Lot 0 - Cadre et tests de base

Objectif : poser les garde-fous avant les grosses modifications.

Taches :

- ajouter un document de design valide et ce plan d'implementation
- ajouter des tests unitaires cibles autour du futur registre media V1
- ajouter des tests de contrat sur les posts hydrates
- ajouter des fixtures de posts `image`, `video`, `mixed`, `thumbnail natif`, `pas d'asset`

Tests attendus :

- fingerprint stable par source media
- reemploi d'une source deja connue a travers plusieurs posts
- distinction claire entre metadonnees disponibles et artefacts manquants

### Lot 1 - Extension du schema et du repository

Objectif : rendre le repository capable de porter la plateforme media V1.

Taches :

- etendre `perf-repository.ts`
- ajouter les colonnes manquantes a `PreviewAssetCache`
- exposer des methodes repository plus generales :
  - `getMediaSourceByFingerprint()`
  - `upsertMediaSource()`
  - `touchMediaSource()`
  - `markMediaArtifactsStatus()`
  - `listColdMediaSources()`
- conserver une compatibilite avec les methodes existantes pour ne pas casser `Popular`

Contraintes :

- compatibilite SQLite local + MySQL production
- migration additive, sans drop destructif

Definition of done :

- repository unifie fonctionnel en local et prod
- anciens tests `PreviewAssetCache` toujours verts
- nouveaux tests schema/repository verts

### Lot 2 - Extraction du service `MediaPlatform`

Objectif : sortir la logique media de `Popular` vers une brique transverse.

Taches :

- creer `lib/media-platform.ts`
- centraliser :
  - normalisation des sources media
  - observation
  - probe leger
  - hydratation
  - planification opportuniste
- encapsuler `popular-preview-assets.ts` comme producteur interne V1
- faire de `post-preview-hydration.ts` un adaptateur fin autour du nouveau service, ou le remplacer progressivement

Probe synchrone autorise :

- type media
- duree
- dimensions
- thumbnail natif si disponible

Pas autorise dans le chemin critique :

- generation lourde bloquante
- attente du clip serveur avant rendu

Definition of done :

- un post passe dans la plateforme et ressort enrichi de maniere standardisee
- la generation opportuniste peut etre declenchee sans bloquer la reponse

### Lot 3 - Migration de `Popular` vers la plateforme

Objectif : brancher d'abord `Popular` sur la nouvelle abstraction sans perdre la robustesse actuelle.

Taches :

- faire consommer `MediaPlatform` a `hybrid-content.ts`
- faire de `Popular` un consommateur officiel du contrat media standard
- reduire la dependance directe a `popular-preview-assets.ts` dans les couches hautes
- garder `Popular` comme producteur fort pour les assets

Definition of done :

- `Popular` continue de produire et reutiliser les assets
- le comportement visible ne regresse pas
- les donnees sortantes sont deja compatibles avec les futures autres surfaces

### Lot 4 - Branchement de `Home`

Objectif : faire de `Home` le premier grand consommateur global apres `Popular`.

Taches :

- brancher la plateforme media dans le flux serveur de `Home`
- reutiliser les medias deja connus avant toute regeneration
- observer les nouvelles sources media rencontrees
- declencher en fond la generation opportuniste si utile
- garder un fallback stable quand rien n'existe encore

Definition of done :

- `Home` beneficie des durations, thumbnails et clips deja connus
- les couts client baissent sur les medias deja vus ailleurs
- aucun blocage serveur visible pour attendre ffmpeg

### Lot 5 - Generalisation aux autres surfaces

Objectif : diffuser la plateforme sans revenir a une logique page par page ad hoc.

Ordre recommande :

1. `Favorites`
2. `Discover`
3. `Creator`
4. autres listes de posts secondaires

Taches :

- brancher la meme API interne de la plateforme partout
- supprimer les forks de logique media devenus inutiles
- verifier les contrats de sortie sur toutes les surfaces

Definition of done :

- toutes les grandes surfaces serveur utilisent la meme brique media
- les differences restantes sont produit/UX, pas techniques

### Lot 6 - Nettoyage, retention et observabilite

Objectif : stabiliser l'exploitation de la plateforme.

Taches :

- introduire le calcul explicite de `hotUntil = lastSeenAt + 72h`
- regler la retention disque au-dela de la fenetre chaude
- enrichir les logs applicatifs media
- exposer des compteurs utiles :
  - observe
  - probe hit/miss
  - asset hit/miss
  - generation queued
  - generation reused
  - generation failed
- ajouter un cleanup plus general que celui centre sur `Popular`

Definition of done :

- cycle de vie media lisible
- purges deterministes
- observabilite suffisante pour le debug o2switch

## Plan de tests

### Tests unitaires

A ajouter ou etendre :

- fingerprint et normalisation des sources
- mapping `post -> sources media`
- probe leger et mises a jour de statut
- hydratation d'un post a partir du registre media
- fallback quand seuls certains artefacts existent
- statut `partial`, `ready`, `failed`, `stale`

### Tests repository

- lecture/ecriture des nouvelles colonnes media en SQLite
- lecture/ecriture des nouvelles colonnes media en MySQL logique SQL
- conservation des anciens chemins `PreviewAssetCache`

### Tests integration legere

- `Popular` continue de fonctionner via la plateforme
- `Home` reutilise des medias deja connus
- une nouvelle video rencontree est observee puis marquee `pending`
- la reponse HTTP ne bloque pas sur la generation lourde

### Verification finale

A minima a la fin de chaque lot structurant :

- `npm test`
- `npm run build`

Et avant deploiement :

- `npm run build:o2switch-package`
- verification manuelle de `/popular/...`, `/home`, `/favorites`, `/creator/...`

## Risques et mitigation

### Risque 1 - trop gros refactor d'un coup

Mitigation :

- migration en couches
- compatibilite transitoire avec `PreviewAssetCache`
- `Popular` migre avant les autres surfaces mais garde son role fort

### Risque 2 - couplage trop fort a `Popular`

Mitigation :

- toute nouvelle API interne vit dans `media-platform.ts`
- `popular-preview-assets.ts` devient un producteur, pas l'interface publique du systeme

### Risque 3 - explosion du cout serveur opportuniste

Mitigation :

- generation non bloquante
- dedupe par fingerprint
- semaphore existant conserve
- retry controls + `retryAfter`
- nettoyage actif des medias froids

### Risque 4 - contrat media flou entre pages et composants

Mitigation :

- figer des champs standard de presentation media tres tot
- ajouter des tests de contrat sur `UnifiedPost`

## Recommandation de demarrage concret

Commencer par ce sous-ordre precis :

1. etendre `perf-repository.ts` et `PreviewAssetCache`
2. creer `lib/media-platform.ts`
3. brancher `Popular` sur la nouvelle abstraction
4. brancher `Home`
5. seulement ensuite generaliser a `Favorites`, `Discover`, `Creator`

## Critere de succes V1

La V1 sera consideree comme reussie si :

- `Popular` et `Home` partagent reelement la meme connaissance media
- une meme video deja rencontree n'est plus re-probee/regenerée inutilement
- les pages recoivent une presentation media plus uniforme
- la generation lourde ne bloque pas les reponses
- les tests et la build restent verts
- la plateforme reste compatible avec une evolution plus active plus tard
