import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readWorkspaceFile(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("creator filtered search route exists and delegates to the dedicated hybrid search service", () => {
  const routePath = path.join(process.cwd(), "app", "api", "creator-posts", "search", "route.ts");
  assert.equal(fs.existsSync(routePath), true, "expected /api/creator-posts/search route to exist");

  const source = fs.readFileSync(routePath, "utf8");
  assert.match(source, /searchCreatorPosts/);
  assert.match(source, /page/);
  assert.match(source, /perPage/);
});

test("creator page uses the dedicated filtered search endpoint instead of local snapshot scope", () => {
  const source = readWorkspaceFile("app/(protected)/creator/[site]/[service]/[id]/page.tsx");

  assert.match(source, /\/api\/creator-posts\/search/);
  assert.doesNotMatch(source, /scope=snapshot/);
  assert.doesNotMatch(source, /local snapshot/);
});

test("proxy matcher keeps the filtered creator search endpoint public", () => {
  const proxySource = readWorkspaceFile("proxy.ts");
  assert.equal(
    proxySource.includes('"/api/creator-posts/search"'),
    false,
    "/api/creator-posts/search should stay public so creator filters can fetch JSON without login redirects"
  );
});
