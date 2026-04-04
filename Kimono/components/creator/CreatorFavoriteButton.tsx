"use client";

import { Heart } from "lucide-react";

import type { Site } from "@/lib/api/helpers";
import { useLikes } from "@/contexts/LikesContext";

interface CreatorFavoriteButtonProps {
  site: Site;
  service: string;
  creatorId: string;
}

export default function CreatorFavoriteButton({
  site,
  service,
  creatorId,
}: CreatorFavoriteButtonProps) {
  const { isCreatorLiked, toggleCreatorLike } = useLikes();
  const liked = isCreatorLiked(site, service, creatorId);

  return (
    <button
      type="button"
      className={liked ? "neo-button bg-[#7C3AED] text-white" : "neo-button bg-[#111111] text-white"}
      onClick={() => {
        void toggleCreatorLike(site, service, creatorId);
      }}
    >
      <Heart className={liked ? "h-4 w-4 fill-current" : "h-4 w-4"} />
      {liked ? "Liked" : "Favorite"}
    </button>
  );
}
