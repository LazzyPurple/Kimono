import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getDataStore } from "@/lib/data-store";
import { isLocalDevMode } from "@/lib/local-dev-mode";
import { shouldEnableCredentialAuth } from "@/lib/auth-guards";
import { appendAuthDebugLog, toAuthDebugErrorDetails } from "@/lib/auth-debug";

async function writeAuthDebug(
  event: string,
  details: Record<string, string | number | boolean | null | undefined> = {}
) {
  try {
    await appendAuthDebugLog(event, details);
  } catch (error) {
    console.error("[AUTH_DEBUG] Failed to write auth debug log:", error);
  }
}

async function authorizeMasterPassword(credentials: Record<string, unknown> | undefined) {
  const localDevMode = isLocalDevMode();
  const credentialsAuthEnabled = shouldEnableCredentialAuth(localDevMode);
  const password = credentials?.password || credentials?.["password"];
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

  await writeAuthDebug("master_password_attempt", {
    localDevMode,
    credentialsAuthEnabled,
    hasPasswordInput: Boolean(password),
    adminPasswordConfigured: Boolean(adminPassword),
  });

  if (!credentialsAuthEnabled) {
    await writeAuthDebug("master_password_rejected", {
      reason: "credential_auth_disabled",
      localDevMode,
    });
    return null;
  }

  if (!password) {
    await writeAuthDebug("master_password_rejected", {
      reason: "missing_password",
    });
    return null;
  }

  const passwordStr = String(password).trim();

  if (!adminPassword) {
    await writeAuthDebug("master_password_rejected", {
      reason: "missing_admin_password",
    });
    return null;
  }

  if (passwordStr !== adminPassword) {
    await writeAuthDebug("master_password_rejected", {
      reason: "password_mismatch",
    });
    return null;
  }

  try {
    const store = await getDataStore();
    const user = await store.getOrCreateAdminUser();

    await writeAuthDebug("master_password_password_match", {
      userId: user.id,
      totpEnabled: Boolean(user.totpEnabled),
    });

    if (Boolean(user.totpEnabled)) {
      await writeAuthDebug("master_password_totp_required", {
        userId: user.id,
      });

      return {
        id: user.id,
        email: user.email,
        needsTotp: true,
      } as const;
    }

    await writeAuthDebug("master_password_success", {
      userId: user.id,
    });

    return {
      id: user.id,
      email: user.email,
    } as const;
  } catch (error) {
    console.error("[AUTH] Database error:", error);
    await writeAuthDebug("master_password_db_error", {
      ...toAuthDebugErrorDetails(error),
      adminPasswordConfigured: Boolean(adminPassword),
    });
    return null;
  }
}

async function authorizeTotpVerification(credentials: Record<string, unknown> | undefined) {
  const localDevMode = isLocalDevMode();
  const credentialsAuthEnabled = shouldEnableCredentialAuth(localDevMode);
  const userId = credentials?.userId as string | undefined;
  const code = credentials?.code as string | undefined;

  await writeAuthDebug("totp_attempt", {
    localDevMode,
    credentialsAuthEnabled,
    hasUserId: Boolean(userId),
    hasCode: Boolean(code),
  });

  if (!credentialsAuthEnabled) {
    await writeAuthDebug("totp_rejected", {
      reason: "credential_auth_disabled",
      localDevMode,
    });
    return null;
  }

  if (!userId || !code) {
    await writeAuthDebug("totp_rejected", {
      reason: "missing_totp_fields",
      hasUserId: Boolean(userId),
      hasCode: Boolean(code),
    });
    return null;
  }

  try {
    const store = await getDataStore();
    const user = await store.getUserById(userId);

    if (!user || !user.totpSecret) {
      await writeAuthDebug("totp_rejected", {
        reason: "missing_user_or_totp_secret",
        userId,
      });
      return null;
    }

    const { verifyTotpCode } = await import("@/lib/auth/totp");
    const isValid = verifyTotpCode(code, user.totpSecret);

    if (!isValid) {
      await writeAuthDebug("totp_rejected", {
        reason: "invalid_totp_code",
        userId,
      });
      return null;
    }

    await writeAuthDebug("totp_success", {
      userId,
    });

    return {
      id: user.id,
      email: user.email,
    } as const;
  } catch (error) {
    console.error("[AUTH] TOTP error:", error);
    await writeAuthDebug("totp_error", {
      ...toAuthDebugErrorDetails(error),
      userId: userId ?? null,
    });
    return null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: "master-password",
      name: "Mot de passe maitre",
      credentials: {
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        return authorizeMasterPassword(credentials as Record<string, unknown> | undefined);
      },
    }),
    Credentials({
      id: "totp-verify",
      name: "Verification TOTP",
      credentials: {
        userId: { label: "User ID", type: "text" },
        code: { label: "Code TOTP", type: "text" },
      },
      async authorize(credentials) {
        return authorizeTotpVerification(credentials as Record<string, unknown> | undefined);
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.needsTotp = (user as { needsTotp?: boolean }).needsTotp || false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session as { needsTotp?: boolean }).needsTotp = Boolean(token.needsTotp);
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
