"use client";

import { useState, useEffect, Suspense } from "react";
import { Loader2, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import MediaCard from "@/components/MediaCard";
import Pagination from "@/components/Pagination";
import { 
  getPostThumbnail, 
  getPostType, 
  getPostVideoThumbnailUrl,
  UnifiedPost 
} from "@/lib/api/helpers";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

interface PopularResponse {
  info: {
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
  };
  props: {
    today: string;
    earliest_date_for_popular: string;
    count: number;
  };
  posts: UnifiedPost[];
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="rounded-xl bg-[#12121a] border border-[#1e1e2e] overflow-hidden animate-pulse">
          <div className="aspect-video bg-[#1e1e2e]" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-[#1e1e2e] rounded w-full" />
            <div className="h-3 bg-[#1e1e2e] rounded w-2/3" />
            <div className="h-2.5 bg-[#1e1e2e] rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

type SiteType = "kemono" | "coomer";
type PeriodType = "recent" | "day" | "week" | "month";

function PopularPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const site = params.site as SiteType;
  
  // page is an array for catch-all route e.g., ["2"]
  const pageParam = params.page as string[] | undefined;
  const pageNumber = pageParam && pageParam.length > 0 ? parseInt(pageParam[0], 10) : 1;
  const offset = (pageNumber - 1) * 50;

  const urlPeriod = searchParams.get("period") as PeriodType | null;
  const period = urlPeriod || "recent";
  const date = searchParams.get("date");
  
  const [data, setData] = useState<PopularResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        let url = `/api/popular-posts?site=${site}&period=${period}`;
        if (date) url += `&date=${date}`;
        if (offset > 0) url += `&offset=${offset}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("API responded with an error");
        
        const json: PopularResponse = await res.json();
        
        if (active) {
          if (json.posts) {
            json.posts = json.posts.map(p => ({ ...p, site }));
          }
          setData(json);
        }
      } catch (err) {
        console.error("Failed to fetch popular posts:", err);
        if (active) {
          setData({ info: null as any, props: null as any, posts: [] });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [site, period, date, offset]);

  useScrollRestoration(`popular-${site}-${pageNumber}-${period}`, !loading);

  const handlePageChange = (newPage: number) => {
    let url = `/popular/${site}/${newPage}`;
    const params = new URLSearchParams();
    if (period !== "recent") {
      params.set("period", period);
      if (date) params.set("date", date);
    }
    const q = params.toString();
    if (q) url += `?${q}`;
    
    router.push(url);
  };

  const handlePeriodChange = (p: PeriodType) => {
    let url = `/popular/${site}/1`;
    if (p !== "recent") {
      url += `?period=${p}`;
    }
    router.replace(url);
  };

  const handleDateChange = (newDate: string) => {
    router.push(`/popular/${site}/1?period=${period}&date=${newDate}`);
  };

  const apiCountTotal = Math.ceil((data?.props?.count || 0) / 50);
  const hasFullPage = data?.posts && data.posts.length >= 50;
  const estimatedTotal = Math.max(apiCountTotal, pageNumber + (hasFullPage ? 1 : 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Flame className="w-6 h-6 text-[#f0f0f5]" />
          <h1 className="text-2xl font-bold text-[#f0f0f5]">
            Posts Populaires {site === "kemono" ? "Kemono" : "Coomer"}
          </h1>
        </div>
        <p className="text-sm text-[#6b7280]">
          {data?.info?.range_desc || `Les posts les plus populaires de ${site === "kemono" ? "Kemono" : "Coomer"}.`}
        </p>
      </div>

      {/* Toggles and Controls */}
      <div className="flex flex-col gap-4">
        {/* Site Navigation Links */}
        <div className="flex items-center gap-2">
          <Link href="/popular/kemono/1">
            <Badge 
              variant="outline" 
              className={`cursor-pointer transition-colors px-3 py-1 text-sm ${
                site === "kemono" 
                  ? "bg-[#7c3aed]/20 text-[#a78bfa] border-[#7c3aed]/30" 
                  : "bg-transparent text-[#6b7280] border-[#1e1e2e] hover:border-[#7c3aed]/30"
              }`}
            >
              Kemono
            </Badge>
          </Link>
          <Link href="/popular/coomer/1">
            <Badge 
              variant="outline" 
              className={`cursor-pointer transition-colors px-3 py-1 text-sm ${
                site === "coomer" 
                  ? "bg-pink-500/20 text-pink-400 border-pink-500/30" 
                  : "bg-transparent text-[#6b7280] border-[#1e1e2e] hover:border-pink-500/30"
              }`}
            >
              Coomer
            </Badge>
          </Link>
        </div>

        {/* Period Toggle */}
        <div className="flex gap-2 flex-wrap">
          {(["recent", "day", "week", "month"] as PeriodType[]).map((p) => {
            const labels = {
              recent: "Récents",
              day: "Jour",
              week: "Semaine",
              month: "Mois"
            };
            const isActive = period === p;
            return (
              <Button
                key={p}
                variant={isActive ? "default" : "outline"}
                className={`cursor-pointer transition-colors ${
                  isActive 
                    ? site === "kemono" 
                      ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9] border-transparent"
                      : "bg-pink-600 text-white hover:bg-pink-700 border-transparent"
                    : "bg-transparent border-[#1e1e2e] text-[#6b7280] hover:text-[#f0f0f5] hover:bg-[#1e1e2e]/50"
                }`}
                onClick={() => handlePeriodChange(p)}
              >
                {labels[p]}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Date Navigation */}
      {period !== "recent" && data?.info?.navigation_dates?.[period] && (
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer bg-transparent border-[#1e1e2e] text-[#6b7280] hover:text-[#f0f0f5] hover:bg-[#1e1e2e]/50"
            disabled={!data.info.navigation_dates[period][0] || (data?.props?.earliest_date_for_popular ? data.info.navigation_dates[period][0] < data.props.earliest_date_for_popular : false)}
            onClick={() => handleDateChange(data.info.navigation_dates[period][0])}
          >
            &larr; Précédent
          </Button>

          <span className="text-sm font-medium text-[#f0f0f5]">
            {data.info.date}
          </span>

          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer bg-transparent border-[#1e1e2e] text-[#6b7280] hover:text-[#f0f0f5] hover:bg-[#1e1e2e]/50"
            disabled={!data.info.navigation_dates[period][1] || (data?.props?.today ? data.info.navigation_dates[period][1] > data.props.today : false)}
            onClick={() => handleDateChange(data.info.navigation_dates[period][1])}
          >
            Suivant &rarr;
          </Button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <SkeletonGrid />
      ) : !data?.posts || data.posts.length === 0 ? (
        <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center">
          <p className="text-[#6b7280]">Aucun post populaire.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {data.posts.map((post) => (
              <MediaCard
                key={`${post.site}-${post.service}-${post.id}`}
                title={post.title}
                thumbnailUrl={getPostThumbnail(post)}
                videoThumbnailUrl={getPostVideoThumbnailUrl(post)}
                type={getPostType(post)}
                site={post.site}
                service={post.service}
                postId={post.id}
                user={post.user}
                publishedAt={post.published}
              />
            ))}
          </div>

          <div className="flex justify-center pt-2">
            <Pagination
              current={pageNumber}
              total={estimatedTotal}
              onChange={handlePageChange}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function PopularPage() {
  return (
    <Suspense fallback={<div className="flex justify-center min-h-[50vh] items-center"><Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" /></div>}>
      <PopularPageContent />
    </Suspense>
  )
}
