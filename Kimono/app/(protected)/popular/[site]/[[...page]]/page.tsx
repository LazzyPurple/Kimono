"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Flame, Loader2 } from "lucide-react";
import MediaCard from "@/components/MediaCard";
import Pagination from "@/components/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchJsonWithBrowserCache } from "@/lib/browser-data-cache";
import { buildPopularCacheKey, type PopularPeriod } from "@/lib/perf-cache";
import type { UnifiedPost } from "@/lib/api/helpers";
import { resolvePostMedia } from "@/lib/api/helpers";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

interface PopularInfo {
  date: string;
  min_date: string;
  max_date: string;
  range_desc: string;
  scale: "recent" | "day" | "week" | "month";
  navigation_dates: {
    day: [string, string, string];
    week: [string, string, string];
    month: [string, string, string];
  };
}

interface PopularProps {
  today: string;
  earliest_date_for_popular: string;
  count: number;
}

interface PopularResponse {
  info: PopularInfo | null;
  props: PopularProps | null;
  posts: UnifiedPost[];
  source?: string;
}

type SiteType = "kemono" | "coomer";

const POPULAR_BROWSER_CACHE_TTL_MS = 10 * 60 * 1000;

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-xl border border-[#1e1e2e] bg-[#12121a] animate-pulse">
          <div className="aspect-video bg-[#1e1e2e]" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-full rounded bg-[#1e1e2e]" />
            <div className="h-3 w-2/3 rounded bg-[#1e1e2e]" />
            <div className="h-2.5 w-1/3 rounded bg-[#1e1e2e]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PopularPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const site = params.site as SiteType;
  const pageParam = params.page as string[] | undefined;
  const pageNumber = pageParam && pageParam.length > 0 ? parseInt(pageParam[0], 10) : 1;
  const offset = (pageNumber - 1) * 50;

  const urlPeriod = searchParams.get("period") as PopularPeriod | null;
  const period = urlPeriod || "recent";
  const date = searchParams.get("date");

  const [data, setData] = useState<PopularResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      setLoading(true);

      try {
        const data = await fetchJsonWithBrowserCache<PopularResponse>({
          key: buildPopularCacheKey({ site, period, date, offset }),
          ttlMs: POPULAR_BROWSER_CACHE_TTL_MS,
          loader: async () => {
            const params = new URLSearchParams({
              site,
              period,
            });
            if (date) {
              params.set("date", date);
            }
            if (offset > 0) {
              params.set("offset", String(offset));
            }

            const response = await fetch(`/api/popular-posts?${params.toString()}`);
            if (!response.ok) {
              throw new Error("API responded with an error");
            }

            return response.json();
          },
        });

        if (active) {
          setData(data);
        }
      } catch (error) {
        console.error("Failed to fetch popular posts:", error);
        if (active) {
          setData({ info: null, props: null, posts: [] });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void fetchData();

    return () => {
      active = false;
    };
  }, [site, period, date, offset]);

  useScrollRestoration(`popular-${site}-${pageNumber}-${period}-${date ?? "recent"}`, !loading);

  const handlePageChange = (newPage: number) => {
    let url = `/popular/${site}/${newPage}`;
    const params = new URLSearchParams();

    if (period !== "recent") {
      params.set("period", period);
      if (date) {
        params.set("date", date);
      }
    }

    const query = params.toString();
    if (query) {
      url += `?${query}`;
    }

    router.push(url);
  };

  const handlePeriodChange = (nextPeriod: PopularPeriod) => {
    let url = `/popular/${site}/1`;
    if (nextPeriod !== "recent") {
      url += `?period=${nextPeriod}`;
    }
    router.replace(url);
  };

  const handleDateChange = (nextDate: string) => {
    router.push(`/popular/${site}/1?period=${period}&date=${nextDate}`);
  };

  const totalCount = data?.props?.count || 0;
  const apiCountTotal = Math.ceil(totalCount / 50);
  const hasFullPage = Boolean(data?.posts && data.posts.length >= 50);
  const estimatedTotal = Math.max(apiCountTotal, pageNumber + (hasFullPage ? 1 : 0));
  const navigationDates = period !== "recent" ? data?.info?.navigation_dates?.[period] : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Flame className="h-6 w-6 text-[#f0f0f5]" />
          <h1 className="text-2xl font-bold text-[#f0f0f5]">
            Posts populaires {site === "kemono" ? "Kemono" : "Coomer"}
          </h1>
        </div>
        <p className="text-sm text-[#6b7280]">
          {data?.info?.range_desc || `Les posts les plus populaires de ${site === "kemono" ? "Kemono" : "Coomer"}.`}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Link href="/popular/kemono/1">
            <Badge
              variant="outline"
              className={`cursor-pointer px-3 py-1 text-sm transition-colors ${
                site === "kemono"
                  ? "border-[#7c3aed]/30 bg-[#7c3aed]/20 text-[#a78bfa]"
                  : "border-[#1e1e2e] bg-transparent text-[#6b7280] hover:border-[#7c3aed]/30"
              }`}
            >
              Kemono
            </Badge>
          </Link>
          <Link href="/popular/coomer/1">
            <Badge
              variant="outline"
              className={`cursor-pointer px-3 py-1 text-sm transition-colors ${
                site === "coomer"
                  ? "border-pink-500/30 bg-pink-500/20 text-pink-400"
                  : "border-[#1e1e2e] bg-transparent text-[#6b7280] hover:border-pink-500/30"
              }`}
            >
              Coomer
            </Badge>
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["recent", "day", "week", "month"] as PopularPeriod[]).map((currentPeriod) => {
            const labels: Record<PopularPeriod, string> = {
              recent: "Recents",
              day: "Jour",
              week: "Semaine",
              month: "Mois",
            };
            const isActive = period === currentPeriod;

            return (
              <Button
                key={currentPeriod}
                variant={isActive ? "default" : "outline"}
                className={`cursor-pointer transition-colors ${
                  isActive
                    ? site === "kemono"
                      ? "border-transparent bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                      : "border-transparent bg-pink-600 text-white hover:bg-pink-700"
                    : "border-[#1e1e2e] bg-transparent text-[#6b7280] hover:bg-[#1e1e2e]/50 hover:text-[#f0f0f5]"
                }`}
                onClick={() => handlePeriodChange(currentPeriod)}
              >
                {labels[currentPeriod]}
              </Button>
            );
          })}
        </div>
      </div>

      {navigationDates && data?.info && data?.props && (
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer border-[#1e1e2e] bg-transparent text-[#6b7280] hover:bg-[#1e1e2e]/50 hover:text-[#f0f0f5]"
            disabled={
              !navigationDates[0] ||
              (data.props.earliest_date_for_popular
                ? navigationDates[0] < data.props.earliest_date_for_popular
                : false)
            }
            onClick={() => handleDateChange(navigationDates[0])}
          >
            &larr; Precedent
          </Button>

          <span className="text-sm font-medium text-[#f0f0f5]">{data.info.date}</span>

          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer border-[#1e1e2e] bg-transparent text-[#6b7280] hover:bg-[#1e1e2e]/50 hover:text-[#f0f0f5]"
            disabled={
              !navigationDates[1] ||
              (data.props.today ? navigationDates[1] > data.props.today : false)
            }
            onClick={() => handleDateChange(navigationDates[1])}
          >
            Suivant &rarr;
          </Button>
        </div>
      )}

      {loading ? (
        <SkeletonGrid />
      ) : !data?.posts || data.posts.length === 0 ? (
        <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-12 text-center">
          <p className="text-[#6b7280]">Aucun post populaire.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {data.posts.map((post) => {
              const media = resolvePostMedia(post);

              return (
                <MediaCard
                  key={`${post.site}-${post.service}-${post.id}`}
                  title={post.title}
                  previewImageUrl={media.previewImageUrl}
                  videoUrl={media.videoUrl}
                  type={media.type}
                  site={post.site}
                  service={post.service}
                  postId={post.id}
                  user={post.user}
                  publishedAt={post.published}
                  videoPreviewMode="viewport"
                />
              );
            })}
          </div>

          <div className="flex justify-center pt-2">
            <Pagination current={pageNumber} total={estimatedTotal} onChange={handlePageChange} />
          </div>
        </>
      )}
    </div>
  );
}

export default function PopularPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" />
        </div>
      }
    >
      <PopularPageContent />
    </Suspense>
  );
}
