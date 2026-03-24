import test from "node:test";
import assert from "node:assert/strict";

import {
  createCreatorSnapshotRows,
  createHybridContentService,
} from "../lib/hybrid-content.ts";
import { createPreviewSourceFingerprint } from "../lib/popular-preview-assets.ts";

test("createCreatorSnapshotRows refuses to replace a site snapshot with an empty upstream payload", () => {
  assert.throws(
    () => createCreatorSnapshotRows("coomer", []),
    /returned no creators/i
  );
});

test("hybrid content resolves its repository lazily through getRepository", async () => {
  let getRepositoryCalls = 0;

  const service = createHybridContentService({
    getRepository: async () => {
      getRepositoryCalls += 1;
      return {
        searchCreatorsPage: async () => ({
          items: [{ site: "kemono", service: "patreon", id: "1", name: "Maple", favorited: 10 }],
          total: 1,
          page: 1,
          perPage: 50,
          services: ["patreon"],
          snapshotFresh: true,
          syncedAt: new Date("2026-03-13T00:00:00.000Z"),
        }),
      };
    },
  });

  assert.equal(getRepositoryCalls, 0);

  const result = await service.searchCreatorsPage({
    q: "maple",
    filter: "tous",
    sort: "favorites",
    service: "Tous",
    page: 1,
    perPage: 50,
  });

  assert.equal(getRepositoryCalls, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.source, "cache");
});

test("hybrid search returns cached results when the creator snapshot is fresh", async () => {
  let syncCalls = 0;
  const service = createHybridContentService({
    repository: {
      searchCreatorsPage: async () => ({
        items: [{ site: "kemono", service: "patreon", id: "1", name: "Maple", favorited: 10 }],
        total: 1,
        page: 1,
        perPage: 50,
        services: ["patreon"],
        snapshotFresh: true,
        syncedAt: new Date("2026-03-13T00:00:00.000Z"),
      }),
    },
    syncCreatorsSnapshotForSite: async () => {
      syncCalls += 1;
    },
  });

  const result = await service.searchCreatorsPage({
    q: "maple",
    filter: "tous",
    sort: "favorites",
    service: "Tous",
    page: 1,
    perPage: 50,
  });

  assert.equal(result.items.length, 1);
  assert.equal(syncCalls, 0);
  assert.equal(result.source, "cache");
});

test("hybrid search returns stale-cache when no local creator snapshot data exists", async () => {
  const calls = [];
  const service = createHybridContentService({
    repository: {
      searchCreatorsPage: async () => ({
        items: [],
        total: 0,
        page: 1,
        perPage: 50,
        services: [],
        snapshotFresh: false,
        syncedAt: null,
      }),
    },
    syncCreatorsSnapshotForSite: async (site) => {
      calls.push(site);
    },
  });

  const result = await service.searchCreatorsPage({
    q: "",
    filter: "tous",
    sort: "favorites",
    service: "Tous",
    page: 1,
    perPage: 50,
  });

  assert.deepEqual(calls, []);
  assert.equal(result.items.length, 0);
  assert.equal(result.source, "stale-cache");
});

test("hybrid search serves stale local creator snapshots from db-cache without refreshing upstream", async () => {
  const calls = [];
  const stalePage = {
    items: [{ site: "coomer", service: "onlyfans", id: "partial", name: "Viewed Recently", favorited: 1 }],
    total: 1,
    page: 1,
    perPage: 50,
    services: ["onlyfans"],
    snapshotFresh: false,
    syncedAt: new Date("2026-03-10T01:00:00.000Z"),
  };

  const service = createHybridContentService({
    repository: {
      searchCreatorsPage: async () => stalePage,
    },
    syncCreatorsSnapshotForSite: async (site) => {
      calls.push(site);
    },
  });

  const result = await service.searchCreatorsPage({
    q: "",
    filter: "coomer",
    sort: "favorites",
    service: "Tous",
    page: 1,
    perPage: 50,
  });

  assert.deepEqual(calls, []);
  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.name, "Viewed Recently");
  assert.equal(result.source, "db-cache");
});

