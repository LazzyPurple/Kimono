import test from "node:test";
import assert from "node:assert/strict";

import { loadStoredKimonoSessionCookie, loadStoredKimonoSessionRecord } from "../lib/remote-session.ts";

test("loadStoredKimonoSessionCookie returns null when the store cannot be created", async () => {
  const cookie = await loadStoredKimonoSessionCookie("kemono", {
    getStore: async () => {
      throw new Error("db down");
    },
  });

  assert.equal(cookie, null);
});

test("loadStoredKimonoSessionRecord returns null when no session exists", async () => {
  const session = await loadStoredKimonoSessionRecord("coomer", {
    getStore: async () => ({
      async getLatestKimonoSession() {
        return null;
      },
      async disconnect() {
        return;
      },
    }),
  });

  assert.equal(session, null);
});

test("loadStoredKimonoSessionCookie returns the latest cookie and disconnects the store", async () => {
  let disconnected = false;

  const cookie = await loadStoredKimonoSessionCookie("coomer", {
    getStore: async () => ({
      async getLatestKimonoSession(site) {
        assert.equal(site, "coomer");
        return {
          id: "session_1",
          site: "coomer",
          cookie: "session-cookie",
          username: "tester",
          savedAt: new Date("2026-03-13T12:00:00.000Z"),
        };
      },
      async disconnect() {
        disconnected = true;
      },
    }),
  });

  assert.equal(cookie, "session-cookie");
  assert.equal(disconnected, true);
});
