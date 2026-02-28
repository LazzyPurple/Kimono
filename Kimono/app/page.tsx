import { Button } from "@/components/ui/button";
import { LogIn, Sparkles } from "lucide-react";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0f] px-4">
      {/* Glow effect */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#7c3aed]/20 rounded-full blur-[128px] pointer-events-none" />

      <div className="relative z-10 text-center space-y-8">
        {/* Logo / Titre */}
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="h-8 w-8 text-[#7c3aed]" />
            <h1 className="text-6xl font-bold text-[#f0f0f5] tracking-tight">
              Kimono
            </h1>
          </div>
          <p className="text-[#6b7280] text-lg max-w-md mx-auto">
            Votre frontend personnel pour Kemono et Coomer.
            <br />
            Tout votre contenu, unifié en un seul endroit.
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/login">
            <Button
              size="lg"
              className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white px-8 cursor-pointer"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Se connecter
            </Button>
          </Link>
          <Link href="/search">
            <Button
              size="lg"
              variant="outline"
              className="border-[#1e1e2e] text-[#f0f0f5] hover:bg-[#1e1e2e] px-8 cursor-pointer"
            >
              Explorer
            </Button>
          </Link>
        </div>

        {/* Footer */}
        <p className="text-xs text-[#6b7280]">
          Projet personnel &middot; Non affilié à Kemono ou Coomer
        </p>
      </div>
    </div>
  );
}
