import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { createLocalDataStore } from "../lib/data-store.ts";

function createTempDatabaseCopy() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimono-store-"));
  const dbPath = path.join(tempDir, "dev.db");
  fs.copyFileSync(path.join(process.cwd(), "prisma", "dev.db"), dbPath);

  return {
    tempDir,
    databaseUrl: `file:${dbPath.replace(/\\/g, "/")}`,
  };
}

test("local data store creates the admin user once and reuses it", async (t) => {
  const { tempDir, databaseUrl } = createTempDatabaseCopy();
  const store = await createLocalDataStore({ databaseUrl });

  t.after(async () => {
    await store.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const first = await store.getOrCreateAdminUser();
  const second = await store.getOrCreateAdminUser();

  assert.equal(first.email, "admin@kimono.local");
  assert.equal(second.id, first.id);
});

test("local data store reads users by id", async (t) => {
  const { tempDir, databaseUrl } = createTempDatabaseCopy();
  const store = await createLocalDataStore({ databaseUrl });

  t.after(async () => {
    await store.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const user = await store.getOrCreateAdminUser();
  const fetched = await store.getUserById(user.id);

  assert.equal(fetched?.id, user.id);
  assert.equal(fetched?.email, user.email);
});

test("local data store replaces the latest Kimono session per site", async (t) => {
  const { tempDir, databaseUrl } = createTempDatabaseCopy();
  const store = await createLocalDataStore({ databaseUrl });

  t.after(async () => {
    await store.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await store.saveKimonoSession({
    site: "kemono",
    cookie: "session=first",
    username: "alice",
  });
  await store.saveKimonoSession({
    site: "kemono",
    cookie: "session=second",
    username: "bob",
  });

  const session = await store.getLatestKimonoSession("kemono");

  assert.equal(session?.cookie, "session=second");
  assert.equal(session?.username, "bob");
});

test("local data store lists and deletes Kimono sessions by site", async (t) => {
  const { tempDir, databaseUrl } = createTempDatabaseCopy();
  const store = await createLocalDataStore({ databaseUrl });

  t.after(async () => {
    await store.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await store.saveKimonoSession({
    site: "kemono",
    cookie: "session=kemono",
    username: "alice",
  });
  await store.saveKimonoSession({
    site: "coomer",
    cookie: "session=coomer",
    username: "bob",
  });

  const sessions = await store.getKimonoSessions();
  assert.equal(sessions.length, 2);

  await store.deleteKimonoSession("kemono");

  const deletedSession = await store.getLatestKimonoSession("kemono");
  const remainingSessions = await store.getKimonoSessions();

  assert.equal(deletedSession, null);
  assert.equal(remainingSessions.length, 1);
  assert.equal(remainingSessions[0]?.site, "coomer");
});

test("local data store round-trips creators cache and discovery cache JSON", async (t) => {
  const { tempDir, databaseUrl } = createTempDatabaseCopy();
  const store = await createLocalDataStore({ databaseUrl });

  t.after(async () => {
    await store.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await store.setCreatorsCache("kemono", [{ id: "creator-1" }], new Date("2026-03-11T00:00:00.000Z"));
  await store.setDiscoveryCache("global", [{ id: "rec-1" }], new Date("2026-03-11T01:00:00.000Z"));

  const creatorsCache = await store.getCreatorsCache("kemono");
  const discoveryCache = await store.getDiscoveryCache("global");

  assert.deepEqual(JSON.parse(creatorsCache?.data ?? "[]"), [{ id: "creator-1" }]);
  assert.deepEqual(JSON.parse(discoveryCache?.data ?? "[]"), [{ id: "rec-1" }]);
});

test("local data store blocks and unblocks discovery creators", async (t) => {
  const { tempDir, databaseUrl } = createTempDatabaseCopy();
  const store = await createLocalDataStore({ databaseUrl });

  t.after(async () => {
    await store.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await store.blockDiscoveryCreator({
    site: "kemono",
    service: "patreon",
    creatorId: "123",
  });

  let blocks = await store.getDiscoveryBlocks();
  assert.equal(blocks.some((block) => block.creatorId === "123"), true);

  await store.unblockDiscoveryCreator({
    site: "kemono",
    service: "patreon",
    creatorId: "123",
  });

  blocks = await store.getDiscoveryBlocks();
  assert.equal(blocks.some((block) => block.creatorId === "123"), false);
});


test("local data store persists favorite chronology for creators and posts", async (t) => {
  const { tempDir, databaseUrl } = createTempDatabaseCopy();
  const store = await createLocalDataStore({ databaseUrl });

  t.after(async () => {
    await store.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await store.upsertFavoriteChronology({
    kind: "creator",
    site: "kemono",
    service: "patreon",
    creatorId: "creator-1",
    favoritedAt: new Date("2026-03-19T10:00:00.000Z"),
  });
  await store.upsertFavoriteChronology({
    kind: "post",
    site: "coomer",
    service: "onlyfans",
    creatorId: "creator-2",
    postId: "post-9",
    favoritedAt: new Date("2026-03-19T11:00:00.000Z"),
  });

  let creatorEntries = await store.listFavoriteChronology({ kind: "creator" });
  let postEntries = await store.listFavoriteChronology({ kind: "post" });

  assert.equal(creatorEntries.length, 1);
  assert.equal(creatorEntries[0].creatorId, "creator-1");
  assert.equal(creatorEntries[0].postId, null);
  assert.equal(creatorEntries[0].favoritedAt.toISOString(), "2026-03-19T10:00:00.000Z");

  assert.equal(postEntries.length, 1);
  assert.equal(postEntries[0].creatorId, "creator-2");
  assert.equal(postEntries[0].postId, "post-9");
  assert.equal(postEntries[0].favoritedAt.toISOString(), "2026-03-19T11:00:00.000Z");

  await store.deleteFavoriteChronology({
    kind: "post",
    site: "coomer",
    service: "onlyfans",
    creatorId: "creator-2",
    postId: "post-9",
  });

  creatorEntries = await store.listFavoriteChronology({ kind: "creator" });
  postEntries = await store.listFavoriteChronology({ kind: "post" });

  assert.equal(creatorEntries.length, 1);
  assert.equal(postEntries.length, 0);
});


test("local data store persists favorite snapshots for creators and posts", async (t) => {
  const { tempDir, databaseUrl } = createTempDatabaseCopy();
  const store = await createLocalDataStore({ databaseUrl });

  t.after(async () => {
    await store.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await store.setFavoriteSnapshot({
    kind: "creator",
    site: "coomer",
    data: [{ id: "creator-1", name: "Maple" }],
    updatedAt: new Date("2026-03-19T10:00:00.000Z"),
  });
  await store.setFavoriteSnapshot({
    kind: "post",
    site: "kemono",
    data: [{ id: "post-1", title: "Hello" }],
    updatedAt: new Date("2026-03-19T11:00:00.000Z"),
  });

  const creatorSnapshot = await store.getFavoriteSnapshot({ kind: "creator", site: "coomer" });
  const postSnapshot = await store.getFavoriteSnapshot({ kind: "post", site: "kemono" });

  assert.deepEqual(JSON.parse(creatorSnapshot?.data ?? "[]"), [{ id: "creator-1", name: "Maple" }]);
  assert.deepEqual(JSON.parse(postSnapshot?.data ?? "[]"), [{ id: "post-1", title: "Hello" }]);
  assert.equal(creatorSnapshot?.kind, "creator");
  assert.equal(postSnapshot?.kind, "post");
});


test("local data store persists creator snapshots for profiles and post pages", async (t) => {
  const { tempDir, databaseUrl } = createTempDatabaseCopy();
  const store = await createLocalDataStore({ databaseUrl });

  t.after(async () => {
    await store.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await store.setCreatorSnapshot({
    kind: "profile",
    site: "coomer",
    service: "fansly",
    creatorId: "creator-7",
    data: { id: "creator-7", name: "ClaireMoon" },
    updatedAt: new Date("2026-03-19T12:00:00.000Z"),
  });
  await store.setCreatorSnapshot({
    kind: "posts",
    site: "coomer",
    service: "fansly",
    creatorId: "creator-7",
    offset: 50,
    data: [{ id: "post-1", title: "Warm post" }],
    updatedAt: new Date("2026-03-19T12:05:00.000Z"),
  });

  const profileSnapshot = await store.getCreatorSnapshot({
    kind: "profile",
    site: "coomer",
    service: "fansly",
    creatorId: "creator-7",
  });
  const postsSnapshot = await store.getCreatorSnapshot({
    kind: "posts",
    site: "coomer",
    service: "fansly",
    creatorId: "creator-7",
    offset: 50,
  });

  assert.deepEqual(JSON.parse(profileSnapshot?.data ?? "null"), { id: "creator-7", name: "ClaireMoon" });
  assert.deepEqual(JSON.parse(postsSnapshot?.data ?? "[]"), [{ id: "post-1", title: "Warm post" }]);
  assert.equal(profileSnapshot?.kind, "profile");
  assert.equal(postsSnapshot?.kind, "posts");
});