test("hybrid search keeps partial stale creator caches as db-cache instead of forcing a live refresh", async () => {
  const calls = [];
  const service = createHybridContentService({
    repository: {
      searchCreatorsPage: async () => ({
        items: [{ site: "coomer", service: "onlyfans", id: "partial", name: "Viewed Recently", favorited: 1 }],
        total: 1,
        page: 1,
        perPage: 50,
        services: ["onlyfans"],
        snapshotFresh: false,
        syncedAt: new Date("2026-03-10T01:00:00.000Z"),
      }),
    },
    syncCreatorsSnapshotForSite: async (site) => {
      calls.push(site);
    },
  });

  const result = await service.searchCreatorsPage({
    q: "",
    filter: "coomer",
    sort: "favorites",
    service: "Tous",
    page: 1,
    perPage: 50,
  });

  assert.deepEqual(calls, []);
  assert.equal(result.source, "db-cache");
});

test("hybrid popular falls back to a stale snapshot if upstream fetch fails", async () => {
  const service = createHybridContentService({
    repository: {
      getPostCache: async () => null,
      getPopularSnapshot: async () => ({
        posts: [{ id: "10", service: "patreon", user: "abc", site: "kemono", title: "Warm popular" }],
        snapshotFresh: false,
        snapshotDate: "2026-03-12",
      }),
      replacePopularSnapshot: async () => {
        throw new Error("should not write in this test");
      },
    },
    fetchPopularPostsLive: async () => {
      throw new Error("upstream unavailable");
    },
  });

  const result = await service.getPopularPosts({
    site: "kemono",
    period: "recent",
    date: null,
    offset: 0,
  });

  assert.equal(result.posts.length, 1);
  assert.equal(result.source, "stale-cache");
});

test("hybrid post detail upgrades the cache after a live fetch", async () => {
  const writes = [];
  const service = createHybridContentService({
    repository: {
      getPostCache: async () => null,
      upsertPostCache: async (record) => {
        writes.push(record);
      },
    },
    fetchPostLive: async () => ({
      site: "kemono",
      service: "patreon",
      user: "abc",
      id: "999",
      title: "Fresh detail",
      content: "Hello",
      published: "2026-03-13T10:00:00.000Z",
      added: "2026-03-13T10:00:00.000Z",
      edited: "2026-03-13T10:00:00.000Z",
      embed: {},
      file: { name: "cover.jpg", path: "/cover.jpg" },
      attachments: [],
    }),
  });

  const result = await service.getPostDetail({
    site: "kemono",
    service: "patreon",
    creatorId: "abc",
    postId: "999",
    cookie: undefined,
  });

  assert.equal(result.source, "live");
  assert.equal(result.post.title, "Fresh detail");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].detailLevel, "full");
});

test("hybrid post detail falls back to creator post snapshots when live detail is unavailable", async () => {
  const service = createHybridContentService({
    repository: {
      getPostCache: async () => null,
    },
    fetchPostLive: async () => {
      throw new Error("upstream unavailable");
    },
    readCreatorPostsSnapshot: async ({ offset }) =>
      offset === 0
        ? [
            {
              site: "coomer",
              service: "fansly",
              user: "creator-1",
              id: "post-42",
              title: "Snapshot detail",
              content: "Recovered from snapshot",
              published: "2026-03-20T10:00:00.000Z",
              added: "2026-03-20T10:00:00.000Z",
              edited: "2026-03-20T10:00:00.000Z",
              embed: {},
              file: { name: "cover.jpg", path: "/cover.jpg" },
              attachments: [],
            },
          ]
        : [],
  });

  const result = await service.getPostDetail({
    site: "coomer",
    service: "fansly",
    creatorId: "creator-1",
    postId: "post-42",
  });

  assert.equal(result.source, "stale-cache");
  assert.equal(result.post.title, "Snapshot detail");
  assert.equal(result.post.id, "post-42");
});


