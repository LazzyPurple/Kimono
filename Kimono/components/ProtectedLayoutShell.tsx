"use client";

import { useState } from "react";
import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import TotpSetupDialog from "@/components/TotpSetupDialog";
import Logo from "@/components/Logo";
import SakuraDecor from "@/components/SakuraDecor";
import { LikesProvider } from "@/contexts/LikesContext";

export default function ProtectedLayoutShell({
  children,
  showSecurityControls,
  onLogout,
}: {
  children: React.ReactNode;
  showSecurityControls: boolean;
  onLogout?: () => void;
}) {
  const [totpDialogOpen, setTotpDialogOpen] = useState(false);

  return (
    <LikesProvider>
      <div className="min-h-screen relative">
        <SakuraDecor />
        <nav className="sticky top-0 z-50 border-b border-[#ffb7c5]/20 bg-[#0a0a0f]/80 backdrop-blur-md">
          <div className="container mx-auto flex h-14 items-center justify-between px-4 relative z-10">
            <Link href="/search" className="shrink-0 flex items-center hover:opacity-80 transition-opacity">
              <Logo className="h-5 sm:h-6 w-auto" />
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/search"
                className="text-sm text-[#6b7280] hover:text-[#f0f0f5] transition-colors"
              >
                Accueil
              </Link>
              <Link
                href="/favorites"
                className="text-sm text-[#6b7280] hover:text-[#f0f0f5] transition-colors"
              >
                Favoris
              </Link>
              <Link
                href="/popular/kemono"
                className="text-sm text-[#6b7280] hover:text-[#f0f0f5] transition-colors"
              >
                Populaires
              </Link>
              <Link
                href="/discover"
                className="text-sm text-[#6b7280] hover:text-[#f0f0f5] transition-colors flex items-center gap-1"
              >
                {"D\u00e9couverte"}
              </Link>

              {showSecurityControls && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTotpDialogOpen(true)}
                  className="text-[#6b7280] hover:text-[#7c3aed] cursor-pointer"
                  title="Configurer la 2FA"
                >
                  <ShieldCheck className="h-4 w-4" />
                </Button>
              )}

              {showSecurityControls && onLogout && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLogout}
                  className="text-[#6b7280] hover:text-red-400 cursor-pointer"
                  title={"Se d\u00e9connecter"}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-6 relative z-10">{children}</main>

        {showSecurityControls && (
          <TotpSetupDialog
            open={totpDialogOpen}
            onOpenChange={setTotpDialogOpen}
          />
        )}
      </div>
    </LikesProvider>
  );
}
