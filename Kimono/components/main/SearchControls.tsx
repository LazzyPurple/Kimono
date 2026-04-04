"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { KimonoSite } from "@/lib/db/types";
import {
  buildSearchHref,
  CREATOR_SEARCH_SERVICES,
  type ParsedCreatorSearchParams,
} from "@/lib/search/creator-search";

interface SearchControlsProps {
  initialParams: ParsedCreatorSearchParams;
}

const SITE_OPTIONS = [
  { value: "all", label: "Both" },
  { value: "kemono", label: "Kemono" },
  { value: "coomer", label: "Coomer" },
] as const;

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "updated", label: "Updated" },
  { value: "favorited", label: "Favorited" },
] as const;

type SiteFilter = KimonoSite | "all";

export default function SearchControls({ initialParams }: SearchControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const firstRender = useRef(true);

  const [query, setQuery] = useState(initialParams.q);
  const [site, setSite] = useState<SiteFilter>(initialParams.site ?? "all");
  const [service, setService] = useState(initialParams.service ?? "all");
  const [sort, setSort] = useState(initialParams.sort);

  useEffect(() => {
    setQuery(initialParams.q);
    setSite(initialParams.site ?? "all");
    setService(initialParams.service ?? "all");
    setSort(initialParams.sort);
  }, [initialParams.q, initialParams.service, initialParams.site, initialParams.sort]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    const timeout = window.setTimeout(() => {
      const href = buildSearchHref({
        q: query.trim(),
        page: 1,
        site: site === "all" ? undefined : site,
        service: service === "all" ? undefined : service,
        sort,
        order: sort === "name" ? "asc" : "desc",
      });

      if (href !== `${pathname}${window.location.search}`) {
        startTransition(() => {
          router.replace(href, { scroll: false });
        });
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [pathname, query, router, service, site, sort]);

  return (
    <div className="neo-panel p-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.7fr))]">
        <label className="flex flex-col gap-2">
          <span className="neo-label">Search creators</span>
          <input
            className="h-14 border-2 border-white bg-[#111111] px-4 text-base font-semibold text-white outline-none transition-colors placeholder:text-[#666666] focus:border-[#7C3AED]"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="bunny, anon, fanbox..."
            autoComplete="off"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="neo-label">Site</span>
          <select
            className="h-14 border-2 border-white bg-[#111111] px-4 text-base font-semibold uppercase tracking-[0.08em] text-white outline-none focus:border-[#7C3AED]"
            value={site}
            onChange={(event) => setSite(event.target.value as SiteFilter)}
          >
            {SITE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="neo-label">Service</span>
          <select
            className="h-14 border-2 border-white bg-[#111111] px-4 text-base font-semibold uppercase tracking-[0.08em] text-white outline-none focus:border-[#7C3AED]"
            value={service}
            onChange={(event) => setService(event.target.value)}
          >
            <option value="all">All</option>
            {CREATOR_SEARCH_SERVICES.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="neo-label">Sort</span>
          <select
            className="h-14 border-2 border-white bg-[#111111] px-4 text-base font-semibold uppercase tracking-[0.08em] text-white outline-none focus:border-[#7C3AED]"
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
