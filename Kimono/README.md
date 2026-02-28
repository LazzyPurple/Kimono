# Kimono 👘

Kimono est un frontend personnel unifié (Dashboard) permettant de consulter et gérer le contenu en provenance de Kemono.cr et Coomer.st au sein d'une même interface élégante et sécurisée.

## 🚀 Fonctionnalités (En cours de développement)

- **Authentification Single-User :** Sécurisation forte via un mot de passe maître défini au niveau du serveur. Aucune inscription publique possible.
- **Support 2FA / TOTP :** Couche de sécurité supplémentaire via application Authenticator (Proton Pass, Google Authenticator, etc.).
- **Passkeys (Bientôt) :** Connexion biométrique via WebAuthn.
- **Interface Unifiée :** Recherche croisée entre Kemono et Coomer, avec déduplication des résultats.
- **Thème Sombre :** Interface moderne, "glassmorphism", conçue avec Tailwind CSS v4 et shadcn/ui.

## 🛠️ Stack Technique

- **Framework :** [Next.js 16](https://nextjs.org/) (App Router, Turbopack)
- **Langage :** TypeScript
- **Style :** Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com/)
- **Base de données :** SQLite (via [LibSQL](https://turso.tech/libsql))
- **ORM :** [Prisma v7](https://www.prisma.io/)
- **Authentification :** [NextAuth.js v5](https://authjs.dev/), `otplib` pour le TOTP

## 💻 Installation en local

### Prérequis

- Node.js (v20+)
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
   Créez un fichier `.env` à la racine de `Kimono/Kimono` en vous basant sur la documentation interne :

   ```env
   DATABASE_URL="file:./prisma/dev.db"
   AUTH_SECRET="votre-secret-complexe-ici"
   AUTH_URL="http://localhost:3000"
   ADMIN_PASSWORD="votre-mot-de-passe-maitre"
   WEBAUTHN_RP_NAME="Kimono"
   WEBAUTHN_RP_ID="localhost"
   WEBAUTHN_ORIGIN="http://localhost:3000"
   ```

4. **Initialiser la base de données**

   ```bash
   npx prisma db push
   npx prisma generate
   ```

5. **Lancer le serveur de développement**

   ```bash
   npm run dev
   ```

   Le projet sera accessible sur `http://localhost:3000`.

## 🔒 Sécurité et Première Connexion

Lors de votre première visite sur `/login`, utilisez le `ADMIN_PASSWORD` défini dans votre `.env`. Une fois connecté, rendez-vous dans la barre de navigation et cliquez sur l'icône Bouclier (🛡️) pour configurer l'authentification à deux facteurs via votre application Authenticator afin de sécuriser complètement l'accès.

---

_Projet personnel - Non affilié à Kemono.cr ou Coomer.st_
