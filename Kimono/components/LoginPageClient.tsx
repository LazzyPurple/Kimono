"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LogIn, KeyRound, Shield, Loader2 } from "lucide-react";
import Logo from "@/components/Logo";
import {
  getInitialLoginStep,
  getPostPasswordSuccessAction,
  LOGIN_SESSION_TIMEOUT_MS,
  type LoginStep,
  type SessionSnapshot,
} from "@/lib/login-flow";

async function readSessionSnapshot(timeoutMs = LOGIN_SESSION_TIMEOUT_MS): Promise<SessionSnapshot> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("/api/auth/session", {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as SessionSnapshot;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function hardRedirect(href: string) {
  window.location.assign(href);
}

export default function LoginPageClient() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<LoginStep>(() =>
    getInitialLoginStep(searchParams.get("step"))
  );
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const nextStep = getInitialLoginStep(searchParams.get("step"));
    setStep(nextStep);

    if (nextStep !== "totp") {
      return;
    }

    let cancelled = false;

    async function hydrateTotpStep() {
      const session = await readSessionSnapshot();
      const nextUserId = session?.user?.id?.trim();

      if (cancelled || nextStep !== "totp") {
        return;
      }

      if (nextUserId) {
        setUserId(nextUserId);
        return;
      }

      setError("La session 2FA est introuvable. Recommencez la connexion.");
      setStep("password");
    }

    void hydrateTotpStep();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("master-password", {
        password,
        redirect: false,
      });

      if (result?.error || !result?.ok) {
        setError("Mot de passe incorrect.");
        setLoading(false);
        return;
      }

      const session = await readSessionSnapshot();
      const action = getPostPasswordSuccessAction(session);

      if (action.type === "show-totp") {
        setUserId(action.userId);
        setStep("totp");
        setLoading(false);
        return;
      }

      hardRedirect(action.href);
    } catch {
      setError("Une erreur est survenue.");
      setLoading(false);
    }
  }

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("totp-verify", {
        userId,
        code: totpCode,
        redirect: false,
      });

      if (result?.error) {
        setError("Code 2FA invalide.");
        setLoading(false);
        return;
      }

      hardRedirect("/search");
    } catch {
      setError("Une erreur est survenue.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] px-4">
      <Card className="w-full max-w-md bg-[#12121a] border-[#1e1e2e]">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="flex justify-center py-2">
            <Logo className="h-8 sm:h-10 w-auto" />
          </CardTitle>
          <p className="text-[#6b7280] text-sm">
            {step === "password"
              ? "Entrez votre mot de passe pour acceder a votre espace"
              : "Entrez le code de votre application Authenticator"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {step === "password" && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder={"Mot de passe d'acces"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-[#0a0a0f] border-[#1e1e2e] text-[#f0f0f5] placeholder:text-[#6b7280]"
                  required
                  autoFocus
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white cursor-pointer"
                size="lg"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="mr-2 h-4 w-4" />
                )}
                Se connecter
              </Button>
            </form>
          )}

          {step === "totp" && (
            <form onSubmit={handleTotpSubmit} className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-[#7c3aed] mb-2">
                <Shield className="h-5 w-5" />
                <span className="text-sm font-medium">Verification en 2 etapes</span>
              </div>

              <div className="space-y-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder={"Code a 6 chiffres"}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  className="bg-[#0a0a0f] border-[#1e1e2e] text-[#f0f0f5] placeholder:text-[#6b7280] text-center text-2xl tracking-[0.5em]"
                  required
                  autoFocus
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white cursor-pointer"
                size="lg"
                disabled={loading || totpCode.length !== 6}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Shield className="mr-2 h-4 w-4" />
                )}
                Verifier
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full text-[#6b7280] hover:text-[#f0f0f5] cursor-pointer"
                onClick={() => {
                  setStep("password");
                  setError("");
                  setTotpCode("");
                }}
              >
                Retour
              </Button>
            </form>
          )}

          {step === "password" && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-[#1e1e2e]" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[#12121a] px-2 text-[#6b7280]">ou</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full border-[#1e1e2e] text-[#f0f0f5] hover:bg-[#1e1e2e] cursor-pointer"
                size="lg"
                disabled
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Utiliser une Passkey
                <span className="ml-2 text-xs text-[#6b7280]">(bientot)</span>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}