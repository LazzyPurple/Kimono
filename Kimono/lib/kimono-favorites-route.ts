import type { SupportedSite, StoredKimonoSession } from "./db/index.ts";
import { db, withDbConnection } from "./db/index.ts";
import type { FavoriteChronologyRecord, FavoriteCreatorListItem } from "./favorites-page-state.ts";
import { buildFavoriteChronologyMap, createFavoriteChronologyKey } from "./favorites-page-state.ts";
import type { UnifiedCreator } from "./api/helpers.ts";
import { loadStoredKimonoSessionRecord } from "./remote-session.ts";
import { readSessionUpstreamCache } from "./session-upstream-cache.ts";

import { TTL } from "./config/ttl.ts";

const FAVORITES_FRESH_TTL_MS = TTL.favorites.fresh;
const FAVORITES_STALE_TTL_MS = TTL.favorites.stale;

export interface KimonoFavoritesPayload {
  loggedIn: boolean;
  expired: boolean;
  username: string | null;
  favorites: FavoriteCreatorListItem[];
}

interface KimonoFavoritesDependencies {
  site: SupportedSite;
  loadSession?: (site: SupportedSite) => Promise<StoredKimonoSession | null>;
  fetchFavorites?: (input: { site: SupportedSite; cookie: string }) => Promise<UnifiedCreator[]>;
  listFavoriteChronology?: (input: { kind: "creator"; site: SupportedSite }) => Promise<FavoriteChronologyRecord[]>;
  readSnapshot?: (site: SupportedSite) => Promise<UnifiedCreator[] | { favorites: UnifiedCreator[]; updatedAt: Date | null }>;
  writeSnapshot?: (site: SupportedSite, favorites: UnifiedCreator[]) => Promise<void>;
}

function normalizeFavoriteSnapshotResult(
  snapshot: UnifiedCreator[] | { favorites: UnifiedCreator[]; updatedAt: Date | null }
): { favorites: UnifiedCreator[]; updatedAt: Date | null } {
  if (Array.isArray(snapshot)) {
    return { favorites: snapshot, updatedAt: null };
  }

  return {
    favorites: Array.isArray(snapshot.favorites) ? snapshot.favorites : [],
    updatedAt: snapshot.updatedAt ?? null,
  };
}

function mapFavoriteCreators(
  favorites: UnifiedCreator[],
  chronologyEntries: FavoriteChronologyRecord[],
  snapshotUpdatedAt: Date | null,
  stale: boolean
): FavoriteCreatorListItem[] {
  const chronologyByKey = buildFavoriteChronologyMap(chronologyEntries);
  return favorites.map((creator, index) => {
    const chronology = chronologyByKey.get(
      createFavoriteChronologyKey({
        kind: "creator",
        site: creator.site,
        service: creator.service,
        creatorId: creator.id,
      })
    );
    const retainedDate = typeof (creator as { favoriteAddedAt?: string | null }).favoriteAddedAt === "string"
      ? (creator as { favoriteAddedAt?: string | null }).favoriteAddedAt ?? null
      : null;
    const retainedSeq = typeof (creator as { faved_seq?: number | null }).faved_seq === "number"
      ? (creator as { faved_seq?: number | null }).faved_seq ?? null
      : null;
    const favoriteAddedAt = chronology?.favoritedAt.toISOString() ?? retainedDate;
    const favoriteOrderSource = chronology
      ? "exact"
      : retainedDate || retainedSeq != null
        ? "retained"
        : "fallback";

    return {
      ...creator,
      favoriteAddedAt,
      favoriteDateKnown: favoriteOrderSource !== "fallback",
      favoriteOrderSource,
      favoriteSourceIndex: typeof (creator as { favoriteSourceIndex?: number }).favoriteSourceIndex === "number"
        ? (creator as { favoriteSourceIndex?: number }).favoriteSourceIndex ?? index
        : index,
      snapshotUpdatedAt: snapshotUpdatedAt?.toISOString() ?? null,
      stale,
      favedSeq: chronology?.favedSeq ?? retainedSeq ?? null,
    } satisfies FavoriteCreatorListItem;
  });
}

