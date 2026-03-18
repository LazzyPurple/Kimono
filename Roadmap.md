# Kimono - Roadmap de suivi

Ce document sert de suivi operationnel pour les prochains lots. Il doit rester court, actionnable et priorise.

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
- `npm test` (`134/134`) et `npm run build` passent localement

## Priorites immediates

### P0 - avant de considerer la prod comme propre

- tourner tous les secrets exposes dans des captures ou des echanges (`ADMIN_PASSWORD`, `AUTH_SECRET`, mot de passe MySQL de `DATABASE_URL`)
- regenerer et uploader un artefact frais avec `npm run build:o2switch-package`
- verifier le flux de secours diagnostic avec ou sans `AUTH_DEBUG_TOKEN`
- verifier en production le bon comportement de `FFMPEG_CONCURRENCY` sur o2switch selon la charge reelle

### P1 - stabilisation technique

- brancher l'hydratation centrale des preview assets sur toutes les listes de posts restantes
- verifier `favorites`, `discover` et toute autre route de listing encore non couverte
- continuer a reduire les etats noirs / clignotements eventuels sur les cards media
- resorber les erreurs lint source encore ouvertes

### P2 - hardening produit

- retirer ou simplifier les routes de debug restantes quand la prod sera stable
- introduire un vrai role admin si l'application sort du mode single-user
- documenter un runbook court de debug prod pour o2switch
- ajouter une verification post-deploy systematique des routes critiques

## Checklist de prochain deploy o2switch

1. lancer `npm test`
2. lancer `npm run build`
3. lancer `npm run build:o2switch-package`
4. uploader l'artefact Linux prebuild
5. lancer `Run NPM Install` sur o2switch
6. redemarrer l'app Node.js
7. verifier `/login`, `/home`, `/popular/kemono`, `/creator/...`, `/post/...`, `/logs`
8. verifier que les previews Popular sortent bien sans saturation ffmpeg

## Backlog utile

- finaliser l'anglais visible cote UI
- poursuivre l'harmonisation des titres de page
- consolider la couverture de tests autour des listes moins frequentes
- envisager un chemin SQL-first limite a `Popular` si le volume continue d'augmenter

## Notes

- `Popular` reste le point d'entree de production des assets serveur
- la porte vers une future variante SQL-first pour `Popular` reste volontairement ouverte
- les tests du repo restent suivis par git et ne sont pas a exclure du versionnage
- le tracking doit etre mis a jour a chaque lot significatif pour eviter de perdre le contexte
