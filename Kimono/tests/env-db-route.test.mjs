import test from "node:test";
import assert from "node:assert/strict";

function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

test("env-db route exposes only sanitized database url diagnostics", async () => {
  await withEnv(
    {
      DATABASE_URL:
        "mysql://dosa4307_kimono:b9T2NJ3924vj3UhBbn2T@localhost:3306/dosa4307_kimono",
    },
    async () => {
      const { collectDatabaseUrlDebugPayload } = await import("../lib/auth-debug-route.ts");
      const payload = collectDatabaseUrlDebugPayload();

      assert.equal(payload.ok, true);
      assert.equal(payload.databaseUrlConfigured, true);
      assert.equal(payload.databaseUrlDebug.scheme, "mysql");
      assert.equal(payload.databaseUrlDebug.hasCredentials, true);
      assert.equal(payload.databaseUrlDebug.hasHostname, true);
      assert.equal(payload.databaseUrlDebug.hasPort, true);
      assert.equal(payload.databaseUrlDebug.hasDatabaseName, true);
      assert.equal(typeof payload.databaseUrlDebug.valueHash, "string");
      assert.equal(payload.databaseUrlDebug.valueHash.length, 12);
      assert.equal("username" in payload.databaseUrlDebug, false);
      assert.equal("hostname" in payload.databaseUrlDebug, false);
      assert.equal("port" in payload.databaseUrlDebug, false);
      assert.equal("databaseName" in payload.databaseUrlDebug, false);
      assert.equal("passwordLength" in payload.databaseUrlDebug, false);
      assert.equal("passwordPreviewStart" in payload.databaseUrlDebug, false);
      assert.equal("passwordPreviewEnd" in payload.databaseUrlDebug, false);
      assert.equal("password" in payload.databaseUrlDebug, false);
      assert.equal("rawValue" in payload.databaseUrlDebug, false);
    }
  );
});
