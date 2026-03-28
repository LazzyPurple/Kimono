import type { FavoriteCreatorListItem } from "./favorites-page-state";

export interface LikesPostListItem {
  id?: string;
  service?: string;
  user?: string;
  creatorId?: string;
}

export interface LikesPostsPayloadLike {
  items?: LikesPostListItem[];
  posts?: LikesPostListItem[];
  expired?: boolean;
  loggedIn?: boolean;
}

export interface LikesCreatorsPayloadLike {
  favorites?: FavoriteCreatorListItem[];
  creators?: FavoriteCreatorListItem[];
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
    && (Array.isArray((payload as LikesCreatorsPayloadLike).favorites) || Array.isArray((payload as LikesCreatorsPayloadLike).creators))
  ) {
    return (payload as LikesCreatorsPayloadLike).favorites ?? (payload as LikesCreatorsPayloadLike).creators ?? [];
  }

  return [];
}

export function extractPostLikeItems(payload: LikesPostsPayloadLike | unknown): LikesPostListItem[] {
  if (
    payload
    && typeof payload === "object"
    && (Array.isArray((payload as LikesPostsPayloadLike).items) || Array.isArray((payload as LikesPostsPayloadLike).posts))
  ) {
    return (payload as LikesPostsPayloadLike).items ?? (payload as LikesPostsPayloadLike).posts ?? [];
  }

  return [];
}
