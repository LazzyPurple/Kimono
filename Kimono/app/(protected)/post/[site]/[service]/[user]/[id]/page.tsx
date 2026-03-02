"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, ExternalLink, Download, Loader2 } from "lucide-react";
import type { UnifiedPost, Site } from "@/lib/api/unified";

function isImage(p: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(p);
}
function isVideo(p: string): boolean {
  return /\.(mp4|webm|mov|avi)$/i.test(p);
}

export default function PostPage() {
  const params = useParams<{ site: string; service: string; user: string; id: string }>();
  const router = useRouter();

  const site = params.site as Site;
  const service = params.service;
  const user = params.user;
  const id = params.id;

  const isValidSite = site === "kemono" || site === "coomer";
  const isValid = isValidSite && service && user && id;

  const [post, setPost] = useState<UnifiedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = site === "kemono" ? "https://kemono.cr" : "https://coomer.st";

  useEffect(() => {
    if (!isValid) return;

    async function fetchPost() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/post?site=${site}&service=${service}&user=${user}&id=${id}`
        );
        if (!res.ok) throw new Error("Erreur lors du chargement du post");
        const data = await res.json();
        setPost({ ...data, site });
      } catch (err: any) {
        setError(err.message || "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    }

    fetchPost();
  }, [site, service, user, id, isValid]);

  if (!isValid) {
    return (
      <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-12 text-center space-y-2">
        <p className="text-red-400 text-lg font-medium">Paramètres invalides</p>
        <p className="text-[#6b7280] text-sm">
          Le site doit être « kemono » ou « coomer », et les autres paramètres ne peuvent pas être vides.
        </p>
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
        <p className="text-[#6b7280] text-sm">{error || "Post introuvable."}</p>
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

  // Build all media list
  const allMedia = [
    ...(post.file?.path ? [post.file] : []),
    ...(post.attachments || []),
  ].filter(Boolean);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-4">
        <Button
          onClick={() => router.back()}
          variant="outline"
          className="border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5] cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>

        <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-6 space-y-3">
          <div className="flex items-center gap-2">
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

          <h1 className="text-2xl font-bold text-[#f0f0f5]">
            {post.title || "Sans titre"}
          </h1>

          {post.published && (
            <div className="flex items-center gap-2 text-[#6b7280] text-sm">
              <Calendar className="h-4 w-4" />
              <span>{new Date(post.published).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}</span>
            </div>
          )}
        </div>
      </div>

      {/* Galerie multi-média */}
      {allMedia.length > 0 && (
        <div className="flex flex-col gap-6">
          {allMedia.map((item, index) => {
            const filePath = item.path;
            const fileName = item.name || filePath;
            const mediaUrl = encodeURI(`${baseUrl}/data${filePath}`);

            if (isImage(fileName) || isImage(filePath)) {
              return (
                <img
                  key={index}
                  src={mediaUrl}
                  alt={fileName}
                  referrerPolicy="no-referrer"
                  className="max-w-full object-contain rounded-lg"
                />
              );
            }

            if (isVideo(fileName) || isVideo(filePath)) {
              return (
                <video
                  key={index}
                  controls
                  className="w-full rounded-lg"
                >
                  <source src={mediaUrl} />
                </video>
              );
            }

            // Autre fichier → lien téléchargement
            return (
              <a
                key={index}
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg bg-[#12121a] border border-[#1e1e2e] p-4 text-[#f0f0f5] hover:border-[#7c3aed]/50 transition-colors"
              >
                <Download className="h-5 w-5 text-[#7c3aed] shrink-0" />
                <span className="truncate text-sm">{fileName}</span>
              </a>
            );
          })}
        </div>
      )}

      {/* Description */}
      {post.content && (
        <div className="rounded-xl bg-[#12121a] border border-[#1e1e2e] p-6">
          <div
            className="text-[#f0f0f5] text-sm whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </div>
      )}

      {/* Footer */}
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
