# Kimono 👘

Kimono est un frontend personnel unifié (Dashboard) permettant de consulter et gérer le contenu en provenance de Kemono.cr et Coomer.st au sein d'une même interface élégante et sécurisée.

## 🚀 Fonctionnalités Principales

- **Authentification Single-User :** Sécurisation forte via un mot de passe maître défini au niveau du serveur. Aucune inscription publique possible.
- **Double Facteur & Passkeys :** Support TOTP (Google Authenticator) via un profil admin robuste.
- **Interface Unifiée :** Recherche croisée entre Kemono et Coomer. Gestionnaire intelligent de requêtes asynchrones en arrière-plan.
- **Téléchargements Intégrés :** Système asynchrone côté serveur pour enchaîner vos téléchargements.
- **Pagination et Navigation :** L'intégralité du site utilise du state URL-based pour une parfaite conservation de l'historique et des partages d'adresse.
- **Design Moderne :** Thème sombre en mode "glassmorphism", conçu avec Tailwind CSS v4 et shadcn/ui.

## 🛠️ Stack Technique

- **Framework :** [Next.js 16](https://nextjs.org/) (App Router, mode Standalone pour déploiement cPanel / o2switch)
- **Langage :** TypeScript
- **Style :** Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com/)
- **Base de données :** MySQL
- **ORM :** [Prisma v7](https://www.prisma.io/)
- **Authentification :** NextAuth.js v5 (Provider Custom Credentials), `otplib` pour le TOTP

## 💻 Installation en local

### Prérequis

- Node.js (v20+)
- Serveur MySQL actif
- npm

### Étapes

1. **Cloner le projet**

   ```bash
   git clone <votre-url-github>
   cd Kimono/Kimono
   ```

2. **Installer les dépendances**

   ```bash
   npm install
   ```

3. **Configurer les variables d'environnement**
   Copiez `.env.example` vers `.env` (`cp ../.env.example .env`) et remplissez les informations :

   ```env
   DATABASE_URL="mysql://user:password@localhost:3306/kimono"
   AUTH_SECRET="votre-secret-complexe-ici"
   NEXTAUTH_URL="http://localhost:3000"
   ADMIN_PASSWORD="votre-mot-de-passe-maitre"
   WEBAUTHN_ORIGIN="http://localhost:3000"
   ```

4. **Initialiser la base de données (MySQL)**

   ```bash
   npx prisma db push
   npx prisma generate
   ```

5. **Lancer le serveur de développement**
   ```bash
   npm run dev
   ```

Le projet sera accessible sur `http://localhost:3000`.

## 📦 Déploiement

Kimono est configuré en mode `standalone` pour un déploiement optimal sur un hébergeur mutualisé (comme o2switch). Vous pouvez consulter le fichier `Kimono/DEPLOY.md` pour un guide technique complet sur ce sujet.

---

_Projet personnel - Non affilié à Kemono.cr ou Coomer.st_
