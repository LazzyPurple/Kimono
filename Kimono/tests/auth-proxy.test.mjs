import test from "node:test";
import assert from "node:assert/strict";

import { getProxyTokenOptions } from "../lib/auth-proxy.ts";

test("getProxyTokenOptions uses secure auth cookie in production when AUTH_URL is https", () => {
  assert.deepEqual(
    getProxyTokenOptions({
      secret: "auth-secret",
      nodeEnv: "production",
      authUrl: "https://kimono.example",
    }),
    {
      secret: "auth-secret",
      secureCookie: true,
      cookieName: "__Secure-authjs.session-token",
    }
  );
});

test("getProxyTokenOptions uses non-secure auth cookie in production when AUTH_URL is http", () => {
  assert.deepEqual(
    getProxyTokenOptions({
      secret: "auth-secret",
      nodeEnv: "production",
      authUrl: "http://kimono.example",
    }),
    {
      secret: "auth-secret",
      secureCookie: false,
      cookieName: "authjs.session-token",
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
