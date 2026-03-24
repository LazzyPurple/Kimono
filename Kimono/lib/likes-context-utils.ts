import type { FavoriteCreatorListItem } from "./favorites-page-state";

export interface LikesPostListItem {
  id?: string;
  service?: string;
  user?: string;
  creatorId?: string;
}

export interface LikesPostsPayloadLike {
  items?: LikesPostListItem[];
  expired?: boolean;
  loggedIn?: boolean;
}

export interface LikesCreatorsPayloadLike {
  favorites?: FavoriteCreatorListItem[];
  expired?: boolean;
  loggedIn?: boolean;
}

export function makeCreatorLikeKey(site: string, service: string, id: string): string {
  return `${site}-${service}-${id}`;
}

export function makePostLikeKey(site: string, service: string, creatorId: string, id: string): string {
  return `${site}-${service}-${creatorId}-${id}`;
}

export function extractCreatorLikeItems(payload: LikesCreatorsPayloadLike | unknown): FavoriteCreatorListItem[] {
  if (
    payload
    && typeof payload === "object"
    && Array.isArray((payload as LikesCreatorsPayloadLike).favorites)
  ) {
    return (payload as LikesCreatorsPayloadLike).favorites ?? [];
  }

  return [];
}

export function extractPostLikeItems(payload: LikesPostsPayloadLike | unknown): LikesPostListItem[] {
  if (
    payload
    && typeof payload === "object"
    && Array.isArray((payload as LikesPostsPayloadLike).items)
  ) {
    return (payload as LikesPostsPayloadLike).items ?? [];
  }

  return [];
}
