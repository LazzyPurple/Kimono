"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Download,
  Loader2,
  Heart,
  User,
} from "lucide-react";
import type { UnifiedPost, Site } from "@/lib/api/unified";
import type { Creator } from "@/lib/api/kemono";
import { proxyCdnUrl, getVideoThumbnailUrl } from "@/lib/api/unified";
import VideoPlayer from "@/components/VideoPlayer";
import Lightbox from "@/components/Lightbox";
import { useLikes } from "@/contexts/LikesContext";

function isImage(p: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(p);
}
function isVideo(p: string): boolean {
  return /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(p);
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

  const baseUrl =
    site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
  const avatarProxyUrl = proxyCdnUrl(site, `/icons/${service}/${user}`);

  useEffect(() => {
    if (!isValid) return;

    async function fetchPost() {
      setLoading(true);
      setError(null);
      try {
        const [postRes, profileRes] = await Promise.allSettled([
          fetch(
            `/api/post?site=${site}&service=${service}&user=${user}&id=${id}`
          ),
          fetch(
            `/api/creator-profile?site=${site}&service=${service}&id=${user}`
          ),
        ]);

        if (
          postRes.status === "fulfilled" &&
          postRes.value.ok
        ) {
          const raw = await postRes.value.json();
          const postData = raw?.post ?? raw;
          setPost({ ...postData, site });
        } else {
          throw new Error("Erreur lors du chargement du post");
        }

        if (
          profileRes.status === "fulfilled" &&
          profileRes.value.ok
        ) {
          const profileData = await profileRes.value.json();
          setCreatorProfile(profileData);
        }
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Erreur inconnue"
        );
      } finally {
        setLoading(false);
      }
    }

    fetchPost();
  }, [site, service, user, id, isValid]);

  const creatorName = creatorProfile?.name || post?.user;

  useEffect(() => {
    if (post?.title) {
      document.title = `${creatorName ? creatorName + ' - ' : ''}${post.title}`;
    } else if (post) {
      document.title = `${creatorName ? creatorName + ' - ' : ''}Sans titre`;
    }
    return () => {
      document.title = 'Kimono';
    };
  }, [post, creatorName]);

  if (!isValid) {
    return (
      <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center space-y-2">
        <p className="text-red-400 text-lg font-medium">Paramètres invalides</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#7c3aed]" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center space-y-2">
        <p className="text-red-400 text-lg font-medium">Erreur</p>
        <p className="text-[#6b7280] text-sm">
          {error || "Post introuvable."}
        </p>
        <Button
          onClick={() => router.back()}
          variant="outline"
          className="mt-4 border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5] cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
      </div>
    );
  }

  const liked = isPostLiked(site, service, id);

  /* Build media list */
  const allMedia = [
    ...(post.file?.path ? [post.file] : []),
    ...(post.attachments || []),
  ].filter(Boolean);

  const makeUrl = (filePath: string) =>
    `${baseUrl}/data${filePath
      .split("/")
      .map((s: string) => encodeURIComponent(s))
      .join("/")}`;

  const videos = allMedia.filter(
    (m) => isVideo(m.name || m.path) || isVideo(m.path)
  );
  const images = allMedia.filter(
    (m) => isImage(m.name || m.path) || isImage(m.path)
  );
  const others = allMedia.filter((m) => {
    const n = m.name || m.path;
    return !isImage(n) && !isVideo(n) && !isImage(m.path) && !isVideo(m.path);
  });

  const imageUrls = images.map((m) => ({
    src: makeUrl(m.path),
    alt: m.name || m.path,
  }));

  /* Parse description: detect hashtags */
  function renderDescription(content: string) {
    const hasHtml = /<[a-z]/i.test(content);

    if (hasHtml) {
      return (
        <div
          className="text-[#f0f0f5] text-sm whitespace-pre-wrap prose prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      );
    }

    // Parse hashtags
    const parts = content.split(/(#[\w]+)/g);
    return (
      <div className="text-[#f0f0f5] text-sm whitespace-pre-wrap">
        {parts.map((part, i) =>
          /^#[\w]+$/.test(part) ? (
            <span
              key={i}
              className="inline-block bg-[#7c3aed]/20 text-[#7c3aed] rounded-full px-2 py-0.5 text-xs cursor-pointer mx-0.5"
            >
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </div>
    );
  }

  const displayName = creatorProfile?.name ?? `Créateur`;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back button */}
      <Button
        onClick={() => router.back()}
        variant="outline"
        className="border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5] cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Retour
      </Button>

      {/* ── 1. Header ──────────────────────────────────────── */}
      <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-6 space-y-4">
        {/* Creator info line */}
        <div className="flex items-center gap-3">
          <a
            href={`/creator/${site}/${service}/${user}`}
            className="shrink-0"
          >
            <div className="h-10 w-10 rounded-full overflow-hidden bg-[#7c3aed]/20 flex items-center justify-center">
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
            className="text-sm font-medium text-[#f0f0f5] hover:text-[#7c3aed] transition-colors"
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
          <Badge
            variant="outline"
            className="border-[#1e1e2e] text-[#6b7280]"
          >
            {service}
          </Badge>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-[#f0f0f5]">
          {post.title || "Sans titre"}
        </h1>

        {/* Date + Like */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#6b7280] text-sm">
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
            onClick={() => togglePostLike(site, service, id)}
            className="flex items-center gap-1.5 text-sm transition-colors cursor-pointer"
          >
            <Heart
              className={`h-5 w-5 transition-colors ${
                liked
                  ? "text-red-500 fill-red-500"
                  : "text-[#6b7280] hover:text-red-400"
              }`}
            />
            <span className={liked ? "text-red-500" : "text-[#6b7280]"}>
              {liked ? "Liké" : "Liker"}
            </span>
          </button>
        </div>
      </div>

      {/* ── 2. Videos ──────────────────────────────────────── */}
      {videos.length > 0 && (
        <div className="flex flex-col gap-4">
          {videos.map((item, index) => (
            <VideoPlayer
              key={`vid-${index}`}
              src={makeUrl(item.path)}
              poster={getVideoThumbnailUrl(site, item.path)}
              filename={item.name || item.path}
              className="w-full"
            />
          ))}
        </div>
      )}

      {/* ── 3. Description ─────────────────────────────────── */}
      {post.content && (
        <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-6">
          {renderDescription(post.content)}
        </div>
      )}

      {/* ── 4. Photo gallery ───────────────────────────────── */}
      {images.length > 0 && (
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {images.map((item, index) => (
              <button
                key={`img-${index}`}
                onClick={() => setLightboxIndex(index)}
                className="aspect-square overflow-hidden rounded-lg cursor-pointer hover:opacity-90 transition"
              >
                <img
                  src={makeUrl(item.path)}
                  alt={item.name || item.path}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          images={imageUrls}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}

      {/* ── 5. Download links ──────────────────────────────── */}
      {others.length > 0 && (
        <div className="flex flex-col gap-3">
          {others.map((item, index) => (
            <a
              key={`dl-${index}`}
              href={makeUrl(item.path)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg bg-[#12121a] border border-[#1e1e2e] p-4 text-[#f0f0f5] hover:border-[#7c3aed]/50 transition-colors"
            >
              <Download className="h-5 w-5 text-[#7c3aed] shrink-0" />
              <span className="truncate text-sm">
                {item.name || item.path}
              </span>
            </a>
          ))}
        </div>
      )}

      {/* ── 6. Footer ──────────────────────────────────────── */}
      <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-4">
        <a
          href={`${baseUrl}/${service}/user/${user}/post/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-[#7c3aed] hover:text-[#6d28d9] transition-colors text-sm"
        >
          <ExternalLink className="h-4 w-4" />
          Voir le post original sur {site}
        </a>
      </div>
    </div>
  );
}
