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
      <div className="relative min-h-screen">
        <SakuraDecor />
        <nav className="sticky top-0 z-50 border-b border-[#ffb7c5]/20 bg-[#0a0a0f]/80 backdrop-blur-md">
          <div className="container relative z-10 mx-auto flex h-14 items-center justify-between px-4">
            <Link href="/search" className="flex shrink-0 items-center transition-opacity hover:opacity-80">
              <Logo className="h-5 w-auto sm:h-6" />
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/search"
                className="text-sm text-[#6b7280] transition-colors hover:text-[#f0f0f5]"
              >
                Home
              </Link>
              <Link
                href="/favorites"
                className="text-sm text-[#6b7280] transition-colors hover:text-[#f0f0f5]"
              >
                Favorites
              </Link>
              <Link
                href="/popular/kemono"
                className="text-sm text-[#6b7280] transition-colors hover:text-[#f0f0f5]"
              >
                Popular
              </Link>
              <Link
                href="/discover"
                className="flex items-center gap-1 text-sm text-[#6b7280] transition-colors hover:text-[#f0f0f5]"
              >
                Discover
              </Link>

              {showSecurityControls && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTotpDialogOpen(true)}
                  className="cursor-pointer text-[#6b7280] hover:text-[#7c3aed]"
                  title="Set up 2FA"
                >
                  <ShieldCheck className="h-4 w-4" />
                </Button>
              )}

              {showSecurityControls && onLogout && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLogout}
                  className="cursor-pointer text-[#6b7280] hover:text-red-400"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </nav>

        <main className="container relative z-10 mx-auto px-4 py-6">{children}</main>

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
