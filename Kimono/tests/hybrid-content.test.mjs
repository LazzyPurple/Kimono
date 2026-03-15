import test from "node:test";
import assert from "node:assert/strict";

import {
  createCreatorSnapshotRows,
  createHybridContentService,
} from "../lib/hybrid-content.ts";

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

test("hybrid search triggers a snapshot refresh when the cache is cold", async () => {
  const calls = [];
  const pages = [
    {
      items: [],
      total: 0,
      page: 1,
      perPage: 50,
      services: [],
      snapshotFresh: false,
      syncedAt: null,
    },
    {
      items: [{ site: "kemono", service: "patreon", id: "2", name: "ViciNeko", favorited: 20 }],
      total: 1,
      page: 1,
      perPage: 50,
      services: ["patreon"],
      snapshotFresh: true,
      syncedAt: new Date("2026-03-13T01:00:00.000Z"),
    },
  ];

  const service = createHybridContentService({
    repository: {
      searchCreatorsPage: async () => pages.shift(),
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

  assert.deepEqual(calls.sort(), ["coomer", "kemono"]);
  assert.equal(result.items[0]?.name, "ViciNeko");
  assert.equal(result.source, "live-refresh");
});

test("hybrid search refreshes stale partial creator caches instead of treating them as a full coomer snapshot", async () => {
  const calls = [];
  const pages = [
    {
      items: [{ site: "coomer", service: "onlyfans", id: "partial", name: "Viewed Recently", favorited: 1 }],
      total: 1,
      page: 1,
      perPage: 50,
      services: ["onlyfans"],
      snapshotFresh: false,
      syncedAt: new Date("2026-03-10T01:00:00.000Z"),
    },
    {
      items: [
        { site: "coomer", service: "onlyfans", id: "a", name: "Alpha", favorited: 10 },
        { site: "coomer", service: "fansly", id: "b", name: "Beta", favorited: 8 },
      ],
      total: 2,
      page: 1,
      perPage: 50,
      services: ["fansly", "onlyfans"],
      snapshotFresh: true,
      syncedAt: new Date("2026-03-13T01:00:00.000Z"),
    },
  ];

  const service = createHybridContentService({
    repository: {
      searchCreatorsPage: async () => pages.shift(),
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

  assert.deepEqual(calls, ["coomer"]);
  assert.equal(result.total, 2);
  assert.equal(result.items[0]?.name, "Alpha");
  assert.equal(result.source, "live-refresh");
});

test("hybrid search keeps stale cached creators when a refresh fails", async () => {
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
    syncCreatorsSnapshotForSite: async () => {
      throw new Error("upstream unavailable");
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

  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.name, "Viewed Recently");
  assert.equal(result.source, "stale-cache");
});

test("hybrid popular falls back to a stale snapshot if upstream fetch fails", async () => {
  const service = createHybridContentService({
    repository: {
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
test("hybrid popular surfaces cached preview assets as public urls", async () => {
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
    preparePopularPreviewAssets: async ({ site, post }) => {
      prepareCalls.push(`${site}:${post.id}`);
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
  assert.deepEqual(prepareCalls, ["kemono:10", "kemono:11"]);
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
