"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
        setError(data.error || "Failed to generate the QR code.");
        setLoading(false);
        return;
      }

      setQrCode(data.qrCodeDataUrl);
    } catch {
      setError("Network error.");
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
        setError(data.error || "Invalid code.");
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error.");
    }

    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-[#1e1e2e] bg-[#12121a] text-[#f0f0f5]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#f0f0f5]">
            <Shield className="h-5 w-5 text-[#7c3aed]" />
            Set up 2FA
          </DialogTitle>
          <DialogDescription className="text-[#6b7280]">
            Add an authenticator app to protect your account with a second verification step.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <p className="font-medium text-[#f0f0f5]">
              Two-factor authentication is now enabled.
            </p>
            <p className="text-sm text-[#6b7280]">
              You will now be asked for a code from your authenticator app each time you sign in.
            </p>
            <Button
              onClick={() => onOpenChange(false)}
              className="cursor-pointer bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
            >
              Done
            </Button>
          </div>
        ) : !qrCode ? (
          <div className="space-y-4 py-4 text-center">
            <p className="text-sm text-[#6b7280]">
              Scan a QR code with your authenticator app such as Proton Pass, Google Authenticator, or Authy.
            </p>
            <Button
              onClick={startSetup}
              disabled={loading}
              className="cursor-pointer bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Shield className="mr-2 h-4 w-4" />
              )}
              Generate QR code
            </Button>
          </div>
        ) : (
          <form onSubmit={verifyCode} className="space-y-4">
            <div className="flex justify-center">
              <img
                src={qrCode}
                alt="TOTP QR Code"
                className="h-48 w-48 rounded-lg"
              />
            </div>
            <p className="text-center text-xs text-[#6b7280]">
              Scan this QR code with Proton Pass or your preferred authenticator app, then enter the 6-digit code below.
            </p>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-center text-sm text-red-400">
                {error}
              </div>
            )}

            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="bg-[#0a0a0f] border-[#1e1e2e] text-[#f0f0f5] placeholder:text-[#6b7280] text-center text-2xl tracking-[0.5em]"
              autoFocus
            />

            <Button
              type="submit"
              className="w-full cursor-pointer bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
              disabled={loading || code.length !== 6}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Enable 2FA
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
