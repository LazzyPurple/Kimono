import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("CreatorCard surfaces popularity and formats service labels for search results", () => {
  const source = read("components/CreatorCard.tsx");

  assert.match(source, /function formatServiceLabel/);
  assert.match(source, /favorited != null/);
  assert.match(source, /toLocaleString\(/);
  assert.match(source, /formatServiceLabel\(service\)/);
});
