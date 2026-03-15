import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSearchPageTitle,
  buildCreatorPageTitle,
  buildPostPageTitle,
  buildAppPageTitle,
} from "../lib/page-titles.ts";

test("page title helpers build the requested title formats", () => {
  assert.equal(buildSearchPageTitle(), "Search | Kimono");
  assert.equal(buildCreatorPageTitle("Maplestar", "Patreon"), "Maplestar | Patreon");
  assert.equal(buildPostPageTitle("Maplestar", "Patreon"), "Maplestar | Patreon");
  assert.equal(buildAppPageTitle("Favorites"), "Favorites | Kimono");
  assert.equal(buildAppPageTitle(null), "Kimono");
});