async function readFavoriteSnapshot(site: SupportedSite): Promise<{ favorites: UnifiedCreator[]; updatedAt: Date | null }> {
  const snapshot = await withDbConnection((conn) => db.getFavoriteCache(conn as never, "creator", site));
  if (!snapshot?.payloadJson) {
    return { favorites: [], updatedAt: null };
  }

  try {
    const parsed = JSON.parse(snapshot.payloadJson);
    return {
      favorites: Array.isArray(parsed) ? parsed : [],
      updatedAt: snapshot.updatedAt ?? null,
    };
  } catch {
    return { favorites: [], updatedAt: snapshot.updatedAt ?? null };
  }
}

async function writeFavoriteSnapshot(site: SupportedSite, favorites: UnifiedCreator[]): Promise<void> {
  await withDbConnection((conn) => db.upsertFavoriteCache(conn as never, {
    kind: "creator",
    site,
    payloadJson: JSON.stringify(favorites),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + TTL.favorites.cache),
  }));
}

async function persistFavoriteChronology(site: SupportedSite, favorites: UnifiedCreator[]): Promise<void> {
  await withDbConnection(async (conn) => {
    for (const creator of favorites) {
      await db.upsertFavoriteChronologyEntry(conn as never, {
        kind: "creator",
        site,
        service: creator.service,
        creatorId: creator.id,
        postId: "",
        favoritedAt: new Date(),
        lastConfirmedAt: new Date(),
        favedSeq: typeof (creator as { faved_seq?: number | null }).faved_seq === "number"
          ? (creator as { faved_seq?: number | null }).faved_seq ?? null
          : null,
      });
    }
  });
}

async function defaultFetchFavorites(input: { site: SupportedSite; cookie: string }): Promise<UnifiedCreator[]> {
  const cached = await readSessionUpstreamCache<UnifiedCreator[]>({
    keyParts: ["favorites", "creators", input.site, input.cookie],
    freshTtlMs: FAVORITES_FRESH_TTL_MS,
    staleTtlMs: FAVORITES_STALE_TTL_MS,
    loader: async () => {
      const api = input.site === "kemono"
        ? await import("./api/kemono.ts")
        : await import("./api/coomer.ts");

      const favorites = await api.fetchFavorites(input.cookie);
      return favorites.map((creator) => ({ ...creator, site: input.site }));
    },
  });

  return cached.value;
}

async function defaultListFavoriteChronology(input: { kind: "creator"; site: SupportedSite }): Promise<FavoriteChronologyRecord[]> {
  return withDbConnection((conn) => db.getFavoriteChronology(conn as never, input.kind, input.site));
}

export async function getKimonoFavoritesPayload(
  dependencies: KimonoFavoritesDependencies
): Promise<KimonoFavoritesPayload> {
  const loadSession = dependencies.loadSession ?? ((site) => loadStoredKimonoSessionRecord(site));
  const session = await loadSession(dependencies.site);

  if (!session) {
    return {
      loggedIn: false,
      expired: false,
      username: null,
      favorites: [],
    };
  }

  const fetchFavorites = dependencies.fetchFavorites ?? defaultFetchFavorites;
  const listFavoriteChronology = dependencies.listFavoriteChronology ?? defaultListFavoriteChronology;
  const readSnapshot = dependencies.readSnapshot ?? readFavoriteSnapshot;
  const writeSnapshot = dependencies.writeSnapshot ?? writeFavoriteSnapshot;

  try {
    const favorites = await fetchFavorites({ site: dependencies.site, cookie: session.cookie });
    await persistFavoriteChronology(dependencies.site, favorites).catch(() => undefined);
    const chronologyEntries = await listFavoriteChronology({ kind: "creator", site: dependencies.site });
    const items = mapFavoriteCreators(favorites, chronologyEntries, new Date(), false);
    await writeSnapshot(dependencies.site, favorites).catch(() => undefined);

    return {
      loggedIn: true,
      expired: false,
      username: session.username ?? null,
      favorites: items,
    };
  } catch {
    const [snapshotResult, chronologyEntries] = await Promise.all([
      readSnapshot(dependencies.site),
      listFavoriteChronology({ kind: "creator", site: dependencies.site }),
    ]);
    const snapshot = normalizeFavoriteSnapshotResult(snapshotResult);

    if (snapshot.favorites.length > 0) {
      return {
        loggedIn: true,
        expired: true,
        username: session.username ?? null,
        favorites: mapFavoriteCreators(snapshot.favorites, chronologyEntries, snapshot.updatedAt, true),
      };
    }

    return {
      loggedIn: false,
      expired: true,
      username: session.username ?? null,
      favorites: [],
    };
  }
}