test("hybrid creator posts reuses cached preview assets when refreshing live posts", async () => {
  const writes = [];
  const service = createHybridContentService({
    repository: {
      listCreatorPosts: async () => [],
      getPostCache: async ({ postId }) => postId === "10"
        ? {
            longestVideoUrl: "https://kemono.cr/data/10.mp4",
            longestVideoDurationSeconds: 63,
            previewThumbnailAssetPath: "popular/kemono/fingerprint-10/thumb.webp",
            previewClipAssetPath: "popular/kemono/fingerprint-10/clip.mp4",
            previewStatus: "ready",
            previewGeneratedAt: new Date("2026-03-14T10:00:00.000Z"),
            previewError: null,
            previewSourceFingerprint: "fingerprint-10",
          }
        : null,
      upsertPostCache: async (record) => {
        writes.push(record);
      },
    },
    fetchCreatorPostsLive: async () => ([
      {
        site: "kemono",
        service: "patreon",
        user: "abc",
        id: "10",
        title: "Creator post",
        content: "Hello",
        published: "2026-03-14T10:00:00.000Z",
        added: "2026-03-14T10:00:00.000Z",
        edited: "2026-03-14T10:00:00.000Z",
        embed: {},
        file: { name: "video.mp4", path: "/data/video.mp4" },
        attachments: [],
      },
    ]),
  });

  const result = await service.getCreatorPosts({
    site: "kemono",
    service: "patreon",
    creatorId: "abc",
    offset: 0,
  });

  assert.equal(result.source, "live");
  assert.equal(result.posts[0]?.previewThumbnailUrl, "/api/preview-assets/popular/kemono/fingerprint-10/thumb.webp");
  assert.equal(result.posts[0]?.previewClipUrl, "/api/preview-assets/popular/kemono/fingerprint-10/clip.mp4");
  assert.equal(result.posts[0]?.longestVideoDurationSeconds, 63);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.previewThumbnailAssetPath, "popular/kemono/fingerprint-10/thumb.webp");
  assert.equal(writes[0]?.previewClipAssetPath, "popular/kemono/fingerprint-10/clip.mp4");
  assert.equal(writes[0]?.longestVideoDurationSeconds, 63);
});

test("hybrid creator posts also hydrate from the shared media platform when post cache is cold", async () => {
  const sourceVideoUrl = "https://kemono.cr/data/data/video.mp4";
  const sourceFingerprint = createPreviewSourceFingerprint("kemono", sourceVideoUrl);
  const writes = [];
  const touches = [];

  const service = createHybridContentService({
    repository: {
      listCreatorPosts: async () => [],
      getPostCache: async () => null,
      getPreviewAssetCache: async ({ sourceFingerprint: requestedFingerprint }) =>
        requestedFingerprint === sourceFingerprint
          ? {
              site: "kemono",
              sourceVideoUrl,
              sourceFingerprint,
              durationSeconds: 88,
              thumbnailAssetPath: "popular/kemono/shared-fingerprint/thumb.webp",
              clipAssetPath: "popular/kemono/shared-fingerprint/clip.mp4",
              status: "ready",
              generatedAt: new Date("2026-03-18T10:00:00.000Z"),
              lastSeenAt: new Date("2026-03-18T10:00:00.000Z"),
              error: null,
              mediaKind: "video",
              mimeType: "video/mp4",
              width: 1280,
              height: 720,
              nativeThumbnailUrl: null,
              probeStatus: "probed",
              artifactStatus: "ready",
              firstSeenAt: new Date("2026-03-17T10:00:00.000Z"),
              hotUntil: new Date("2026-03-21T10:00:00.000Z"),
              retryAfter: null,
              generationAttempts: 1,
              lastError: null,
              lastObservedContext: "popular",
            }
          : null,
      upsertPreviewAssetCache: async () => {
        throw new Error("should not create a new preview cache record when one already exists");
      },
      touchPreviewAssetCache: async (input) => {
        touches.push(input);
      },
      upsertPostCache: async (record) => {
        writes.push(record);
      },
    },
    fetchCreatorPostsLive: async () => ([
      {
        site: "kemono",
        service: "patreon",
        user: "abc",
        id: "10",
        title: "Creator post",
        content: "Hello",
        published: "2026-03-14T10:00:00.000Z",
        added: "2026-03-14T10:00:00.000Z",
        edited: "2026-03-14T10:00:00.000Z",
        embed: {},
        file: { name: "video.mp4", path: "/data/video.mp4" },
        attachments: [],
      },
    ]),
  });

  const result = await service.getCreatorPosts({
    site: "kemono",
    service: "patreon",
    creatorId: "abc",
    offset: 0,
  });

  assert.equal(touches.length, 1);
  assert.equal(result.posts[0]?.previewThumbnailUrl, "/api/preview-assets/popular/kemono/shared-fingerprint/thumb.webp");
  assert.equal(result.posts[0]?.previewClipUrl, "/api/preview-assets/popular/kemono/shared-fingerprint/clip.mp4");
  assert.equal(result.posts[0]?.mediaArtifactStatus, "ready");
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.previewThumbnailAssetPath, "popular/kemono/shared-fingerprint/thumb.webp");
  assert.equal(writes[0]?.previewClipAssetPath, "popular/kemono/shared-fingerprint/clip.mp4");
});

