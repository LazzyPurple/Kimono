"use client";

import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { redirect } from "next/navigation";
import { Shield, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import TotpSetupDialog from "@/components/TotpSetupDialog";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const [totpDialogOpen, setTotpDialogOpen] = useState(false);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="animate-pulse text-[#7c3aed] text-lg">
          Chargement...
        </div>
      </div>
    );
  }

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Barre de navigation */}
      <nav className="sticky top-0 z-50 border-b border-[#1e1e2e] bg-[#0a0a0f]/80 backdrop-blur-md">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <a href="/" className="text-xl font-bold text-[#7c3aed]">
            Kimono
          </a>
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="text-sm text-[#6b7280] hover:text-[#f0f0f5] transition-colors"
            >
              Accueil
            </a>
            <a
              href="/search"
              className="text-sm text-[#6b7280] hover:text-[#f0f0f5] transition-colors"
            >
              Recherche
            </a>
            <a
              href="/favorites"
              className="text-sm text-[#6b7280] hover:text-[#f0f0f5] transition-colors"
            >
              Favoris
            </a>

            {/* Bouton 2FA / Sécurité */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTotpDialogOpen(true)}
              className="text-[#6b7280] hover:text-[#7c3aed] cursor-pointer"
              title="Configurer la 2FA"
            >
              <ShieldCheck className="h-4 w-4" />
            </Button>

            {/* Déconnexion */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-[#6b7280] hover:text-red-400 cursor-pointer"
              title="Se déconnecter"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Contenu */}
      <main className="container mx-auto px-4 py-6">{children}</main>

      {/* Dialog setup TOTP */}
      <TotpSetupDialog
        open={totpDialogOpen}
        onOpenChange={setTotpDialogOpen}
      />
    </div>
  );
}
