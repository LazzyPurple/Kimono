import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const adminSidebarPath = new URL("../components/admin/AdminSidebar.tsx", import.meta.url);
const adminDashboardPath = new URL("../app/admin/page.tsx", import.meta.url);
const adminActionsPath = new URL("../app/admin/actions/page.tsx", import.meta.url);

test("admin layout exposes the six diagnostic sections in the sidebar", async () => {
  const source = await readFile(adminSidebarPath, "utf8");

  for (const href of [
    "/admin",
    "/admin/logs",
    "/admin/db",
    "/admin/actions",
    "/admin/sessions",
    "/admin/health",
  ]) {
    assert.match(source, new RegExp(href.replaceAll("/", "\\/")));
  }
});

test("admin dashboard surfaces core operator KPIs", async () => {
  const source = await readFile(adminDashboardPath, "utf8");

  for (const label of [
    "Total creators Kemono",
    "Total creators Coomer",
    "Sessions actives",
    "Previews generated",
    "Sources video en cache",
    "Taille disque media",
    "Derniere sync CreatorIndex",
  ]) {
    assert.match(source, new RegExp(label));
  }
});

test("admin actions page keeps the manual maintenance controls available", async () => {
  const source = await readFile(adminActionsPath, "utf8");

  for (const label of [
    "Reset DB",
    "Re-sync CreatorIndex",
    "Re-sync Popular",
    "Re-sync Favoris",
    "Purge Media",
    "Clear Cooldown",
  ]) {
    assert.match(source, new RegExp(label));
  }
});
