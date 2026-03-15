"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Heart, Loader2, LogOut, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import CreatorCard from "@/components/CreatorCard";
import Pagination from "@/components/Pagination";
import { useLikes } from "@/contexts/LikesContext";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { buildAppPageTitle } from "@/lib/page-titles";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { UnifiedCreator, Site } from "@/lib/api/helpers";
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

function FavoritesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useDocumentTitle(buildAppPageTitle("Favorites"));

  const qParam = searchParams.get("q") ?? "";
  const sortParam = (searchParams.get("sort") as "date" | "favorites" | "az") ?? "date";
  const serviceParam = searchParams.get("service") ?? "Tous";
  const pageParam = Number(searchParams.get("page") ?? "1");

  const [kemono, setKemono] = useState<SiteState>(defaultState);
  const [coomer, setCoomer] = useState<SiteState>(defaultState);
  const [loginModal, setLoginModal] = useState<LoginModal>({ open: false, site: null });
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [kemonoActive, setKemonoActive] = useState(true);
  const [coomerActive, setCoomerActive] = useState(true);
  const [searchQuery, setSearchQuery] = useState(qParam);

  const { likedCreatorsOrder } = useLikes();

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      let resettingPage = false;

      Object.entries(updates).forEach(([key, value]) => {
        if (key !== "page" && key !== "q") resettingPage = true;
        if (key === "q" && value !== qParam) resettingPage = true;

        if (value === null) {
          params.delete(key);
        } else if (key === "q" && value === "") {
          params.delete(key);
        } else if (key === "sort" && value === "date") {
          params.delete(key);
        } else if (key === "service" && value === "Tous") {
          params.delete(key);
        } else if (key === "page" && value === "1") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      if (resettingPage && !Object.prototype.hasOwnProperty.call(updates, "page")) {
        params.delete("page");
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, qParam, router, searchParams]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== qParam) {
        updateParams({ q: searchQuery || null });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [qParam, searchQuery, updateParams]);

  const fetchFavorites = useCallback(async (site: Site) => {
    const setter = site === "kemono" ? setKemono : setCoomer;
    setter((previous) => ({ ...previous, loading: true }));

    try {
      const response = await fetch(`/api/kimono-favorites?site=${site}`);
      const data = await response.json();

      setter({
        loggedIn: data.loggedIn ?? false,
        loading: false,
        username: data.username,
        favorites: (data.favorites ?? []).map((creator: Creator) => ({
          ...creator,
          site,
        })) as (Creator & { site: Site })[],
        expired: data.expired,
      });
    } catch {
      setter({ loggedIn: false, loading: false, favorites: [] });
    }
  }, []);

  useEffect(() => {
    void fetchFavorites("kemono");
    void fetchFavorites("coomer");
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
    if (!loginModal.site) {
      return;
    }

    setLoginLoading(true);
    setLoginError("");

    try {
      const response = await fetch("/api/kimono-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: loginModal.site,
          username: loginUsername,
          password: loginPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setLoginError(data.error ?? "Sign-in failed.");
        return;
      }

      closeLoginModal();
      void fetchFavorites(loginModal.site);
    } catch {
      setLoginError("Network error.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout(site: Site) {
    await fetch(`/api/kimono-favorites?site=${site}`, { method: "DELETE" });
    const setter = site === "kemono" ? setKemono : setCoomer;
    setter({ loggedIn: false, loading: false, favorites: [] });
  }

  const allFavorites: UnifiedCreator[] = useMemo(
    () => [...kemono.favorites, ...coomer.favorites],
    [coomer.favorites, kemono.favorites]
  );

  const services = useMemo(() => {
    const values = new Set(allFavorites.map((creator) => creator.service));
    return ["Tous", ...Array.from(values).sort()];
  }, [allFavorites]);

  const filteredFavorites = useMemo(() => {
    let result: UnifiedCreator[] = [];
    if (kemonoActive) result.push(...kemono.favorites);
    if (coomerActive) result.push(...coomer.favorites);

    if (qParam) {
      const normalizedQuery = qParam.toLowerCase();
      result = result.filter((creator) => creator.name.toLowerCase().includes(normalizedQuery));
    }

    if (serviceParam !== "Tous") {
      result = result.filter((creator) => creator.service === serviceParam);
    }

    result.sort((left, right) => {
      if (sortParam === "date") {
        return new Date(right.updated || 0).getTime() - new Date(left.updated || 0).getTime();
      }

      if (sortParam === "favorites") {
        const leftOrder = likedCreatorsOrder.get(`${left.site}-${left.service}-${left.id}`) ?? Infinity;
        const rightOrder = likedCreatorsOrder.get(`${right.site}-${right.service}-${right.id}`) ?? Infinity;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return (right.favorited || 0) - (left.favorited || 0);
      }

      return left.name.localeCompare(right.name);
    });

    return result;
  }, [coomer.favorites, coomerActive, kemono.favorites, kemonoActive, likedCreatorsOrder, qParam, serviceParam, sortParam]);

  const ITEMS_PER_PAGE = 50;
  const paginatedFavorites = filteredFavorites.slice((pageParam - 1) * ITEMS_PER_PAGE, pageParam * ITEMS_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(filteredFavorites.length / ITEMS_PER_PAGE));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Heart className="h-6 w-6 text-[#7c3aed]" />
        <h1 className="text-2xl font-bold text-[#f0f0f5]">Favorites</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["kemono", "coomer"] as Site[]).map((site) => {
          const state = site === "kemono" ? kemono : coomer;
          const isActive = site === "kemono" ? kemonoActive : coomerActive;
          const toggleActive = () => {
            if (site === "kemono") {
              setKemonoActive((value) => !value);
            } else {
              setCoomerActive((value) => !value);
            }
          };

          const siteColor =
            site === "kemono"
              ? "text-[#7c3aed] bg-[#7c3aed]/10 border-[#7c3aed]/30"
              : "text-pink-400 bg-pink-600/10 border-pink-600/30";

          return (
            <div
              key={site}
              onClick={() => {
                toggleActive();
                updateParams({ page: "1" });
              }}
              className={`space-y-3 rounded-xl border p-4 transition-all duration-200 ${siteColor} ${
                !isActive ? "opacity-50 grayscale hover:opacity-75" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge className={site === "kemono" ? "bg-[#7c3aed]/20 text-[#7c3aed]" : "bg-pink-600/20 text-pink-400"}>
                    {site.charAt(0).toUpperCase() + site.slice(1)}
                  </Badge>
                  {state.loggedIn && state.username && <span className="text-xs text-[#6b7280]">{state.username}</span>}
                </div>

                <div onClick={(event) => event.stopPropagation()}>
                  {state.loading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#6b7280]" />
                  ) : state.loggedIn ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleLogout(site)}
                      className="h-7 cursor-pointer px-2 text-[#6b7280] hover:text-red-400"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => openLoginModal(site)}
                      className={`h-7 cursor-pointer text-xs ${
                        site === "kemono"
                          ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                          : "bg-pink-600 text-white hover:bg-pink-700"
                      }`}
                    >
                      Sign in
                    </Button>
                  )}
                </div>
              </div>

              {!state.loading && !state.loggedIn && (
                <p className="text-xs text-[#6b7280]">
                  {state.expired
                    ? "Session expired. Please sign in again."
                    : `Sign in to ${site.charAt(0).toUpperCase() + site.slice(1)} to view your favorites.`}
                </p>
              )}

              {state.loggedIn && (
                <p className="text-xs text-[#6b7280]">
                  {state.favorites.length} favorite creator{state.favorites.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {allFavorites.length > 0 && (
        <div className="space-y-4 rounded-xl border border-[#1e1e2e] bg-[#12121a] p-4">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
              <Input
                placeholder="Search creators..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-9 border-[#1e1e2e] bg-[#0a0a0f] pl-9 text-sm text-[#f0f0f5]"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => updateParams({ sort: "date" })}
                className={`h-8 cursor-pointer text-xs transition-colors ${
                  sortParam === "date"
                    ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                    : "border border-[#1e1e2e] bg-transparent text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
                }`}
              >
                Updated
              </Button>
              <Button
                size="sm"
                onClick={() => updateParams({ sort: "favorites" })}
                className={`h-8 cursor-pointer text-xs transition-colors ${
                  sortParam === "favorites"
                    ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                    : "border border-[#1e1e2e] bg-transparent text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
                }`}
              >
                Added first
              </Button>
              <Button
                size="sm"
                onClick={() => updateParams({ sort: "az" })}
                className={`h-8 cursor-pointer text-xs transition-colors ${
                  sortParam === "az"
                    ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                    : "border border-[#1e1e2e] bg-transparent text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
                }`}
              >
                A-Z
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="mr-1 h-4 w-4 text-[#6b7280]" />
            {services.map((service) => (
              <Badge
                key={service}
                onClick={() => updateParams({ service })}
                className={`cursor-pointer px-3 py-1 text-xs transition-colors ${
                  serviceParam === service
                    ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                    : "border border-[#1e1e2e] bg-[#0a0a0f] text-[#6b7280] hover:bg-[#1e1e2e]"
                }`}
              >
                {service === "Tous" ? "All" : service}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {!isFullyLoaded ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" />
        </div>
      ) : allFavorites.length === 0 ? (
        <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-12 text-center text-[#6b7280]">
          Sign in to view your favorites, or start adding some.
        </div>
      ) : filteredFavorites.length === 0 ? (
        <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-12 text-center text-[#6b7280]">
          No creators match the current filters.
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-[#6b7280]">
            {filteredFavorites.length} creator{filteredFavorites.length !== 1 ? "s" : ""} shown
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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

          <Pagination current={pageParam} total={totalPages} onChange={(page) => updateParams({ page: String(page) })} />
        </div>
      )}

      <Dialog open={loginModal.open} onOpenChange={(open) => !open && closeLoginModal()}>
        <DialogContent className="bg-[#12121a] text-[#f0f0f5] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge className={loginModal.site === "kemono" ? "bg-[#7c3aed]/20 text-[#7c3aed]" : "bg-pink-600/20 text-pink-400"}>
                {loginModal.site}
              </Badge>
              Sign in
            </DialogTitle>
            <DialogDescription className="text-[#6b7280]">
              Save your Kemono or Coomer session so Kimono can sync your favorites.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm text-[#6b7280]">Username</label>
              <Input
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
                placeholder="Your username"
                className="border-[#1e1e2e] bg-[#0a0a0f] text-[#f0f0f5] placeholder:text-[#6b7280]"
                onKeyDown={(event) => event.key === "Enter" && void handleLogin()}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#6b7280]">Password</label>
              <Input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder="Your password"
                className="border-[#1e1e2e] bg-[#0a0a0f] text-[#f0f0f5] placeholder:text-[#6b7280]"
                onKeyDown={(event) => event.key === "Enter" && void handleLogin()}
              />
            </div>

            {loginError && (
              <p className="flex items-center gap-1 text-sm text-red-400">
                <X className="h-3.5 w-3.5" />
                {loginError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeLoginModal} className="cursor-pointer text-[#6b7280] hover:text-[#f0f0f5]">
                Cancel
              </Button>
              <Button
                onClick={() => void handleLogin()}
                disabled={loginLoading || !loginUsername || !loginPassword}
                className={`cursor-pointer text-white ${
                  loginModal.site === "kemono"
                    ? "bg-[#7c3aed] hover:bg-[#6d28d9]"
                    : "bg-pink-600 hover:bg-pink-700"
                }`}
              >
                {loginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
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
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" />
        </div>
      }
    >
      <FavoritesPageContent />
    </Suspense>
  );
}