test("hybrid popular surfaces cached preview assets as public urls", async () => {
  const service = createHybridContentService({
    repository: {
      getPostCache: async () => null,
      getPopularSnapshot: async () => ({
        posts: [
          {
            site: "kemono",
            service: "patreon",
            creatorId: "abc",
            postId: "10",
            title: "Warm popular",
            excerpt: "cached",
            publishedAt: new Date("2026-03-13T10:00:00.000Z"),
            addedAt: new Date("2026-03-13T10:00:00.000Z"),
            editedAt: new Date("2026-03-13T10:00:00.000Z"),
            previewImageUrl: null,
            videoUrl: null,
            thumbUrl: null,
            mediaType: "video",
            authorName: null,
            rawPreviewPayload: null,
            rawDetailPayload: null,
            detailLevel: "metadata",
            sourceKind: "popular",
            longestVideoUrl: "https://kemono.cr/data/abc/video.mp4",
            longestVideoDurationSeconds: 42,
            previewThumbnailAssetPath: "popular/kemono/fingerprint-1/thumb.webp",
            previewClipAssetPath: "popular/kemono/fingerprint-1/clip.mp4",
            previewStatus: "ready",
            previewGeneratedAt: new Date("2026-03-14T08:00:00.000Z"),
            previewError: null,
            previewSourceFingerprint: "fingerprint-1",
            cachedAt: new Date("2026-03-14T08:00:00.000Z"),
            expiresAt: new Date("2026-03-14T09:00:00.000Z"),
          },
        ],
        snapshotFresh: true,
        snapshotDate: "2026-03-14",
        syncedAt: new Date("2026-03-14T08:00:00.000Z"),
      }),
    },
  });

  const result = await service.getPopularPosts({
    site: "kemono",
    period: "recent",
    date: null,
    offset: 0,
  });

  assert.equal(result.source, "cache");
  assert.equal(result.posts[0]?.previewThumbnailUrl, "/api/preview-assets/popular/kemono/fingerprint-1/thumb.webp");
  assert.equal(result.posts[0]?.previewClipUrl, "/api/preview-assets/popular/kemono/fingerprint-1/clip.mp4");
  assert.equal(result.posts[0]?.longestVideoDurationSeconds, 42);
});

