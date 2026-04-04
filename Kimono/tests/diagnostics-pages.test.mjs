import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("diagnostics pages exist and the temporary runtime env probe is removed", () => {
  assert.equal(existsSync(new URL("../app/(main)/health/page.tsx", import.meta.url)), true);
  assert.equal(existsSync(new URL("../app/(main)/logs/page.tsx", import.meta.url)), true);
  assert.equal(existsSync(new URL("../app/(main)/auth-debug/page.tsx", import.meta.url)), true);
  assert.equal(existsSync(new URL("../app/(main)/admin/layout.tsx", import.meta.url)), true);
  assert.equal(existsSync(new URL("../app/(main)/admin/health/page.tsx", import.meta.url)), true);
  assert.equal(existsSync(new URL("../app/(main)/admin/logs/page.tsx", import.meta.url)), true);
  assert.equal(existsSync(new URL("../app/(main)/admin/db/page.tsx", import.meta.url)), true);
  assert.equal(existsSync(new URL("../app/(main)/admin/actions/page.tsx", import.meta.url)), true);
  assert.equal(existsSync(new URL("../app/(main)/admin/sessions/page.tsx", import.meta.url)), true);
  assert.equal(existsSync(new URL("../app/api/runtime-env-probe/route.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../lib/runtime-env-probe.ts", import.meta.url)), false);

  const adminSource = readFileSync(new URL("../app/(main)/admin/page.tsx", import.meta.url), "utf8");
  assert.match(adminSource, /getAdminDashboardData/);
  assert.match(adminSource, /Dashboard/i);
  assert.doesNotMatch(adminSource, /runtime-env-probe/);
});
