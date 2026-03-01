"use client";

import { useState, useEffect, useCallback } from "react";
import { Heart, Loader2, X, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import CreatorCard from "@/components/CreatorCard";
import type { UnifiedCreator, Site } from "@/lib/api/unified";
import type { Creator } from "@/lib/api/kemono";

interface SiteState {
  loggedIn: boolean;
  loading: boolean;
  username?: string;
  favorites: (Creator & { site: Site })[];
  expired?: boolean;
}

const defaultState: SiteState = {
  loggedIn: false,
  loading: true,
  favorites: [],
};

interface LoginModal {
  open: boolean;
  site: Site | null;
}

export default function FavoritesPage() {
  const [kemono, setKemono] = useState<SiteState>(defaultState);
  const [coomer, setCoomer] = useState<SiteState>(defaultState);
  const [loginModal, setLoginModal] = useState<LoginModal>({
    open: false,
    site: null,
  });
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const fetchFavorites = useCallback(async (site: Site) => {
    const setter = site === "kemono" ? setKemono : setCoomer;
    setter((prev) => ({ ...prev, loading: true }));

    try {
      const res = await fetch(`/api/kimono-favorites?site=${site}`);
      const data = await res.json();

      setter({
        loggedIn: data.loggedIn ?? false,
        loading: false,
        username: data.username,
        favorites: (data.favorites ?? []).map(
          (c: Creator) => ({ ...c, site } as Creator & { site: Site })
        ),
        expired: data.expired,
      });
    } catch {
      setter({ loggedIn: false, loading: false, favorites: [] });
    }
  }, []);

  useEffect(() => {
    fetchFavorites("kemono");
    fetchFavorites("coomer");
  }, [fetchFavorites]);

  function openLoginModal(site: Site) {
    setLoginModal({ open: true, site });
    setLoginUsername("");
    setLoginPassword("");
    setLoginError("");
  }

  function closeLoginModal() {
    setLoginModal({ open: false, site: null });
  }

  async function handleLogin() {
    if (!loginModal.site) return;
    setLoginLoading(true);
    setLoginError("");

    try {
      const res = await fetch("/api/kimono-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: loginModal.site,
          username: loginUsername,
          password: loginPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setLoginError(data.error ?? "Connexion échouée");
        return;
      }

      closeLoginModal();
      fetchFavorites(loginModal.site);
    } catch {
      setLoginError("Erreur réseau");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout(site: Site) {
    await fetch(`/api/kimono-favorites?site=${site}`, { method: "DELETE" });
    const setter = site === "kemono" ? setKemono : setCoomer;
    setter({ loggedIn: false, loading: false, favorites: [] });
  }

  const allFavorites: UnifiedCreator[] = [
    ...kemono.favorites,
    ...coomer.favorites,
  ];

  const isFullyLoaded = !kemono.loading && !coomer.loading;
  const anyLoggedIn = kemono.loggedIn || coomer.loggedIn;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Heart className="h-6 w-6 text-[#7c3aed]" />
        <h1 className="text-2xl font-bold text-[#f0f0f5]">Favoris</h1>
      </div>

      {/* Panneaux de connexion par site */}
      <div className="grid gap-4 sm:grid-cols-2">
        {(["kemono", "coomer"] as Site[]).map((site) => {
          const state = site === "kemono" ? kemono : coomer;
          const siteColor =
            site === "kemono"
              ? "text-[#7c3aed] bg-[#7c3aed]/10 border-[#7c3aed]/30"
              : "text-pink-400 bg-pink-600/10 border-pink-600/30";

          return (
            <div
              key={site}
              className={`rounded-xl border p-4 space-y-3 ${siteColor}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge
                    className={
                      site === "kemono"
                        ? "bg-[#7c3aed]/20 text-[#7c3aed]"
                        : "bg-pink-600/20 text-pink-400"
                    }
                  >
                    {site.charAt(0).toUpperCase() + site.slice(1)}
                  </Badge>
                  {state.loggedIn && state.username && (
                    <span className="text-xs text-[#6b7280]">
                      {state.username}
                    </span>
                  )}
                </div>

                {state.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#6b7280]" />
                ) : state.loggedIn ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleLogout(site)}
                    className="text-[#6b7280] hover:text-red-400 h-7 px-2 cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => openLoginModal(site)}
                    className={`cursor-pointer text-xs h-7 ${
                      site === "kemono"
                        ? "bg-[#7c3aed] hover:bg-[#6d28d9] text-white"
                        : "bg-pink-600 hover:bg-pink-700 text-white"
                    }`}
                  >
                    Se connecter
                  </Button>
                )}
              </div>

              {!state.loading && !state.loggedIn && (
                <p className="text-xs text-[#6b7280]">
                  {state.expired
                    ? "Session expirée. Reconnectez-vous."
                    : `Connectez-vous à ${site.charAt(0).toUpperCase() + site.slice(1)} pour voir vos favoris.`}
                </p>
              )}

              {state.loggedIn && (
                <p className="text-xs text-[#6b7280]">
                  {state.favorites.length} créateur
                  {state.favorites.length !== 1 ? "s" : ""} en favori
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Contenu */}
      {!isFullyLoaded ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" />
        </div>
      ) : !anyLoggedIn ? (
        <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center space-y-4">
          <Heart className="h-12 w-12 text-[#6b7280] mx-auto" />
          <p className="text-[#6b7280] text-lg">
            Connectez-vous à Kemono/Coomer pour voir vos favoris
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Button
              onClick={() => openLoginModal("kemono")}
              className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white cursor-pointer"
            >
              Se connecter à Kemono
            </Button>
            <Button
              onClick={() => openLoginModal("coomer")}
              className="bg-pink-600 hover:bg-pink-700 text-white cursor-pointer"
            >
              Se connecter à Coomer
            </Button>
          </div>
        </div>
      ) : allFavorites.length === 0 ? (
        <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center">
          <Heart className="h-12 w-12 text-[#6b7280] mx-auto mb-4" />
          <p className="text-[#6b7280] text-lg">
            Aucun créateur en favori pour le moment.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-[#6b7280]">
            {allFavorites.length} créateur
            {allFavorites.length !== 1 ? "s" : ""} en favori
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {allFavorites.map((creator) => (
              <CreatorCard
                key={`${creator.site}-${creator.service}-${creator.id}`}
                id={creator.id}
                name={creator.name}
                service={creator.service}
                site={creator.site}
                favorited={creator.favorited}
                updated={creator.updated}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modal de connexion */}
      <Dialog open={loginModal.open} onOpenChange={(o) => !o && closeLoginModal()}>
        <DialogContent className="bg-[#12121a] border-[#1e1e2e] text-[#f0f0f5] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge
                className={
                  loginModal.site === "kemono"
                    ? "bg-[#7c3aed]/20 text-[#7c3aed]"
                    : "bg-pink-600/20 text-pink-400"
                }
              >
                {loginModal.site}
              </Badge>
              Connexion
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm text-[#6b7280]">Nom d&apos;utilisateur</label>
              <Input
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="Votre nom d'utilisateur"
                className="bg-[#0a0a0f] border-[#1e1e2e] text-[#f0f0f5] placeholder:text-[#6b7280]"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#6b7280]">Mot de passe</label>
              <Input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Votre mot de passe"
                className="bg-[#0a0a0f] border-[#1e1e2e] text-[#f0f0f5] placeholder:text-[#6b7280]"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>

            {loginError && (
              <p className="text-sm text-red-400 flex items-center gap-1">
                <X className="h-3.5 w-3.5" />
                {loginError}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={closeLoginModal}
                className="text-[#6b7280] hover:text-[#f0f0f5] cursor-pointer"
              >
                Annuler
              </Button>
              <Button
                onClick={handleLogin}
                disabled={loginLoading || !loginUsername || !loginPassword}
                className={`cursor-pointer text-white ${
                  loginModal.site === "kemono"
                    ? "bg-[#7c3aed] hover:bg-[#6d28d9]"
                    : "bg-pink-600 hover:bg-pink-700"
                }`}
              >
                {loginLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Se connecter"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
