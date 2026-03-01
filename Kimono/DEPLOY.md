# Déploiement Kimono sur o2switch (cPanel + Node.js)

Ce guide explique comment déployer l'application Next.js **Kimono** sur un hébergement o2switch via le gestionnaire cPanel.

---

## Pré-requis

- Hébergement o2switch avec accès cPanel
- Domaine configuré : `kimono.paracosm.fr`
- SSH activé (recommandé pour les commandes npm)
- Node.js 18+ disponible via le gestionnaire d'applications cPanel

---

## 1. Préparer le projet localement

### Build de production

```bash
npm run build
```

Cette commande génère le dossier `.next/` optimisé pour la production.

### Variables d'environnement de production

Créer un fichier `.env.production` (ou `.env`) à la racine du projet avec :

```env
# Base de données SQLite (chemin absolu sur le serveur)
DATABASE_URL="file:/home/cpanel_user/kimono/prisma/prod.db"

# NextAuth — SECRET aléatoire, générez avec: openssl rand -base64 32
AUTH_SECRET="REMPLACER_PAR_UN_SECRET_FORT_DE_32_CHARS_MINIMUM"

# URL publique de l'application (sans slash final)
AUTH_URL="https://kimono.paracosm.fr"

# Votre mot de passe maître de connexion
ADMIN_PASSWORD='VOTRE_MOT_DE_PASSE_FORT'

# WebAuthn (Passkeys) — doit correspondre au domaine de production
WEBAUTHN_RP_NAME="Kimono"
WEBAUTHN_RP_ID="kimono.paracosm.fr"
WEBAUTHN_ORIGIN="https://kimono.paracosm.fr"
```

> [!IMPORTANT]
> `WEBAUTHN_RP_ID` **doit** correspondre exactement au nom de domaine sans `https://`.
> `AUTH_URL` **doit** être l'URL complète avec `https://`.
> Ne jamais committer le fichier `.env` sur Git.

---

## 2. Créer l'application Node.js dans cPanel

1. Dans cPanel → **Setup Node.js App**
2. Cliquer **Create Application**
3. Configurer :
   - **Node.js version** : 18.x ou 20.x (LTS recommandé)
   - **Application mode** : Production
   - **Application root** : `/home/user/kimono/Kimono` _(chemin vers le dossier contenant `package.json`)_
   - **Application URL** : `kimono.paracosm.fr`
   - **Application startup file** : `server.js`

---

## 3. Créer le fichier `server.js`

À la racine du projet (`Kimono/server.js`), créer ce fichier wrapper :

```js
// server.js — Wrapper pour démarrer Next.js en production via cPanel
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = false;
const hostname = "localhost";
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error:", err);
      res.statusCode = 500;
      res.end("Internal server error");
    }
  }).listen(port, () => {
    console.log(`> Kimono ready on http://${hostname}:${port}`);
  });
});
```

---

## 4. Déployer via SSH

```bash
# Se connecter en SSH au serveur
ssh user@kimono.paracosm.fr

# Aller dans le répertoire du projet
cd ~/kimono/Kimono

# Installer les dépendances de production
npm install --omit=dev

# Générer le client Prisma
npx prisma generate

# Créer/migrer la base de données SQLite
npx prisma db push

# Build de production
npm run build
```

---

## 5. Démarrer l'application

Dans cPanel → **Setup Node.js App** → cliquer **Start** sur votre application.

Le fichier `server.js` sera exécuté automatiquement par cPanel.

Pour redémarrer après une mise à jour :

```bash
npm run build
# Puis cliquer "Restart" dans cPanel
```

---

## 6. Mise à jour du code (workflow de déploiement)

```bash
# Sur votre machine locale
git push

# Sur le serveur via SSH
cd ~/kimono/Kimono
git pull
npm install --omit=dev
npm run build
# Restart dans cPanel
```

---

## Récapitulatif des commandes

| Action             | Commande              |
| ------------------ | --------------------- |
| Build              | `npm run build`       |
| Démarrer (local)   | `npm start`           |
| Serveur production | `node server.js`      |
| DB migration       | `npx prisma db push`  |
| Générer Prisma     | `npx prisma generate` |

---

## Variables d'environnement résumé

| Variable           | Description                       | Exemple prod                                   |
| ------------------ | --------------------------------- | ---------------------------------------------- |
| `DATABASE_URL`     | Chemin SQLite                     | `file:/home/user/kimono/Kimono/prisma/prod.db` |
| `AUTH_SECRET`      | Secret NextAuth (32+ chars)       | Généré via `openssl rand -base64 32`           |
| `AUTH_URL`         | URL publique de l'app             | `https://kimono.paracosm.fr`                   |
| `ADMIN_PASSWORD`   | Mot de passe maître               | Votre choix (entre guillemets simples si `$`)  |
| `WEBAUTHN_RP_NAME` | Nom affiché dans l'invite passkey | `Kimono`                                       |
| `WEBAUTHN_RP_ID`   | Domaine de l'app (sans https)     | `kimono.paracosm.fr`                           |
| `WEBAUTHN_ORIGIN`  | URL complète                      | `https://kimono.paracosm.fr`                   |
