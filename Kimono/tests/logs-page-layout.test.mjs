import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const logsPagePath = new URL("../app/admin/logs/page.tsx", import.meta.url);

test("logs page keeps a compact responsive layout", async () => {
  const source = await readFile(logsPagePath, "utf8");

  assert.match(source, /lg:grid-cols-\[minmax\(0,1\.15fr\)_minmax\(320px,0\.85fr\)\]/);
  assert.match(source, /max-h-\[26rem\]/);
  assert.match(source, /overflow-auto/);
});

test("logs page surfaces sanitized database url diagnostics", async () => {
  const source = await readFile(logsPagePath, "utf8");

  assert.match(source, /Database URL diagnostics/);
  assert.match(source, /Has credentials/);
  assert.match(source, /Runtime hash/);
  assert.doesNotMatch(source, /Password length/);
});
