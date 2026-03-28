import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

test("preview asset route rejects invalid byte ranges with 416", () => {
  const source = fs.readFileSync(
    path.join(root, "app/api/media/preview/[...path]/route.ts"),
    "utf8"
  );

  assert.match(source, /status:\s*416/);
  assert.match(source, /content-range["']:\s*[`"']bytes \*\/\$\{totalSize\}[`"']/);
});