test("hybrid popular cache hits still hydrate posts from the shared media platform registry", async () => {
  const sourceVideoUrl = "https://kemono.cr/data/data/popular-video.mp4";
  const sourceFingerprint = createPreviewSourceFingerprint("kemono", sourceVideoUrl);
  const touches = [];

  const resultPost = {
    site: "kemono",
    service: "patreon",
    user: "abc",
    id: "10",
    title: "Warm popular",
    content: "cached",
    published: "2026-03-13T10:00:00.000Z",
    added: "2026-03-13T10:00:00.000Z",
    edited: "2026-03-13T10:00:00.000Z",
    embed: {},
    file: { name: "popular-video.mp4", path: "/data/popular-video.mp4" },
    attachments: [],
  };

  const service = createHybridContentService({
    repository: {
      getPopularSnapshot: async () => ({
        posts: [
          {
            site: "kemono",
            service: "patreon",
            creatorId: "abc",
            postId: "10",
            title: "Warm popular",
            excerpt: "cached",
            publishedAt: new Date("2026-03-13T10:00:00.000Z"),
            addedAt: new Date("2026-03-13T10:00:00.000Z"),
            editedAt: new Date("2026-03-13T10:00:00.000Z"),
            previewImageUrl: null,
            videoUrl: null,
            thumbUrl: null,
            mediaType: "video",
            authorName: null,
            rawPreviewPayload: resultPost,
            rawDetailPayload: null,
            detailLevel: "metadata",
            sourceKind: "popular",
            longestVideoUrl: null,
            longestVideoDurationSeconds: null,
            previewThumbnailAssetPath: null,
            previewClipAssetPath: null,
            previewStatus: null,
            previewGeneratedAt: null,
            previewError: null,
            previewSourceFingerprint: null,
            cachedAt: new Date("2026-03-14T08:00:00.000Z"),
            expiresAt: new Date("2026-03-14T09:00:00.000Z"),
          },
        ],
        snapshotFresh: true,
        snapshotDate: "2026-03-14",
        syncedAt: new Date("2026-03-14T08:00:00.000Z"),
      }),
      getPostCache: async () => null,
      getPreviewAssetCache: async ({ sourceFingerprint: requestedFingerprint }) =>
        requestedFingerprint === sourceFingerprint
          ? {
              site: "kemono",
              sourceVideoUrl,
              sourceFingerprint,
              durationSeconds: 42,
              thumbnailAssetPath: "popular/kemono/fingerprint-shared/thumb.webp",
              clipAssetPath: "popular/kemono/fingerprint-shared/clip.mp4",
              status: "ready",
              generatedAt: new Date("2026-03-14T08:00:00.000Z"),
              lastSeenAt: new Date("2026-03-14T08:00:00.000Z"),
              error: null,
              mediaKind: "video",
              mimeType: "video/mp4",
              width: 1280,
              height: 720,
              nativeThumbnailUrl: null,
              probeStatus: "probed",
              artifactStatus: "ready",
              firstSeenAt: new Date("2026-03-13T08:00:00.000Z"),
              hotUntil: new Date("2026-03-17T08:00:00.000Z"),
              retryAfter: null,
              generationAttempts: 1,
              lastError: null,
              lastObservedContext: "popular",
            }
          : null,
      upsertPreviewAssetCache: async () => {
        throw new Error("should reuse the existing preview asset cache record");
      },
      touchPreviewAssetCache: async (input) => {
        touches.push(input);
      },
    },
  });

  const result = await service.getPopularPosts({
    site: "kemono",
    period: "recent",
    date: null,
    offset: 0,
  });

  assert.equal(result.source, "cache");
  assert.equal(touches.length, 1);
  assert.equal(result.posts[0]?.previewThumbnailUrl, "/api/preview-assets/popular/kemono/fingerprint-shared/thumb.webp");
  assert.equal(result.posts[0]?.previewClipUrl, "/api/preview-assets/popular/kemono/fingerprint-shared/clip.mp4");
  assert.equal(result.posts[0]?.mediaArtifactStatus, "ready");
});

