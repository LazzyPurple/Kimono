# 👘 Kimono - Checkpoint & Résumé

Ce document liste l'ensemble des fonctionnalités actuellement supportées par Kimono, ainsi qu'un historique récent des modifications (Walkthrough).

## 🚀 Fonctionnalités Actuelles

### 1. Authentification & Sécurité

- **Single-User** : L'accès est protégé par un mot de passe maître centralisé (`ADMIN_PASSWORD`), sans inscription publique.
- **Double Facteur (2FA / TOTP)** : Intégration d'une couche supplémentaire (via application Authenticator).
- **Gestion de Session** : Stockage du JWT et sécurisation des routes dans un middleware Next.js.
- **Support WebAuthn (Passkeys)** : Préparation dans le schéma de la DB d'une authentification biométrique.

### 2. Contenu & Navigation

- **Tableau de Bord / Home** : Vue globale sur les nouveautés récentes de `kemono.cr` et `coomer.st`.
- **Search (Recherche)** : Recherche de créateurs unifiée et optimisée, page avec URLs partagées (`?q=...&filter=...`).
- **Creator Profiles** : Affichage d'un créateur spécifique avec des onglets (Posts réguliers, Recommandations) et des filtres (Image, Vidéo, etc.). Pagination via les paramètres d'URL.
- **Discover (Découverte)** : Génération et calcul de recommandations de créateurs selon vos favoris (via une API backend). Barre de progression visuelle sur l'interface.
- **Popular (Populaires)** : Moteur d'exploration des posts les plus appréciés des deux plateformes, filtrables par période et date. Pagination segmentée et fluide (`/popular/kemono/1`).
- **Favorites (Favoris)** : Interface avec un système de tri (par date d'ajout, A-Z), recherche locale, et filtres qui utilisent également la persistance dans l'URL.

### 3. Fonctionnalités Utilisateur (UX/UI)

- **Liens Natifs & Cartes de Média** : Toutes les MediaCards utilisent de véritables balises `<a>`, supportant l'ouverture facile dans un nouvel onglet, le clic-molette, etc.
- **Navigation Persistente** : La restauration de la position de défilement au retour arrière (Scroll Restoration) a été implémentée sur les grilles de résultats.
- **Gestionnaire de Téléchargement** : Un système asynchrone global avec un panneau latéral (Drawer) pour visualiser la file d'attente (avec SSE _Server-Sent Events_), l'avancement, et le compte de fichiers stockés sur le serveur.
- **Likes System** : Indication visuelle si un créateur ou un post est "liké".

### 4. Stack Technique & Infrastructures

- **Next.js 16** avec _App Router_ et configuration de cache/suspense.
- **Styles** : TailwindCSS v4, Shadcn/UI pour un "glassmorphism" très poussé.
- **Base de données** : **MySQL** via Prisma ORM v7. Champs longs supportés nativement avec `@db.Text` et `@db.LongText`.
- **Déploiement cible** : o2switch (Standalone build Next.js configuré).

---

## 🛠️ Walkthrough Récent

Lors de la dernière session d'agent, les modifications suivantes ont été produites :

1. **Refonte de la Pagination & Navigation (URL-Based State)**
   - Les states internes (`useState`) ont été remplacés par une lecture dans `searchParams` (`?page=1&sort=az`, etc.) pour les pages de **Recherche**, **Favoris**, et **Découverte**.
   - Le routage de la page `Popular` a été réécrit avec un Catch-all Route (`/popular/[site]/[[...page]]/page.tsx`) pour naviguer proprement de pages en pages.
   - Intégration d'un hook `useScrollRestoration` personnalisé pour que le navigateur restaure la position au scroll si l'utilisateur fait "Précédent".
   - Refonte logicielle de `auth.ts` et correction d'attributs JSX qui provoquaient des re-renders inutiles.

2. **Accessibilité des Liens**
   - Remplacement de l'interception `onClick={router.push}` par `<a href="..."/>` sur les cartes de posts, débloquant l'utilisation des clics-droit (Ouvrir dans un nouvel onglet, etc.).

3. **Migration Base de données (SQLite vers MySQL)**
   - Changement du `provider = "sqlite"` vers `provider = "mysql"` dans le `schema.prisma`.
   - Identification et sécurisation de la limite de caractères MySQL (191 varchar par défaut) en déclarant `@db.Text` et `@db.LongText` sur les attributs stockant des cookies, certificats publics, ou du gros cache JSON.
   - Création de `.env.example` et ajout d'un exemple d'URI compatible MySQL localement pour faciliter les configurations de déploiement (telles qu'o2switch).
   - Modification de `next.config.ts` incluant `output: "standalone"` pour préparer le build de production o2switch.
