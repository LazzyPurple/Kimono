import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";


function createTempDatabaseCopy() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimono-snapshot-"));
  const dbPath = path.join(tempDir, "dev.db");
  fs.copyFileSync(path.join(process.cwd(), "prisma", "dev.db"), dbPath);

  return {
    tempDir,
    databaseUrl: `file:${dbPath.replace(/\\/g, "/")}`,
  };
}

function read(filePath) {
  return fs.readFileSync(path.join(process.cwd(), filePath), "utf8");
}

test("favorites payloads expose reliability metadata for favorite dates and snapshot freshness", () => {
  const creatorRoute = read("lib/kimono-favorites-route.ts");
  const postsRoute = read("lib/likes-posts-route.ts");

  for (const source of [creatorRoute, postsRoute]) {
    assert.match(source, /favoriteDateKnown/);
    assert.match(source, /favoriteOrderSource/);
    assert.match(source, /snapshotUpdatedAt/);
    assert.match(source, /stale/);
  }
});

test("creator page promotes media filters and in-page search to the dedicated filtered search endpoint", () => {
  const source = read("app/(protected)/creator/[site]/[service]/[id]/page.tsx");

  assert.match(source, /\/api\/creators\/\$\{site\}\/\$\{service\}\/\$\{id\}\/posts/);
  assert.doesNotMatch(source, /scope=snapshot/);
  assert.doesNotMatch(source, /local snapshot/);
});

test("discover compute can read favorite snapshots before hitting upstream account favorites", () => {
  const source = read("app/api/discover/compute/route.ts");

  assert.match(source, /getFavoriteSnapshot/);
});


test("discover compute is snapshot-only and no longer falls back to live account favorites", () => {
  const source = read("app/api/discover/compute/route.ts");

  assert.doesNotMatch(source, /getKimonoSessions/);
  assert.doesNotMatch(source, /account\/favorites?type=artist/);
  assert.match(source, /source: "snapshot-only"/);
});

test("health diagnostics are exposed through both API and admin page routes", () => {
  const apiRoute = read("app/api/health/route.ts");
  const page = read("app/admin/health/page.tsx");

  assert.match(apiRoute, /getServerHealthPayload/);
  assert.match(page, /Santé/);
  assert.match(page, /getServerHealthPayload/);
});
