"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LogIn, KeyRound, Shield, Loader2 } from "lucide-react";

type LoginStep = "password" | "totp";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("password");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Étape 1 : Vérification du mot de passe maître
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("master-password", {
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Mot de passe incorrect.");
        setLoading(false);
        return;
      }

      // Vérifier si le TOTP est requis
      const res = await fetch("/api/auth/session");
      const session = await res.json();

      if (session?.needsTotp) {
        setUserId(session.user?.id || "");
        setStep("totp");
        setLoading(false);
        return;
      }

      // Pas de TOTP — connexion directe
      router.push("/");
      router.refresh();
    } catch {
      setError("Une erreur est survenue.");
      setLoading(false);
    }
  }

  // Étape 2 : Vérification du code TOTP
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

      router.push("/");
      router.refresh();
    } catch {
      setError("Une erreur est survenue.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] px-4">
      <Card className="w-full max-w-md bg-[#12121a] border-[#1e1e2e]">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl font-bold text-[#f0f0f5]">
            Kimono
          </CardTitle>
          <p className="text-[#6b7280] text-sm">
            {step === "password"
              ? "Entrez votre mot de passe pour accéder à votre espace"
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
                  placeholder="Mot de passe d'accès"
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
                <span className="text-sm font-medium">
                  Vérification en 2 étapes
                </span>
              </div>

              <div className="space-y-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="Code à 6 chiffres"
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
                Vérifier
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
                <span className="ml-2 text-xs text-[#6b7280]">(bientôt)</span>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
