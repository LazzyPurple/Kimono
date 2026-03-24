import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("listings keep showing available data while background refreshes are in flight", () => {
  const home = read("app/(protected)/home/page.tsx");
  const discover = read("app/(protected)/discover/page.tsx");
  const popular = read("app/(protected)/popular/[site]/[[...page]]/page.tsx");
  const creator = read("app/(protected)/creator/[site]/[service]/[id]/page.tsx");

  assert.match(home, /const showInitialSkeleton = loading && posts\.length === 0;/);
  assert.match(home, /const showRefreshingState = loading && posts\.length > 0;/);

  assert.match(discover, /const showInitialSkeleton = loading && creators\.length === 0;/);
  assert.match(discover, /const showRefreshingState = loading && creators\.length > 0;/);

  assert.match(popular, /const showInitialSkeleton = loading && \(!data\?\.posts \|\| data\.posts\.length === 0\);/);
  assert.match(popular, /const showRefreshingState = loading && Boolean\(data\?\.posts\?\.length\);/);

  assert.match(creator, /const showInitialPostsSkeleton = \(loadingPosts && !usesFilteredSearch && posts\.length === 0\)\s*\|\| \(loadingSearch && usesFilteredSearch && searchResults\.length === 0\);/);
  assert.match(creator, /const showRefreshingPostsState = \(loadingPosts && !usesFilteredSearch && posts\.length > 0\)\s*\|\| \(loadingSearch && usesFilteredSearch && searchResults\.length > 0\);/);
});
