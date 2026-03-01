"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Download, ExternalLink, Calendar, FileText } from "lucide-react";
import type { UnifiedPost, Site } from "@/lib/api/unified";

interface DetailPanelProps {
  post: UnifiedPost | null;
  open: boolean;
  onClose: () => void;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function DetailPanel({ post, open, onClose }: DetailPanelProps) {
  if (!post) return null;

  const baseUrl =
    post.site === "kemono" ? "https://kemono.cr" : "https://coomer.st";
  const postUrl = `${baseUrl}/${post.service}/user/${post.user}/post/${post.id}`;

  const allAttachments = [
    ...(post.file?.path ? [{ name: post.file.name || "Fichier principal", path: post.file.path }] : []),
    ...(post.attachments || []),
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#12121a] border-[#1e1e2e] text-[#f0f0f5] max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              className={
                post.site === "kemono"
                  ? "bg-[#7c3aed]/20 text-[#7c3aed]"
                  : "bg-pink-600/20 text-pink-400"
              }
            >
              {post.site}
            </Badge>
            <Badge variant="outline" className="border-[#1e1e2e] text-[#6b7280]">
              {post.service}
            </Badge>
          </div>
          <DialogTitle className="text-[#f0f0f5] text-base leading-snug">
            {post.title || "Sans titre"}
          </DialogTitle>
          {post.published && (
            <div className="flex items-center gap-1.5 text-xs text-[#6b7280]">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              {formatDate(post.published)}
            </div>
          )}
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Description */}
          {post.content && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6b7280] flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Description
              </h3>
              <p className="text-sm text-[#c5c5d2] whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-[#1e1e2e]">
                {post.content}
              </p>
            </div>
          )}

          {/* Pièces jointes */}
          {allAttachments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6b7280] flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Pièces jointes ({allAttachments.length})
              </h3>
              <div className="space-y-1.5">
                {allAttachments.map((att, i) => {
                  const fileUrl = `${baseUrl}/data${att.path}`;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 rounded-lg bg-[#0a0a0f] border border-[#1e1e2e] px-3 py-2 text-xs"
                    >
                      <span className="text-[#c5c5d2] truncate flex-1">{att.name || `Fichier ${i + 1}`}</span>
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#7c3aed] hover:text-[#9d5aff] transition-colors flex items-center gap-1 shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Télécharger
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lien direct */}
          <div className="pt-1 border-t border-[#1e1e2e]">
            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-[#6b7280] hover:text-[#7c3aed] transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              Voir le post original sur {post.site}
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
