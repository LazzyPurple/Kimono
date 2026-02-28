"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, ExternalLink, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Site } from "@/lib/api/unified";

interface DetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  content?: string;
  site?: Site;
  service?: string;
  publishedAt?: string;
  attachments?: Array<{ name: string; path: string }>;
  file?: { name: string; path: string };
}

export default function DetailPanel({
  open,
  onOpenChange,
  title,
  content,
  site,
  service,
  publishedAt,
  attachments = [],
  file,
}: DetailPanelProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#12121a] border-[#1e1e2e] text-[#f0f0f5] max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-xl text-[#f0f0f5] pr-8">
            {title || "Sans titre"}
          </DialogTitle>
          <div className="flex items-center gap-2 pt-2">
            {site && (
              <Badge
                className={
                  site === "kemono"
                    ? "bg-[#7c3aed]/20 text-[#7c3aed]"
                    : "bg-pink-600/20 text-pink-400"
                }
              >
                {site}
              </Badge>
            )}
            {service && (
              <Badge
                variant="outline"
                className="border-[#1e1e2e] text-[#6b7280]"
              >
                {service}
              </Badge>
            )}
            {publishedAt && (
              <div className="flex items-center gap-1 text-xs text-[#6b7280]">
                <Calendar className="h-3 w-3" />
                {new Date(publishedAt).toLocaleDateString("fr-FR")}
              </div>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh]">
          {/* Contenu du post */}
          {content && (
            <div
              className="prose prose-invert prose-sm max-w-none text-[#f0f0f5] mb-4"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          )}

          {/* Fichier principal */}
          {file && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-[#f0f0f5] mb-2">
                Fichier
              </h4>
              <Button
                variant="outline"
                size="sm"
                className="border-[#1e1e2e] text-[#f0f0f5] hover:bg-[#1e1e2e]"
              >
                <Download className="mr-2 h-3 w-3" />
                {file.name}
              </Button>
            </div>
          )}

          {/* Pièces jointes */}
          {attachments.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-[#f0f0f5] mb-2">
                Pièces jointes ({attachments.length})
              </h4>
              <div className="space-y-1">
                {attachments.map((att, i) => (
                  <Button
                    key={i}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-[#6b7280] hover:text-[#f0f0f5] hover:bg-[#1e1e2e]"
                  >
                    <ExternalLink className="mr-2 h-3 w-3" />
                    {att.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
