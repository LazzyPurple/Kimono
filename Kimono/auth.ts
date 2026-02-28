import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: "master-password",
      name: "Mot de passe maître",
      credentials: {
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        // Log complet des credentials pour voir exactement la structure reçue
        console.log("[AUTH] Credentials reçus:", JSON.stringify(credentials));

        const password = credentials?.password || credentials?.["password"];
        
        if (!password) {
          console.log("[AUTH] Pas de mot de passe trouvé dans l'objet");
          return null;
        }

        const passwordStr = String(password).trim();
        const adminPassword = process.env.ADMIN_PASSWORD?.trim();

        if (!adminPassword || passwordStr !== adminPassword) {
          console.log("[AUTH] Erreur correspondance mot de passe");
          return null;
        }

        console.log("[AUTH] Mot de passe OK, vérification de l'utilisateur en base...");

        try {
          // Récupérer ou créer l'utilisateur unique admin
          let user = await prisma.user.findFirst();

          if (!user) {
            console.log("[AUTH] Création du premier utilisateur admin...");
            user = await prisma.user.create({
              data: {
                email: "admin@kimono.local",
              },
            });
          }

          console.log("[AUTH] Utilisateur trouvé/créé:", user.email);

          // Si le TOTP est activé, on ne connecte pas encore —
          // on renvoie l'user avec un flag indiquant qu'il faut vérifier le TOTP
          if (user.totpEnabled) {
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

        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

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
  debug: true,
});
