import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("home and discover pages reuse browser cache for heavy initial payloads", () => {
  const home = read("app/(protected)/home/page.tsx");
  const discover = read("app/(protected)/discover/page.tsx");

  assert.match(home, /fetchJsonWithBrowserCache<UnifiedPost\[]>/);
  assert.match(home, /key: `recent-posts:\$\{currentOffset\}`/);
  assert.match(discover, /fetchJsonWithBrowserCache<\{ creators\?: DiscoveryCreator\[]; updatedAt\?: string \| null \}>/);
  assert.match(discover, /key: "discover-results"/);
});

test("discover page clamps invalid page params before paginating", () => {
  const discover = read("app/(protected)/discover/page.tsx");
  assert.match(discover, /const rawPageParam = Number\(searchParams\.get\("page"\) \?\? "1"\);/);
  assert.match(discover, /const pageParam = Number\.isFinite\(rawPageParam\) && rawPageParam > 0 \? Math\.trunc\(rawPageParam\) : 1;/);
});
