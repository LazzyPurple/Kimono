"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { Heart, Loader2, X, LogOut, Search, SlidersHorizontal } from "lucide-react";
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
import Pagination from "@/components/Pagination";
import { useLikes } from "@/contexts/LikesContext";
import type { UnifiedCreator, Site } from "@/lib/api/helpers";
import type { Creator } from "@/lib/api/kemono";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

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

function FavoritesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const qParam = searchParams.get("q") ?? "";
  const sortParam = (searchParams.get("sort") as "date" | "favorites" | "az") ?? "date";
  const serviceParam = searchParams.get("service") ?? "Tous";
  const pageParam = Number(searchParams.get("page") ?? "1");

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

  const [kemonoActive, setKemonoActive] = useState(true);
  const [coomerActive, setCoomerActive] = useState(true);
  
  // Local input for debouncing
  const [searchQuery, setSearchQuery] = useState(qParam);

  const { likedCreatorsOrder } = useLikes();

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    let resettingPage = false;
    
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== "page" && key !== "q") resettingPage = true;
      if (key === "q" && value !== qParam) resettingPage = true;

      if (value === null) {
        params.delete(key);
      } else {
        if (key === "q" && value === "") params.delete(key);
        else if (key === "sort" && value === "date") params.delete(key);
        else if (key === "service" && value === "Tous") params.delete(key);
        else if (key === "page" && value === "1") params.delete(key);
        else params.set(key, value);
      }
    });

    if (resettingPage && !updates.hasOwnProperty("page")) {
      params.delete("page");
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, pathname, router, qParam]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== qParam) {
        updateParams({ q: searchQuery || null });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, qParam, updateParams]);


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

  const isFullyLoaded = !kemono.loading && !coomer.loading;
  useScrollRestoration(`favorites-${pageParam}`, isFullyLoaded);

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

  const allFavorites: UnifiedCreator[] = useMemo(() => {
    return [...kemono.favorites, ...coomer.favorites];
  }, [kemono.favorites, coomer.favorites]);

  const services = useMemo(() => {
    const s = new Set(allFavorites.map((c) => c.service));
    return ["Tous", ...Array.from(s).sort()];
  }, [allFavorites]);

  const filteredFavorites = useMemo(() => {
    let result: UnifiedCreator[] = [];
    if (kemonoActive) result.push(...kemono.favorites);
    if (coomerActive) result.push(...coomer.favorites);

    if (qParam) {
      const q = qParam.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }

    if (serviceParam !== "Tous") {
      result = result.filter((c) => c.service === serviceParam);
    }

    result.sort((a, b) => {
      if (sortParam === "date") {
        const dateA = new Date(a.updated || 0).getTime();
        const dateB = new Date(b.updated || 0).getTime();
        return dateB - dateA;
      }
      if (sortParam === "favorites") {
        const orderA = likedCreatorsOrder.get(`${a.site}-${a.service}-${a.id}`) ?? Infinity;
        const orderB = likedCreatorsOrder.get(`${b.site}-${b.service}-${b.id}`) ?? Infinity;
        if (orderA !== orderB) return orderA - orderB;
        // fallback au favoris global si jamais
        return (b.favorited || 0) - (a.favorited || 0);
      }
      if (sortParam === "az") {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });

    return result;
  }, [
    kemono.favorites,
    coomer.favorites,
    kemonoActive,
    coomerActive,
    qParam,
    serviceParam,
    sortParam,
    likedCreatorsOrder,
  ]);

  const ITEMS_PER_PAGE = 50;
  const paginatedFavorites = filteredFavorites.slice(
    (pageParam - 1) * ITEMS_PER_PAGE,
    pageParam * ITEMS_PER_PAGE
  );
  
  const totalPages = Math.max(1, Math.ceil(filteredFavorites.length / ITEMS_PER_PAGE));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Heart className="h-6 w-6 text-[#7c3aed]" />
        <h1 className="text-2xl font-bold text-[#f0f0f5]">Favoris</h1>
      </div>

      {/* Panneaux de connexion et Toggles */}
      <div className="grid gap-4 sm:grid-cols-2">
        {(["kemono", "coomer"] as Site[]).map((site) => {
          const state = site === "kemono" ? kemono : coomer;
          const isActive = site === "kemono" ? kemonoActive : coomerActive;
          const toggleActive = () =>
            site === "kemono"
              ? setKemonoActive(!kemonoActive)
              : setCoomerActive(!coomerActive);

          const siteColor =
            site === "kemono"
              ? "text-[#7c3aed] bg-[#7c3aed]/10 border-[#7c3aed]/30"
              : "text-pink-400 bg-pink-600/10 border-pink-600/30";

          return (
            <div
              key={site}
              onClick={() => {
                toggleActive();
                // Reset page to 1 when toggling sites since the count changes
                updateParams({ page: "1" });
              }}
              className={`rounded-xl border p-4 space-y-3 cursor-pointer transition-all duration-200 ${siteColor} ${
                !isActive && "opacity-50 grayscale hover:opacity-75"
              }`}
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

                <div onClick={(e) => e.stopPropagation()}>
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
              </div>

              {!state.loading && !state.loggedIn && (
                <p className="text-xs text-[#6b7280]">
                  {state.expired
                    ? "Session expirée. Reconnectez-vous."
                    : `Connectez-vous à ${
                        site.charAt(0).toUpperCase() + site.slice(1)
                      } pour voir vos favoris.`}
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

      {/* Barre de filtres */}
      {allFavorites.length > 0 && (
        <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            {/* Recherche */}
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280]" />
              <Input
                placeholder="Rechercher un créateur..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-[#0a0a0f] border-[#1e1e2e] text-[#f0f0f5] h-9 text-sm"
              />
            </div>
            {/* Tri */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => updateParams({ sort: "date" })}
                className={`cursor-pointer text-xs h-8 transition-colors ${
                  sortParam === "date"
                    ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                    : "bg-transparent border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
                }`}
              >
                Par date
              </Button>
              <Button
                size="sm"
                onClick={() => updateParams({ sort: "favorites" })}
                className={`cursor-pointer text-xs h-8 transition-colors ${
                  sortParam === "favorites"
                    ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                    : "bg-transparent border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
                }`}
              >
                Date d'ajout
              </Button>
              <Button
                size="sm"
                onClick={() => updateParams({ sort: "az" })}
                className={`cursor-pointer text-xs h-8 transition-colors ${
                  sortParam === "az"
                    ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                    : "bg-transparent border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
                }`}
              >
                A-Z
              </Button>
            </div>
          </div>
          {/* Services */}
          <div className="flex flex-wrap gap-2 items-center">
            <SlidersHorizontal className="h-4 w-4 text-[#6b7280] mr-1" />
            {services.map((s) => (
              <Badge
                key={s}
                onClick={() => updateParams({ service: s })}
                className={`cursor-pointer px-3 py-1 text-xs transition-colors ${
                  serviceParam === s
                    ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                    : "bg-[#0a0a0f] text-[#6b7280] border border-[#1e1e2e] hover:bg-[#1e1e2e]"
                }`}
              >
                {s}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Contenu */}
      {!isFullyLoaded ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" />
        </div>
      ) : allFavorites.length === 0 ? (
        <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center text-[#6b7280]">
          Connectez-vous pour voir vos favoris, ou commencez à en ajouter !
        </div>
      ) : filteredFavorites.length === 0 ? (
        <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center text-[#6b7280]">
          Aucun créateur ne correspond à vos filtres.
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-[#6b7280]">
            {filteredFavorites.length} créateur
            {filteredFavorites.length !== 1 ? "s" : ""} affiché
            {filteredFavorites.length !== 1 ? "s" : ""}
          </p>

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {paginatedFavorites.map((creator) => (
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

          <Pagination
            current={pageParam}
            total={totalPages}
            onChange={(p) => updateParams({ page: String(p) })}
          />
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

export default function FavoritesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center min-h-[50vh] items-center"><Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" /></div>}>
      <FavoritesPageContent />
    </Suspense>
  )
}
