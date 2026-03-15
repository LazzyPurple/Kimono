import test from "node:test";
import assert from "node:assert/strict";

import { getProxyTokenOptions } from "../lib/auth-proxy.ts";

test("getProxyTokenOptions forces the secure Auth.js cookie name in production", () => {
  assert.deepEqual(
    getProxyTokenOptions({
      secret: "auth-secret",
      nodeEnv: "production",
    }),
    {
      secret: "auth-secret",
      secureCookie: true,
      cookieName: "__Secure-authjs.session-token",
    }
  );
});

test("getProxyTokenOptions keeps default cookie detection outside production", () => {
  assert.deepEqual(
    getProxyTokenOptions({
      secret: "auth-secret",
      nodeEnv: "development",
    }),
    {
      secret: "auth-secret",
    }
  );
});