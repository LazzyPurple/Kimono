"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  Download,
  ExternalLink,
  Heart,
  Loader2,
  User,
} from "lucide-react";
import VideoPlayer from "@/components/VideoPlayer";
import Lightbox from "@/components/Lightbox";
import { useLikes } from "@/contexts/LikesContext";
import { proxyCdnUrl, resolvePostMedia } from "@/lib/api/helpers";
import { fetchJsonWithBrowserCache } from "@/lib/browser-data-cache";
import {
  BROWSER_POST_CACHE_TTL_MS,
  buildCreatorProfileCacheKey,
  buildPostCacheKey,
} from "@/lib/perf-cache";
import type { UnifiedPost, Site } from "@/lib/api/helpers";
import type { Creator } from "@/lib/api/kemono";

function isImage(path: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(path);
}

function isVideo(path: string): boolean {
  return /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(path);
}

export default function PostPage() {
  const params = useParams<{
    site: string;
    service: string;
    user: string;
    id: string;
  }>();
  const router = useRouter();
  const { isPostLiked, togglePostLike } = useLikes();

  const site = params.site as Site;
  const service = params.service;
  const user = params.user;
  const id = params.id;

  const isValidSite = site === "kemono" || site === "coomer";
  const isValid = isValidSite && service && user && id;

  const [post, setPost] = useState<UnifiedPost | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<Creator | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const baseUrl = site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
  const avatarProxyUrl = proxyCdnUrl(site, `/icons/${service}/${user}`);

  useEffect(() => {
    if (!isValid) return;

    async function fetchPost() {
      setLoading(true);
      setError(null);

      try {
        const [postResponse, profileResponse] = await Promise.allSettled([
          fetchJsonWithBrowserCache<UnifiedPost>({
            key: `post-detail:${buildPostCacheKey({ site, service, creatorId: user, postId: id })}`,
            ttlMs: BROWSER_POST_CACHE_TTL_MS,
            loader: async () => {
              const response = await fetch(`/api/post?site=${site}&service=${service}&user=${user}&id=${id}`);
              if (!response.ok) {
                throw new Error("Erreur lors du chargement du post");
              }
              const raw = await response.json();
              return { ...(raw?.post ?? raw), site };
            },
          }),
          fetchJsonWithBrowserCache<Creator | null>({
            key: buildCreatorProfileCacheKey({ site, service, creatorId: user }),
            ttlMs: BROWSER_POST_CACHE_TTL_MS,
            loader: async () => {
              const response = await fetch(`/api/creator-profile?site=${site}&service=${service}&id=${user}`);
              return response.ok ? response.json() : null;
            },
          }),
        ]);

        if (postResponse.status === "fulfilled") {
          setPost(postResponse.value);
        } else {
          throw new Error("Erreur lors du chargement du post");
        }

        if (profileResponse.status === "fulfilled") {
          setCreatorProfile(profileResponse.value);
        }
      } catch (caughtError: unknown) {
        setError(caughtError instanceof Error ? caughtError.message : "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    }

    void fetchPost();
  }, [id, isValid, service, site, user]);

  const creatorName = creatorProfile?.name || post?.user;

  useEffect(() => {
    if (post?.title) {
      document.title = `${creatorName ? `${creatorName} - ` : ""}${post.title}`;
    } else if (post) {
      document.title = `${creatorName ? `${creatorName} - ` : ""}Sans titre`;
    }

    return () => {
      document.title = "Kimono";
    };
  }, [creatorName, post]);

  if (!isValid) {
    return (
      <div className="space-y-2 rounded-xl border border-[#1e1e2e] bg-[#12121a] p-12 text-center">
        <p className="text-lg font-medium text-red-400">Paramètres invalides</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="space-y-2 rounded-xl border border-[#1e1e2e] bg-[#12121a] p-12 text-center">
        <p className="text-lg font-medium text-red-400">Erreur</p>
        <p className="text-sm text-[#6b7280]">{error || "Post introuvable."}</p>
        <Button
          onClick={() => router.back()}
          variant="outline"
          className="mt-4 cursor-pointer border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour
        </Button>
      </div>
    );
  }

  const liked = isPostLiked(site, service, id);
  const postMedia = resolvePostMedia(post);

  const allMedia = [
    ...(post.file?.path ? [post.file] : []),
    ...(post.attachments || []),
  ].filter(Boolean);

  const makeUrl = (filePath: string) =>
    `${baseUrl}/data${filePath
      .split("/")
      .map((segment: string) => encodeURIComponent(segment))
      .join("/")}`;

  const videos = allMedia.filter((media) => isVideo(media.name || media.path) || isVideo(media.path));
  const images = allMedia.filter((media) => isImage(media.name || media.path) || isImage(media.path));
  const others = allMedia.filter((media) => {
    const name = media.name || media.path;
    return !isImage(name) && !isVideo(name) && !isImage(media.path) && !isVideo(media.path);
  });

  const imageUrls = images.map((media) => ({
    src: makeUrl(media.path),
    alt: media.name || media.path,
  }));

  function renderDescription(content: string) {
    const hasHtml = /<[a-z]/i.test(content);

    if (hasHtml) {
      return (
        <div
          className="prose prose-invert max-w-none whitespace-pre-wrap text-sm text-[#f0f0f5]"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      );
    }

    const parts = content.split(/(#[\w]+)/g);
    return (
      <div className="whitespace-pre-wrap text-sm text-[#f0f0f5]">
        {parts.map((part, index) =>
          /^#[\w]+$/.test(part) ? (
            <span
              key={index}
              className="mx-0.5 inline-block cursor-pointer rounded-full bg-[#7c3aed]/20 px-2 py-0.5 text-xs text-[#7c3aed]"
            >
              {part}
            </span>
          ) : (
            <span key={index}>{part}</span>
          )
        )}
      </div>
    );
  }

  const displayName = creatorProfile?.name ?? "Créateur";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button
        onClick={() => router.back()}
        variant="outline"
        className="cursor-pointer border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Retour
      </Button>

      <div className="space-y-4 rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6">
        <div className="flex items-center gap-3">
          <a href={`/creator/${site}/${service}/${user}`} className="shrink-0">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#7c3aed]/20">
              {!avatarError ? (
                <img
                  src={avatarProxyUrl}
                  alt={displayName}
                  onError={() => setAvatarError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-5 w-5 text-[#7c3aed]" />
              )}
            </div>
          </a>
          <a
            href={`/creator/${site}/${service}/${user}`}
            className="text-sm font-medium text-[#f0f0f5] transition-colors hover:text-[#7c3aed]"
          >
            {displayName}
          </a>
          <Badge
            className={
              site === "kemono"
                ? "bg-[#7c3aed]/20 text-[#7c3aed]"
                : "bg-pink-600/20 text-pink-400"
            }
          >
            {site}
          </Badge>
          <Badge variant="outline" className="border-[#1e1e2e] text-[#6b7280]">
            {service}
          </Badge>
        </div>

        <h1 className="text-2xl font-bold text-[#f0f0f5]">{post.title || "Sans titre"}</h1>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-[#6b7280]">
            {post.published && (
              <>
                <Calendar className="h-4 w-4" />
                <span>
                  {new Date(post.published).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </>
            )}
          </div>
          <button
            onClick={() => void togglePostLike(site, service, user, id)}
            className="flex cursor-pointer items-center gap-1.5 text-sm transition-colors"
          >
            <Heart
              className={`h-5 w-5 transition-colors ${
                liked ? "fill-red-500 text-red-500" : "text-[#6b7280] hover:text-red-400"
              }`}
            />
            <span className={liked ? "text-red-500" : "text-[#6b7280]"}>
              {liked ? "Liké" : "Liker"}
            </span>
          </button>
        </div>
      </div>

      {videos.length > 0 && (
        <div className="flex flex-col gap-4">
          {videos.map((media, index) => (
            <VideoPlayer
              key={`vid-${index}`}
              src={makeUrl(media.path)}
              poster={postMedia?.previewImageUrl}
              filename={media.name || media.path}
              className="w-full"
            />
          ))}
        </div>
      )}

      {post.content && (
        <div className="rounded-xl border border-[#1e1e2e] bg-[#12121a] p-6">
          {renderDescription(post.content)}
        </div>
      )}

      {images.length > 0 && (
        <div className="mx-auto max-w-4xl">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {images.map((media, index) => (
              <button
                key={`img-${index}`}
                onClick={() => setLightboxIndex(index)}
                className="aspect-square cursor-pointer overflow-hidden rounded-lg transition hover:opacity-90"
              >
                <img
                  src={makeUrl(media.path)}
                  alt={media.name || media.path}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          images={imageUrls}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}

      {others.length > 0 && (
        <div className="flex flex-col gap-3">
          {others.map((media, index) => (
            <a
              key={`dl-${index}`}
              href={makeUrl(media.path)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4 text-[#f0f0f5] transition-colors hover:border-[#7c3aed]/50"
            >
              <Download className="h-5 w-5 shrink-0 text-[#7c3aed]" />
              <span className="truncate text-sm">{media.name || media.path}</span>
            </a>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl border border-[#1e1e2e] bg-[#12121a] p-4">
        <a
          href={`${baseUrl}/${service}/user/${user}/post/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-[#7c3aed] transition-colors hover:text-[#6d28d9]"
        >
          <ExternalLink className="h-4 w-4" />
          Voir le post original sur {site}
        </a>

        <Button
          onClick={() => router.back()}
          variant="outline"
          size="sm"
          className="cursor-pointer border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour
        </Button>
      </div>
    </div>
  );
}