import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { query, execute } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: "master-password",
      name: "Mot de passe maître",
      credentials: {
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const password = credentials?.password || credentials?.["password"];

        if (!password) {
          return null;
        }

        const passwordStr = String(password).trim();
        const adminPassword = process.env.ADMIN_PASSWORD?.trim();

        if (!adminPassword || passwordStr !== adminPassword) {
          return null;
        }

        try {
          // Récupérer ou créer l'utilisateur unique admin
          let users = await query<any>("SELECT * FROM User LIMIT 1");
          let user = users[0];

          if (!user) {
            const id = crypto.randomUUID();
            await execute("INSERT INTO User (id, email) VALUES (?, ?)", [id, "admin@kimono.local"]);
            users = await query<any>("SELECT * FROM User WHERE id = ?", [id]);
            user = users[0];
          }

          // Si le TOTP est activé, on ne connecte pas encore —
          // on renvoie l'user avec un flag indiquant qu'il faut vérifier le TOTP
          if (Boolean(user.totpEnabled)) {
            return {
              id: user.id,
              email: user.email,
              needsTotp: true,
            } as any;
          }

          return {
            id: user.id,
            email: user.email,
          };
        } catch (error) {
          console.error("[AUTH] Erreur base de données:", error);
          return null;
        }
      },
    }),
    Credentials({
      id: "totp-verify",
      name: "Vérification TOTP",
      credentials: {
        userId: { label: "User ID", type: "text" },
        code: { label: "Code TOTP", type: "text" },
      },
      async authorize(credentials) {
        const userId = credentials?.userId as string;
        const code = credentials?.code as string;

        if (!userId || !code) return null;

        const users = await query<any>("SELECT * FROM User WHERE id = ?", [userId]);
        const user = users[0];

        if (!user || !user.totpSecret) return null;

        // Vérifier le code TOTP via notre utilitaire
        const { verifyTotpCode } = await import("@/lib/auth/totp");
        const isValid = verifyTotpCode(code, user.totpSecret);

        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 jours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.needsTotp = (user as any).needsTotp || false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session as any).needsTotp = token.needsTotp || false;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  debug: process.env.NODE_ENV === "development",
});
