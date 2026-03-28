import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  getProxyDecision,
  getProtectedLayoutState,
  getLoginRedirectTarget,
  shouldShowSecurityControls,
  getTotpSetupAvailability,
  shouldEnableCredentialAuth,
} from "../lib/auth-guards.ts";

test("getProxyDecision allows protected routes in local dev mode without a token", () => {
  assert.deepEqual(
    getProxyDecision({
      localDevMode: true,
      pathname: "/search",
      token: null,
    }),
    { type: "allow" }
  );
});

test("getProxyDecision redirects anonymous users to login outside local dev mode", () => {
  assert.deepEqual(
    getProxyDecision({
      localDevMode: false,
      pathname: "/favorites",
      token: null,
    }),
    {
      type: "redirect-login",
      pathname: "/login",
      searchParams: {
        callbackUrl: "/favorites",
      },
    }
  );
});

test("getProxyDecision redirects TOTP-pending sessions to the login challenge step", () => {
  assert.deepEqual(
    getProxyDecision({
      localDevMode: false,
      pathname: "/discover",
      token: {
        needsTotp: true,
      },
    }),
    {
      type: "redirect-login",
      pathname: "/login",
      searchParams: {
        step: "totp",
      },
    }
  );
});

test("getProtectedLayoutState bypasses session requirements in local dev mode", () => {
  assert.equal(
    getProtectedLayoutState({
      localDevMode: true,
      status: "unauthenticated",
      session: null,
    }),
    "ready"
  );
});

test("getProtectedLayoutState preserves loading and redirect behavior in production mode", () => {
  assert.equal(
    getProtectedLayoutState({
      localDevMode: false,
      status: "loading",
      session: null,
    }),
    "loading"
  );

  assert.equal(
    getProtectedLayoutState({
      localDevMode: false,
      status: "unauthenticated",
      session: null,
    }),
    "redirect"
  );
});

test("local login redirection and security controls reflect local dev mode", () => {
  assert.equal(getLoginRedirectTarget(true), "/search");
  assert.equal(getLoginRedirectTarget(false), null);
  assert.equal(shouldShowSecurityControls(true), false);
  assert.equal(shouldShowSecurityControls(false), true);
});

test("local auth guards disable credential auth and TOTP setup", () => {
  assert.equal(shouldEnableCredentialAuth(true), false);
  assert.equal(shouldEnableCredentialAuth(false), true);
  assert.equal(getTotpSetupAvailability(true), "disabled");
  assert.equal(getTotpSetupAvailability(false), "enabled");
});

test("proxy matcher keeps public content APIs out of auth redirects", () => {
  const proxySource = fs.readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");

  for (const route of [
    "/api/posts/popular",
    "/api/creators/search",
    "/api/posts/recent",
    "/api/media/",
    "/api/media/warm",
    "/api/media/download",
  ]) {
    assert.equal(
      proxySource.includes(`"${route}"`),
      false,
      `${route} should stay public so listing pages can fetch JSON without a login redirect`
    );
  }
});
