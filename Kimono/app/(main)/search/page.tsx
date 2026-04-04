import type { Metadata } from "next";
import Link from "next/link";

import CreatorCard from "@/components/CreatorCard";
import SearchControls from "@/components/main/SearchControls";
import { db, withDbConnection } from "@/lib/db/index";
import {
  buildSearchHref,
  mapCreatorRowToSearchCard,
  parseCreatorSearchParams,
  SEARCH_PAGE_SIZE,
  toSearchCreatorsOpts,
} from "@/lib/search/creator-search";

export const metadata: Metadata = {
  title: "Search | Kimono",
};

interface SearchPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function PaginationLink({
  href,
  label,
  disabled,
}: {
  href: string;
  label: string;
  disabled: boolean;
}) {
  if (disabled) {
    return (
      <span className="border-2 border-white/20 bg-[#111111] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#555555]">
        {label}
      </span>
    );
  }

  return (
    <Link className="neo-button" href={href}>
      {label}
    </Link>
  );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const parsed = parseCreatorSearchParams(resolvedSearchParams);
  const result = await withDbConnection((conn) => db.searchCreators(conn, toSearchCreatorsOpts(parsed)));
  const cards = result.rows.map(mapCreatorRowToSearchCard);
  const totalPages = Math.max(1, Math.ceil(result.total / SEARCH_PAGE_SIZE));
  const startIndex = result.total === 0 ? 0 : (parsed.page - 1) * SEARCH_PAGE_SIZE + 1;
  const endIndex = Math.min(result.total, parsed.page * SEARCH_PAGE_SIZE);

  return (
    <section className="neo-wrap py-10 sm:py-14">
      <div className="mb-8 neo-panel p-6 sm:p-8">
        <p className="neo-label mb-4">Search</p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="neo-heading mb-3">Creator directory</h1>
            <p className="max-w-3xl text-base leading-7 text-[#888888]">
              Recherche locale PostgreSQL server-first. Aucun appel upstream n&apos;est necessaire pour
              explorer le catalogue normalise.
            </p>
          </div>
          <div className="border-2 border-white bg-[#111111] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white">
            {result.total.toLocaleString("fr-FR")} creators indexed
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <SearchControls initialParams={parsed} />

        <div className="neo-panel p-6">
          <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="neo-label mb-2">Results</p>
              <p className="text-sm text-[#888888]">
                {result.total === 0
                  ? "No creators match this search."
                  : `Showing ${startIndex}-${endIndex} of ${result.total.toLocaleString("fr-FR")} creators`}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <PaginationLink
                href={buildSearchHref({ ...parsed, page: Math.max(1, parsed.page - 1) })}
                label="Previous"
                disabled={parsed.page <= 1}
              />
              <span className="border-2 border-white bg-[#111111] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white">
                Page {parsed.page} / {totalPages}
              </span>
              <PaginationLink
                href={buildSearchHref({ ...parsed, page: parsed.page + 1 })}
                label="Next"
                disabled={parsed.page >= totalPages}
              />
            </div>
          </div>

          {cards.length === 0 ? (
            <div className="border-2 border-dashed border-white/30 bg-[#111111] px-6 py-16 text-center">
              <p className="text-2xl font-black uppercase tracking-[0.18em] text-white">No results</p>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[#888888]">
                Change the query, switch the site, or clear the service filter to widen the local
                PostgreSQL search.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {cards.map((creator) => (
                <CreatorCard
                  key={`${creator.site}-${creator.service}-${creator.id}`}
                  id={creator.id}
                  name={creator.name}
                  service={creator.service}
                  site={creator.site}
                  favorited={creator.favorited}
                  updated={creator.updated ?? undefined}
                  postCount={creator.postCount}
                  profileImageUrl={creator.profileImageUrl}
                  bannerImageUrl={creator.bannerImageUrl}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
