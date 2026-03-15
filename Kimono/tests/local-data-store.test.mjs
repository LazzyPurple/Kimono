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
