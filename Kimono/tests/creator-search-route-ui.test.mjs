import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readWorkspaceFile(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("creator posts route handles filtered search within the unified endpoint", () => {
  const routePath = path.join(process.cwd(), "app", "api", "creators", "[site]", "[service]", "[id]", "posts", "route.ts");
  assert.equal(fs.existsSync(routePath), true, "expected /api/creators/[site]/[service]/[id]/posts route to exist");

  const source = fs.readFileSync(routePath, "utf8");
  assert.match(source, /fetchFilteredCreatorPosts/);
  assert.match(source, /CREATOR_FILTER_SCAN_LIMIT/);
  assert.match(source, /persistCreatorPosts/);
  assert.match(source, /media/);
  assert.match(source, /query/);
});

test("creator page uses the unified creator posts endpoint instead of local snapshot scope", () => {
  const source = readWorkspaceFile("app/(protected)/creator/[site]/[service]/[id]/page.tsx");

  assert.match(source, /\/api\/creators\/\$\{site\}\/\$\{service\}\/\$\{id\}\/posts/);
  assert.doesNotMatch(source, /scope=snapshot/);
  assert.doesNotMatch(source, /local snapshot/);
});

test("proxy matcher keeps creator content APIs public", () => {
  const proxySource = readWorkspaceFile("proxy.ts");
  assert.equal(
    proxySource.includes('"/api/creators/search"'),
    false,
    "/api/creators/search should stay public so creator filters can fetch JSON without login redirects"
  );
});
