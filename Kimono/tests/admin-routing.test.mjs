import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const healthPagePath = new URL("../app/health/page.tsx", import.meta.url);
const logsPagePath = new URL("../app/logs/page.tsx", import.meta.url);
const adminHealthPagePath = new URL("../app/admin/health/page.tsx", import.meta.url);
const adminLogsPagePath = new URL("../app/admin/logs/page.tsx", import.meta.url);
const resetRoutePath = new URL("../app/api/admin/actions/reset-db/route.ts", import.meta.url);

test("legacy health page redirects into the admin health section", async () => {
  const source = await readFile(healthPagePath, "utf8");

  assert.match(source, /\/admin\/health/);
});

test("legacy logs page redirects into the admin logs section", async () => {
  const source = await readFile(logsPagePath, "utf8");

  assert.match(source, /\/admin\/logs/);
});

test("admin health and logs pages keep diagnostic access protection", async () => {
  const [healthSource, logsSource] = await Promise.all([
    readFile(adminHealthPagePath, "utf8"),
    readFile(adminLogsPagePath, "utf8"),
  ]);

  assert.match(healthSource, /requireAdminPageAccess/);
  assert.match(logsSource, /requireAdminPageAccess/);
});

test("manual reset action reuses startup DB maintenance instead of boot wiring", async () => {
  const source = await readFile(resetRoutePath, "utf8");

  assert.match(source, /runAdminResetDb/);
});