test("hybrid popular warmup prepares preview assets, enriches post cache rows, aggregates outcomes and cleans up stale preview assets", async () => {
  const upserts = [];
  const replaceCalls = [];
  const cleanupCalls = [];
  const deleteSnapshotCalls = [];
  const prepareCalls = [];

  const service = createHybridContentService({
    repository: {
      upsertPostCache: async (input) => {
        upserts.push(input);
      },
      replacePopularSnapshot: async (input) => {
        replaceCalls.push(input);
      },
      listActivePreviewSourceFingerprints: async () => [
        { site: "kemono", sourceFingerprint: "fingerprint-10" },
        { site: "kemono", sourceFingerprint: "fingerprint-11" },
      ],
      deletePopularSnapshotsOlderThan: async (input) => {
        deleteSnapshotCalls.push(input);
      },
    },
    fetchPopularPostsLive: async () => ({
      info: null,
      props: { count: 2 },
      posts: [
        {
          site: "kemono",
          service: "patreon",
          user: "abc",
          id: "10",
          title: "Fresh popular",
          content: "Hello",
          published: "2026-03-14T10:00:00.000Z",
          added: "2026-03-14T10:00:00.000Z",
          edited: "2026-03-14T10:00:00.000Z",
          embed: {},
          file: { name: "video.mp4", path: "/data/video.mp4" },
          attachments: [],
        },
        {
          site: "kemono",
          service: "patreon",
          user: "abc",
          id: "11",
          title: "Warm popular",
          content: "Again",
          published: "2026-03-14T11:00:00.000Z",
          added: "2026-03-14T11:00:00.000Z",
          edited: "2026-03-14T11:00:00.000Z",
          embed: {},
          file: { name: "video-2.mp4", path: "/data/video-2.mp4" },
          attachments: [],
        },
      ],
    }),
    preparePopularPreviewAssets: async ({ site, post, priorityClass }) => {
      prepareCalls.push(`${site}:${post.id}:${priorityClass ?? "regular"}`);
      return {
        longestVideoUrl: `https://kemono.cr/data/${post.id}.mp4`,
        longestVideoDurationSeconds: post.id === "10" ? 63 : 41,
        previewThumbnailAssetPath: `popular/kemono/fingerprint-${post.id}/thumb.webp`,
        previewClipAssetPath: `popular/kemono/fingerprint-${post.id}/clip.mp4`,
        previewStatus: "ready",
        previewGeneratedAt: new Date("2026-03-14T10:00:00.000Z"),
        previewError: null,
        previewSourceFingerprint: `fingerprint-${post.id}`,
        previewOutcome: post.id === "10" ? "generated" : "reused",
      };
    },
    cleanupPopularPreviewAssets: async (input) => {
      cleanupCalls.push(input);
      return { deletedEntries: 1 };
    },
  });

  const result = await service.runPopularWarmupJob({
    sites: ["kemono"],
    periods: ["recent"],
    recentOffsets: [0],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(prepareCalls, ["kemono:10:popular", "kemono:11:popular"]);
  assert.equal(upserts.length, 2);
  assert.equal(upserts[0]?.previewSourceFingerprint, "fingerprint-10");
  assert.equal(upserts[1]?.previewClipAssetPath, "popular/kemono/fingerprint-11/clip.mp4");
  assert.equal(upserts[0]?.longestVideoDurationSeconds, 63);
  assert.equal(replaceCalls.length, 1);
  assert.equal(cleanupCalls.length, 1);
  assert.equal(deleteSnapshotCalls.length, 1);
  assert.deepEqual(result.summary, {
    totalTasks: 1,
    succeededTasks: 1,
    failedTasks: 0,
    totalPosts: 2,
    generated: 1,
    reused: 1,
    skippedNoFfmpeg: 0,
    failed: 0,
    notVideo: 0,
  });
  assert.deepEqual(result.runs[0]?.previewSummary, {
    totalPosts: 2,
    generated: 1,
    reused: 1,
    skippedNoFfmpeg: 0,
    failed: 0,
    notVideo: 0,
  });
});

test("hybrid creator posts falls back to stale cached rows when the live fetch fails", async () => {
  const service = createHybridContentService({
    repository: {
      getPostCache: async () => null,
      listCreatorPosts: async ({ freshOnly }) => freshOnly
        ? []
        : [{
            site: "coomer",
            service: "onlyfans",
            creatorId: "suamuva",
            postId: "legacy-1",
            title: "Cached creator post",
            excerpt: "cached",
            publishedAt: new Date("2026-03-10T10:00:00.000Z"),
            addedAt: new Date("2026-03-10T10:00:00.000Z"),
            editedAt: new Date("2026-03-10T10:00:00.000Z"),
            previewImageUrl: null,
            videoUrl: null,
            thumbUrl: null,
            mediaType: "image",
            authorName: null,
            rawPreviewPayload: {
              site: "coomer",
              service: "onlyfans",
              user: "suamuva",
              id: "legacy-1",
              title: "Cached creator post",
              content: "cached",
              published: "2026-03-10T10:00:00.000Z",
              added: "2026-03-10T10:00:00.000Z",
              edited: "2026-03-10T10:00:00.000Z",
              embed: {},
              file: { name: "image.jpg", path: "/data/image.jpg" },
              attachments: [],
            },
            rawDetailPayload: null,
            detailLevel: "metadata",
            sourceKind: "creator-page",
            longestVideoUrl: null,
            longestVideoDurationSeconds: null,
            previewThumbnailAssetPath: null,
            previewClipAssetPath: null,
            previewStatus: null,
            previewGeneratedAt: null,
            previewError: null,
            previewSourceFingerprint: null,
            cachedAt: new Date("2026-03-11T10:00:00.000Z"),
            expiresAt: new Date("2026-03-11T11:00:00.000Z"),
          }],
    },
    fetchCreatorPostsLive: async () => {
      throw new Error("429");
    },
  });

  const result = await service.getCreatorPosts({
    site: "coomer",
    service: "onlyfans",
    creatorId: "suamuva",
    offset: 0,
  });

  assert.equal(result.source, "stale-cache");
  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0]?.id, "legacy-1");
});

