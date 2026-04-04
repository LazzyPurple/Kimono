import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Heart, Layers3 } from "lucide-react";

import MediaCard from "@/components/MediaCard";
import CreatorFavoriteButton from "@/components/creator/CreatorFavoriteButton";
import {
  buildCreatorHref,
  getCreatorPageData,
  parseCreatorPageParams,
} from "@/lib/creators/creator-page";
import { getCreatorBannerUrl, getCreatorIconUrl, getThumbnailUrl } from "@/lib/media-platform";

export const metadata: Metadata = {
  title: "Creator | Kimono",
};

interface CreatorPageProps {
  params: Promise<{
    site: string;
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CreatorPage({ params, searchParams }: CreatorPageProps) {
  const route = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const parsed = parseCreatorPageParams(resolvedSearchParams);
  const data = await getCreatorPageData({
    site: route.site,
    creatorId: route.id,
    page: parsed.page,
  });

  if (!data) {
    notFound();
  }

  const avatarUrl =
    getThumbnailUrl(data.creator.site, data.creator.profileImageUrl) ??
    getCreatorIconUrl(data.creator.site, data.creator.service, data.creator.id);
  const bannerUrl =
    getThumbnailUrl(data.creator.site, data.creator.bannerImageUrl) ??
    getCreatorBannerUrl(data.creator.site, data.creator.service, data.creator.id);

  return (
    <section className="neo-wrap py-10 sm:py-14">
      <div className="mb-8 flex flex-wrap gap-3">
        <Link className="neo-button bg-[#111111] text-white" href="/search">
          <ArrowLeft className="h-4 w-4" />
          Back to search
        </Link>
        <div className="border-2 border-white bg-[#111111] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white">
          Source {data.source}
        </div>
      </div>

      <div className="mb-8 neo-panel overflow-hidden p-0">
        <div className="relative h-48 border-b-2 border-white bg-[#111111] sm:h-64">
          <img
            src={bannerUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-[#11111166] to-transparent" />
        </div>

        <div className="relative p-6 sm:p-8">
          <div className="-mt-20 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-end gap-5">
              <div className="h-24 w-24 overflow-hidden border-2 border-white bg-[#0A0A0A] sm:h-28 sm:w-28">
                <img
                  src={avatarUrl}
                  alt={data.creator.name}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="space-y-3">
                <p className="neo-label">{data.creator.site}</p>
                <h1 className="neo-heading">{data.creator.name}</h1>
                <div className="flex flex-wrap gap-3 text-xs font-black uppercase tracking-[0.18em] text-white">
                  <span className="border-2 border-white bg-[#111111] px-3 py-2">{data.creator.service}</span>
                  <span className="border-2 border-white bg-[#111111] px-3 py-2">
                    {data.creator.postCount.toLocaleString("fr-FR")} posts
                  </span>
                  <span className="inline-flex items-center gap-2 border-2 border-white bg-[#111111] px-3 py-2">
                    <Heart className="h-3.5 w-3.5" />
                    {data.creator.favorited.toLocaleString("fr-FR")} likes
                  </span>
                </div>
              </div>
            </div>

            <CreatorFavoriteButton
              site={data.creator.site}
              service={data.creator.service}
              creatorId={data.creator.id}
            />
          </div>
        </div>
      </div>

      <div className="neo-panel p-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="neo-label mb-2">Creator feed</p>
            <p className="text-sm text-[#888888]">
              {data.posts.length === 0
                ? "No cached posts yet for this creator."
                : `${data.posts.length} posts loaded for page ${data.page}`}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              className={data.page <= 1 ? "border-2 border-white/20 bg-[#111111] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#555555]" : "neo-button"}
              href={buildCreatorHref({
                site: data.creator.site,
                creatorId: data.creator.id,
                page: Math.max(1, data.page - 1),
              })}
              aria-disabled={data.page <= 1}
            >
              Previous
            </Link>
            <div className="inline-flex items-center gap-2 border-2 border-white bg-[#111111] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white">
              <Layers3 className="h-4 w-4" />
              Page {data.page}
            </div>
            <Link
              className={data.hasMore ? "neo-button" : "border-2 border-white/20 bg-[#111111] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#555555]"}
              href={buildCreatorHref({
                site: data.creator.site,
                creatorId: data.creator.id,
                page: data.page + 1,
              })}
              aria-disabled={!data.hasMore}
            >
              Next
            </Link>
          </div>
        </div>

        {data.posts.length === 0 ? (
          <div className="border-2 border-dashed border-white/30 bg-[#111111] px-6 py-16 text-center">
            <p className="text-2xl font-black uppercase tracking-[0.18em] text-white">No posts cached</p>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[#888888]">
              The first page will populate from upstream on demand if the creator exists there but
              the local PostgreSQL cache is still cold.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {data.posts.map((post) => (
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
    </section>
  );
}
