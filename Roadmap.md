# Kimono - Roadmap de suivi

Ce document sert de suivi operationnel et strategique. Il doit rester actionnable, priorise, et reflechir la vraie direction produit/technique du projet.

## Etat de reference

Statut actuel :

- auth debug et logs re-securises
- preview assets serveur Popular en place
- hydratation centrale des previews disponible
- caches browser listing passes a 24h
- `browser-data-cache` passe en `localStorage`
- `ffprobe` remplace l'analyse lourde quand disponible
- concurrence ffmpeg limitee via `FFMPEG_CONCURRENCY`
- route preview assets streamee avec support `206` et rejet `416`
- onglet `Posts` ajoute a `/favorites`
- chronologie locale des favoris introduite pour fiabiliser `Added first`
- `npm test` (`150/150`) et `npm run build` passent localement

## Direction strategique

Le projet ne doit plus evoluer principalement page par page.

Les prochains gros lots doivent etre penses comme des briques globales reutilisables :

1. `Media Platform` transverse cote serveur
2. `Client Media Coordinator` transverse cote navigateur
3. `Design System` et contrats de presentation globaux
4. deploiement progressif par surface (`Popular`, `Home`, `Favorites`, `Discover`, `Creator`, puis autres ecrans)

## Priorites immediates

### P0 - chantier prioritaire a engager tot : Media Platform

Objectif : sortir d'une logique `Popular uniquement` pour aller vers une plateforme media globale, tout en gardant `Popular` comme producteur fort.

Cadrage retenu :

- approche `Passive+`
- unite canonique par `source media`
- registre media global partage par toutes les surfaces
- mutualisation des metadonnees + thumbnail + clip court
- petit probe synchrone leger avant rendu
- generation opportuniste en fond, non bloquante
- fonctionnement partout cote serveur, pas seulement sur `Popular`
- fenetre chaude `72h`
- retention disque plus longue que la fenetre chaude
- architecture ouverte a une evolution plus active plus tard

Sous-chantiers V1 :

- definir le schema logique `MediaSource` / `MediaArtifact`
- factoriser un service central du type `MediaPlatform.observe()` / `hydrate()`
- normaliser la presentation media fournie aux posts
- deduper les generations par fingerprint de source
- introduire les statuts `probeStatus` et `artifactStatus`
- reutiliser partout les medias deja connus avant toute regeneration
- brancher progressivement `Home` juste apres `Popular`

### P1 - Client Media Coordinator

Objectif : arbitrer intelligemment les couts cote navigateur quand plusieurs videos coexistent.

Cadrage retenu :

- seules les videos explicitement lancees par l'utilisateur deviennent prioritaires
- plafond de `3-4` videos prioritaires en parallele
- les previews hover restent autorisees
- leur cout est reduit des qu'au moins une vraie lecture est active
- aucune baisse de puissance cote serveur : l'arbitrage est purement client

Sous-chantiers V1 :

- provider global client de coordination media
- registre local des videos `idle | hover | playing | paused | offscreen`
- politique uniforme de `preload`
- reduction des warmups et prechargements secondaires quand des lectures actives existent
- integration propre avec `MediaCard` et les futurs lecteurs video globaux

### P1 - Design System global

Objectif : remplacer progressivement l'approche page par page par des composants et shells reutilisables, deja optimises.

Axes retenus :

- `Kimono-first`, sans masquer artificiellement `Kemono` / `Coomer`
- badges source et variantes source standardises
- etats standards reutilisables : `Loading`, `Skeleton`, `Empty`, `Error`, `Expired`, `Degraded`
- shells de listing communs
- toolbar de listing commune
- surface media commune
- surface createur commune
- tabs, filtres et pagination harmonises
- perf embarquee dans les composants eux-memes

Sous-chantiers V1 :

- extraire les composants d'etat
- extraire une toolbar de listing commune
- definir un contrat `MediaCardModel`
- definir un contrat `CreatorCardModel`
- harmoniser `Popular`, `Home`, `Favorites`, `Discover`
- laisser la page post detail plus libre tant qu'elle reste orientee full-res

### P2 - Theme system creatif et dynamique

Objectif : donner a Kimono une identite plus vivante et unifiee, sans repasser page par page.

Cadrage retenu :

- hook + provider globaux
- mode `auto` selon l'heure locale
- mode `manuel` persistant pour forcer un theme
- application via variables CSS globales
- integration au futur design system
- touche creative forte mais lisible et robuste

Themes cibles :

- `Aube`
- `Zenith`
- `Crepuscule`
- `Deep Night`

Pistes d'integration :

- `TimeThemeProvider`
- `useTimeTheme()`
- attributs `data-time-theme` / `data-time-theme-mode`
- gradients d'ambiance
- halos lumineux subtils
- accents dynamiques sur cartes et actions

## Ordre recommande de mise en oeuvre

### Lot 1 - Media Platform fondations

- documenter le design detaille
- poser le schema logique serveur
- centraliser l'observation / hydratation media
- reutiliser les artefacts existants de `Popular`
- brancher `Home` comme premier consommateur global apres `Popular`

### Lot 2 - Client Media Coordinator

- ajouter le provider global client
- piloter la priorite des videos vraiment lues
- ralentir les hovers et preloads secondaires
- stabiliser le comportement multi-videos

### Lot 3 - Design System V1

- etats transverses
- toolbar commune
- shells de listing
- normalisation des contrats de presentation
- migration progressive des grandes surfaces

### Lot 4 - Theme system creatif

- poser le provider + hook
- definir les 4 themes
- brancher les variables globales
- ajouter ensuite un switcher manuel pour s'amuser et faire des captures

## Surfaces cibles de migration progressive

Ordre de branchement recommande :

1. `Popular`
2. `Home`
3. `Favorites`
4. `Discover`
5. `Creator`
6. autres listings et lecteurs secondaires

## Checklist de prochain deploy o2switch

1. lancer `npm test`
2. lancer `npm run build`
3. lancer `npm run build:o2switch-package`
4. uploader l'artefact Linux prebuild
5. lancer `Run NPM Install` sur o2switch
6. redemarrer l'app Node.js
7. verifier `/login`, `/home`, `/popular/kemono`, `/favorites`, `/creator/...`, `/post/...`, `/logs`
8. verifier que les previews media et la charge ffmpeg restent stables en production

## Backlog utile

- preparer un futur `Admin Panel` avec un bouton `Clean DB` reutilisant la meme logique centrale que la purge de demarrage
- finaliser l'anglais visible cote UI
- poursuivre l'harmonisation des titres de page
- consolider la couverture de tests autour des listes moins frequentes
- renforcer encore l'observabilite autour des flux media
- preparer une eventuale evolution de la `Media Platform` vers une logique plus active si necessaire

## Notes

- `Popular` reste le point d'entree historique des assets serveur, mais ne doit plus rester la seule brique media riche
- la `Media Platform` doit devenir la couche de verite globale sur les medias connus du site
- le `Client Media Coordinator` est volontairement separe et ne doit pas piloter la generation serveur
- le `Design System` doit venir apres la normalisation des contrats media, pas avant
- les tests du repo restent suivis par git et ne sont pas a exclure du versionnage
- la roadmap doit etre mise a jour a chaque lot structurant pour eviter de reperdre la vision transverse