test("hybrid post detail falls back to stale full cache when the live fetch fails", async () => {
  const service = createHybridContentService({
    repository: {
      getPostCache: async () => ({
        site: "coomer",
        service: "fansly",
        creatorId: "284824685877669888",
        postId: "652255153079988224",
        title: "Warm detail",
        excerpt: "cached",
        publishedAt: new Date("2026-03-10T10:00:00.000Z"),
        addedAt: new Date("2026-03-10T10:00:00.000Z"),
        editedAt: new Date("2026-03-10T10:00:00.000Z"),
        previewImageUrl: null,
        videoUrl: null,
        thumbUrl: null,
        mediaType: "image",
        authorName: null,
        rawPreviewPayload: null,
        rawDetailPayload: {
          site: "coomer",
          service: "fansly",
          user: "284824685877669888",
          id: "652255153079988224",
          title: "Warm detail",
          content: "cached",
          published: "2026-03-10T10:00:00.000Z",
          added: "2026-03-10T10:00:00.000Z",
          edited: "2026-03-10T10:00:00.000Z",
          embed: {},
          file: { name: "image.jpg", path: "/data/image.jpg" },
          attachments: [],
        },
        detailLevel: "full",
        sourceKind: "post-detail",
        longestVideoUrl: null,
        longestVideoDurationSeconds: null,
        previewThumbnailAssetPath: null,
        previewClipAssetPath: null,
        previewStatus: null,
        previewGeneratedAt: null,
        previewError: null,
        previewSourceFingerprint: null,
        cachedAt: new Date("2026-03-11T10:00:00.000Z"),
        expiresAt: new Date("2026-03-11T11:00:00.000Z"),
      }),
    },
    fetchPostLive: async () => {
      throw new Error("429");
    },
  });

  const result = await service.getPostDetail({
    site: "coomer",
    service: "fansly",
    creatorId: "284824685877669888",
    postId: "652255153079988224",
  });

  assert.equal(result.source, "stale-cache");
  assert.equal(result.post.id, "652255153079988224");
  assert.equal(result.post.title, "Warm detail");
});


test("hybrid creator profile falls back to a persisted snapshot when upstream is unavailable", async () => {
  const service = createHybridContentService({
    repository: {
      getCreatorProfile: async () => null,
    },
    fetchCreatorProfileLive: async () => {
      throw new Error("429");
    },
    readCreatorProfileSnapshot: async () => ({
      site: "coomer",
      service: "fansly",
      id: "creator-7",
      name: "ClaireMoon",
      favorited: 12,
      post_count: 264,
    }),
  });

  const result = await service.getCreatorProfile({
    site: "coomer",
    service: "fansly",
    creatorId: "creator-7",
  });

  assert.equal(result.source, "stale-cache");
  assert.equal(result.profile?.name, "ClaireMoon");
  assert.equal(result.profile?.post_count, 264);
});

test("hybrid creator profile persists a snapshot after a successful live fetch", async () => {
  const writes = [];
  const liveProfile = {
    site: "coomer",
    service: "fansly",
    id: "creator-7",
    name: "ClaireMoon",
    favorited: 12,
    post_count: 264,
  };
  const service = createHybridContentService({
    repository: {
      getCreatorProfile: async () => null,
      upsertCreatorProfile: async () => undefined,
    },
    fetchCreatorProfileLive: async () => liveProfile,
    writeCreatorProfileSnapshot: async (input) => {
      writes.push(input);
    },
  });

  const result = await service.getCreatorProfile({
    site: "coomer",
    service: "fansly",
    creatorId: "creator-7",
  });

  assert.equal(result.source, "live");
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.profile?.name, "ClaireMoon");
});

test("hybrid creator posts falls back to a persisted snapshot when cache and upstream are unavailable", async () => {
  const service = createHybridContentService({
    repository: {
      listCreatorPosts: async () => [],
      getPostCache: async () => null,
    },
    fetchCreatorPostsLive: async () => {
      throw new Error("429");
    },
    readCreatorPostsSnapshot: async () => ([
      {
        site: "coomer",
        service: "fansly",
        user: "creator-7",
        id: "post-1",
        title: "Warm post",
        content: "cached snapshot",
        published: "2026-03-18T12:00:00.000Z",
        added: "2026-03-18T12:00:00.000Z",
        edited: "2026-03-18T12:00:00.000Z",
        embed: {},
        file: { name: "image.jpg", path: "/data/image.jpg" },
        attachments: [],
      },
    ]),
  });

  const result = await service.getCreatorPosts({
    site: "coomer",
    service: "fansly",
    creatorId: "creator-7",
    offset: 0,
  });

  assert.equal(result.source, "stale-cache");
  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0]?.id, "post-1");
});

