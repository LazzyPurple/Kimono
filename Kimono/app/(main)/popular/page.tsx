import type { Metadata } from "next";
import Link from "next/link";

import MediaCard from "@/components/MediaCard";
import { withDbConnection } from "@/lib/db/index";
import {
  buildPopularHref,
  getPopularFeed,
  mapPopularRowToCard,
  parsePopularParams,
  type PopularPeriod,
  type PopularSiteFilter,
} from "@/lib/popular/popular-feed";

export const metadata: Metadata = {
  title: "Popular | Kimono",
};

interface PopularPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const SITE_OPTIONS: Array<{ value: PopularSiteFilter; label: string }> = [
  { value: "both", label: "Both" },
  { value: "kemono", label: "Kemono" },
  { value: "coomer", label: "Coomer" },
];

const PERIOD_OPTIONS: Array<{ value: PopularPeriod; label: string }> = [
  { value: "recent", label: "Recent" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

function FilterTabs<T extends string>({
  label,
  current,
  options,
  buildHref,
}: {
  label: string;
  current: T;
  options: Array<{ value: T; label: string }>;
  buildHref: (value: T) => string;
}) {
  return (
    <div className="space-y-3">
      <p className="neo-label">{label}</p>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <Link
            key={option.value}
            className={option.value === current ? "neo-button" : "border-2 border-white bg-[#111111] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#888888] transition-colors hover:text-white"}
            href={buildHref(option.value)}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function PopularPage({ searchParams }: PopularPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const params = parsePopularParams(resolvedSearchParams);
  const result = await withDbConnection((conn) => getPopularFeed(conn, params));
  const cards = result.rows.map(mapPopularRowToCard);

  return (
    <section className="neo-wrap py-10 sm:py-14">
      <div className="mb-8 neo-panel p-6 sm:p-8">
        <p className="neo-label mb-4">Popular</p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="neo-heading mb-3">Hot posts window</h1>
            <p className="max-w-3xl text-base leading-7 text-[#888888]">
              Flux DB-first des posts populaires, alimente uniquement depuis PostgreSQL et rendu
              avec des thumbnails CDN et des videos en preload="none".
            </p>
          </div>
          <div className="border-2 border-white bg-[#111111] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white">
            Page {params.page}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="neo-panel p-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <FilterTabs
              label="Site"
              current={params.site}
              options={SITE_OPTIONS}
              buildHref={(value) => buildPopularHref({ ...params, site: value, page: 1 })}
            />
            <FilterTabs
              label="Period"
              current={params.period}
              options={PERIOD_OPTIONS}
              buildHref={(value) => buildPopularHref({ ...params, period: value, page: 1 })}
            />
          </div>
        </div>

        <div className="neo-panel p-6">
          <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="neo-label mb-2">Ranking</p>
              <p className="text-sm text-[#888888]">
                {cards.length === 0
                  ? "No cached popular posts for this slice yet."
                  : `${cards.length} posts loaded from PostgreSQL`}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className={params.page <= 1 ? "border-2 border-white/20 bg-[#111111] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#555555]" : "neo-button"}
                href={buildPopularHref({ ...params, page: Math.max(1, params.page - 1) })}
                aria-disabled={params.page <= 1}
              >
                Previous
              </Link>
              <Link
                className={result.hasMore ? "neo-button" : "border-2 border-white/20 bg-[#111111] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#555555]"}
                href={buildPopularHref({ ...params, page: params.page + 1 })}
                aria-disabled={!result.hasMore}
              >
                Next
              </Link>
            </div>
          </div>

          {cards.length === 0 ? (
            <div className="border-2 border-dashed border-white/30 bg-[#111111] px-6 py-16 text-center">
              <p className="text-2xl font-black uppercase tracking-[0.18em] text-white">Popular cache empty</p>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[#888888]">
                Run the popular sync from admin actions if you want to prefill this feed before the
                UI layer starts requesting more slices.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {cards.map((post) => (
                <MediaCard
                  key={`${post.site}-${post.service}-${post.creatorId}-${post.id}`}
                  title={post.title}
                  previewImageUrl={post.previewImageUrl ?? undefined}
                  videoUrl={post.videoUrl ?? undefined}
                  type={post.videoUrl ? "video" : "image"}
                  site={post.site}
                  service={post.service}
                  postId={post.id}
                  user={post.creatorId}
                  publishedAt={post.publishedAt ?? undefined}
                  durationSeconds={post.durationSeconds}
                  mediaMimeType={post.mediaMimeType}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
