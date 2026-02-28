"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Shield, Loader2, CheckCircle } from "lucide-react";

interface TotpSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TotpSetupDialog({
  open,
  onOpenChange,
}: TotpSetupDialogProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function startSetup() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/totp/setup");
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la génération du QR code");
        setLoading(false);
        return;
      }

      setQrCode(data.qrCodeDataUrl);
    } catch {
      setError("Erreur réseau");
    }

    setLoading(false);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/totp/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Code invalide");
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Erreur réseau");
    }

    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#12121a] border-[#1e1e2e] text-[#f0f0f5] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#f0f0f5]">
            <Shield className="h-5 w-5 text-[#7c3aed]" />
            Configurer la 2FA
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="text-center space-y-4 py-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-[#f0f0f5] font-medium">
              Authentification à deux facteurs activée !
            </p>
            <p className="text-sm text-[#6b7280]">
              Vous devrez désormais entrer un code depuis votre application
              Authenticator à chaque connexion.
            </p>
            <Button
              onClick={() => onOpenChange(false)}
              className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white cursor-pointer"
            >
              Terminé
            </Button>
          </div>
        ) : !qrCode ? (
          <div className="text-center space-y-4 py-4">
            <p className="text-sm text-[#6b7280]">
              Scannez le QR code avec votre application Authenticator (Proton
              Pass, Google Authenticator, Authy, etc.) pour ajouter une couche
              de sécurité supplémentaire.
            </p>
            <Button
              onClick={startSetup}
              disabled={loading}
              className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white cursor-pointer"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Shield className="mr-2 h-4 w-4" />
              )}
              Générer le QR Code
            </Button>
          </div>
        ) : (
          <form onSubmit={verifyCode} className="space-y-4">
            <div className="flex justify-center">
              <img
                src={qrCode}
                alt="QR Code TOTP"
                className="w-48 h-48 rounded-lg"
              />
            </div>
            <p className="text-xs text-[#6b7280] text-center">
              Scannez ce QR code avec Proton Pass ou votre application
              Authenticator préférée, puis entrez le code à 6 chiffres
              ci-dessous.
            </p>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="Code à 6 chiffres"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="bg-[#0a0a0f] border-[#1e1e2e] text-[#f0f0f5] placeholder:text-[#6b7280] text-center text-2xl tracking-[0.5em]"
              autoFocus
            />

            <Button
              type="submit"
              className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white cursor-pointer"
              disabled={loading || code.length !== 6}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Activer la 2FA
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