test("hybrid creator posts persist a snapshot after a successful live fetch", async () => {
  const writes = [];
  const service = createHybridContentService({
    repository: {
      listCreatorPosts: async () => [],
      getPostCache: async () => null,
      upsertPostCache: async () => undefined,
    },
    fetchCreatorPostsLive: async () => ([
      {
        site: "coomer",
        service: "fansly",
        user: "creator-7",
        id: "post-1",
        title: "Warm post",
        content: "live snapshot",
        published: "2026-03-18T12:00:00.000Z",
        added: "2026-03-18T12:00:00.000Z",
        edited: "2026-03-18T12:00:00.000Z",
        embed: {},
        file: { name: "image.jpg", path: "/data/image.jpg" },
        attachments: [],
      },
    ]),
    writeCreatorPostsSnapshot: async (input) => {
      writes.push(input);
    },
  });

  const result = await service.getCreatorPosts({
    site: "coomer",
    service: "fansly",
    creatorId: "creator-7",
    offset: 0,
  });

  assert.equal(result.source, "live");
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.posts?.length, 1);
  assert.equal(writes[0]?.posts?.[0]?.id, "post-1");
});

test("runCreatorSnapshotJob warms favorite creators with thumbnail-first previews", async () => {
  const profileWrites = [];
  const postWrites = [];
  const prepareCalls = [];

  const service = createHybridContentService({
    repository: {
      upsertCreatorProfile: async () => undefined,
      upsertPostCache: async () => undefined,
      getPostCache: async () => null,
      getPreviewAssetCache: async () => null,
      upsertPreviewAssetCache: async () => undefined,
      touchPreviewAssetCache: async () => undefined,
    },
    readFavoriteCreatorWarmTargets: async () => ([
      { site: "coomer", service: "fansly", creatorId: "creator-7" },
    ]),
    loadStoredSessionCookie: async () => "session=warm",
    fetchCreatorProfileLive: async () => ({
      site: "coomer",
      service: "fansly",
      id: "creator-7",
      name: "ClaireMoon",
      favorited: 12,
      post_count: 264,
    }),
    fetchCreatorPostsLive: async (_site, _service, _creatorId, offset) => ([
      {
        site: "coomer",
        service: "fansly",
        user: "creator-7",
        id: `post-${offset}`,
        title: `Warm post ${offset}`,
        content: "snapshot",
        published: "2026-03-18T12:00:00.000Z",
        added: "2026-03-18T12:00:00.000Z",
        edited: "2026-03-18T12:00:00.000Z",
        embed: {},
        file: { name: "video.mp4", path: "/data/video.mp4" },
        attachments: [],
      },
    ]),
    preparePopularPreviewAssets: async ({ site, post, generationStrategy }) => {
      prepareCalls.push({ site, postId: post.id, generationStrategy });
      return {
        longestVideoUrl: `https://coomer.st/data/${post.id}.mp4`,
        longestVideoDurationSeconds: 12,
        previewThumbnailAssetPath: `popular/${site}/fp-${post.id}/thumb.webp`,
        previewClipAssetPath: null,
        previewStatus: "ready",
        previewGeneratedAt: new Date("2026-03-19T02:00:00.000Z"),
        previewError: null,
        previewSourceFingerprint: `fp-${post.id}`,
        previewOutcome: "generated",
      };
    },
    writeCreatorProfileSnapshot: async (input) => {
      profileWrites.push(input);
    },
    writeCreatorPostsSnapshot: async (input) => {
      postWrites.push(input);
    },
  });

  const result = await service.runCreatorSnapshotJob({
    sites: ["coomer"],
    favoritesOnly: true,
    postOffsets: [0, 50],
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "favorites-warmup");
  assert.equal(result.summary.totalCreators, 1);
  assert.equal(result.summary.warmedProfiles, 1);
  assert.equal(result.summary.warmedPostPages, 2);
  assert.equal(profileWrites.length, 1);
  assert.equal(postWrites.length, 2);
  assert.deepEqual(postWrites.map((entry) => entry.offset), [0, 50]);
  assert.equal(prepareCalls.length, 2);
  assert.equal(prepareCalls.every((entry) => entry.generationStrategy === "thumbnail-first"), true);
});
