import type { Site, UnifiedCreator, UnifiedPost } from "./api/helpers.ts";

export type FavoriteChronologyKind = "creator" | "post";

export interface FavoriteChronologyRecord {
  kind: FavoriteChronologyKind;
  site: Site;
  service: string;
  creatorId: string;
  postId: string | null;
  favoritedAt: Date;
  favedSeq: number | null;
}

export type FavoriteOrderSource = "exact" | "retained" | "fallback";

export interface FavoriteCreatorListItem extends UnifiedCreator {
  favoriteAddedAt: string | null;
  favoriteDateKnown: boolean;
  favoriteOrderSource: FavoriteOrderSource;
  favoriteSourceIndex: number;
  snapshotUpdatedAt: string | null;
  stale: boolean;
  favedSeq: number | null;
}

export interface FavoritePostListItem extends UnifiedPost {
  creatorName: string | null;
  favoriteAddedAt: string | null;
  favoriteDateKnown: boolean;
  favoriteOrderSource: FavoriteOrderSource;
  favoriteSourceIndex: number;
  snapshotUpdatedAt: string | null;
  stale: boolean;
  favedSeq: number | null;
}

const SITE_ORDER: Record<Site, number> = {
  kemono: 0,
  coomer: 1,
};

const FAVORITE_ORDER_SOURCE_RANK: Record<FavoriteOrderSource, number> = {
  exact: 0,
  retained: 1,
  fallback: 2,
};

export function normalizeFavoritePostId(postId?: string | null): string {
  return postId?.trim() ?? "";
}

export function createFavoriteChronologyKey(input: {
  kind: FavoriteChronologyKind;
  site: Site;
  service: string;
  creatorId: string;
  postId?: string | null;
}): string {
  return [
    input.kind,
    input.site,
    input.service,
    input.creatorId,
    normalizeFavoritePostId(input.postId),
  ].join(":");
}

export function buildFavoriteChronologyMap(entries: FavoriteChronologyRecord[]): Map<string, FavoriteChronologyRecord> {
  return new Map(entries.map((entry) => [createFavoriteChronologyKey(entry), entry]));
}

function toTimestamp(value: string | number | Date | null | undefined): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function compareKnownFavedSeq(left: { favedSeq: number }, right: { favedSeq: number }): number {
  return right.favedSeq - left.favedSeq;
}

function compareAddedFirst(
  left: { site: Site; favoriteAddedAt: string | null; favoriteDateKnown?: boolean; favoriteOrderSource?: FavoriteOrderSource; favoriteSourceIndex: number; favedSeq?: number | null },
  right: { site: Site; favoriteAddedAt: string | null; favoriteDateKnown?: boolean; favoriteOrderSource?: FavoriteOrderSource; favoriteSourceIndex: number; favedSeq?: number | null }
): number {
  const leftSeq = left.favedSeq ?? null;
  const rightSeq = right.favedSeq ?? null;
  const leftHasSeq = Number.isFinite(leftSeq as number);
  const rightHasSeq = Number.isFinite(rightSeq as number);

  if (leftHasSeq && rightHasSeq && leftSeq !== rightSeq) {
    return compareKnownFavedSeq(left as { favedSeq: number }, right as { favedSeq: number });
  }

  if (leftHasSeq !== rightHasSeq) {
    return leftHasSeq ? -1 : 1;
  }

  const leftAddedAt = toTimestamp(left.favoriteAddedAt);
  const rightAddedAt = toTimestamp(right.favoriteAddedAt);
  const leftDateKnown = left.favoriteDateKnown ?? Number.isFinite(leftAddedAt);
  const rightDateKnown = right.favoriteDateKnown ?? Number.isFinite(rightAddedAt);
  const leftOrderSource = left.favoriteOrderSource ?? (leftDateKnown ? "retained" : "fallback");
  const rightOrderSource = right.favoriteOrderSource ?? (rightDateKnown ? "retained" : "fallback");

  if (leftDateKnown && rightDateKnown && leftAddedAt !== rightAddedAt) {
    return rightAddedAt - leftAddedAt;
  }

  if (leftDateKnown !== rightDateKnown) {
    return leftDateKnown ? -1 : 1;
  }

  const sourceDelta = FAVORITE_ORDER_SOURCE_RANK[leftOrderSource] - FAVORITE_ORDER_SOURCE_RANK[rightOrderSource];
  if (sourceDelta !== 0) {
    return sourceDelta;
  }

  const siteDelta = SITE_ORDER[left.site] - SITE_ORDER[right.site];
  if (siteDelta !== 0) {
    return siteDelta;
  }

  if (left.favoriteSourceIndex !== right.favoriteSourceIndex) {
    return left.favoriteSourceIndex - right.favoriteSourceIndex;
  }

  return 0;
}

export function sortFavoriteCreators(items: FavoriteCreatorListItem[], sort: "date" | "favorites" | "az"): FavoriteCreatorListItem[] {
  return items.slice().sort((left, right) => {
    if (sort === "date") {
      const delta = toTimestamp(right.updated) - toTimestamp(left.updated);
      if (delta !== 0) {
        return delta;
      }
    }

    if (sort === "favorites") {
      const delta = compareAddedFirst(left, right);
      if (delta !== 0) {
        return delta;
      }
    }

    return left.name.localeCompare(right.name);
  });
}

export function sortFavoritePosts(items: FavoritePostListItem[], sort: "favorites" | "published"): FavoritePostListItem[] {
  return items.slice().sort((left, right) => {
    if (sort === "published") {
      const delta = toTimestamp(right.published) - toTimestamp(left.published);
      if (delta !== 0) {
        return delta;
      }
    }

    const addedDelta = compareAddedFirst(left, right);
    if (addedDelta !== 0) {
      return addedDelta;
    }

    return left.title.localeCompare(right.title);
  });
}

export function filterFavoriteCreators(items: FavoriteCreatorListItem[], input: { query: string; service: string }): FavoriteCreatorListItem[] {
  const normalizedQuery = input.query.trim().toLowerCase();
  return items.filter((creator) => {
    if (input.service !== "Tous" && creator.service !== input.service) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return creator.name.toLowerCase().includes(normalizedQuery);
  });
}

export function filterFavoritePosts(items: FavoritePostListItem[], input: { query: string; service: string }): FavoritePostListItem[] {
  const normalizedQuery = input.query.trim().toLowerCase();
  return items.filter((post) => {
    if (input.service !== "Tous" && post.service !== input.service) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return [post.title, post.content, post.creatorName, post.service, post.user]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(normalizedQuery));
  });
}

export function normalizeFavoritesPageParam(value: string | null | undefined): number {
  const parsed = Number(value ?? "1");
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.trunc(parsed);
}



