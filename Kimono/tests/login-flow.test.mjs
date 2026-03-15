import test from "node:test";
import assert from "node:assert/strict";

import {
  getInitialLoginStep,
  getPostPasswordSuccessAction,
} from "../lib/login-flow.ts";

test("getInitialLoginStep reads the totp query param only when explicitly requested", () => {
  assert.equal(getInitialLoginStep("totp"), "totp");
  assert.equal(getInitialLoginStep("password"), "password");
  assert.equal(getInitialLoginStep(null), "password");
  assert.equal(getInitialLoginStep(undefined), "password");
});

test("getPostPasswordSuccessAction shows the totp step when the session requires it", () => {
  assert.deepEqual(
    getPostPasswordSuccessAction({
      needsTotp: true,
      user: { id: "user_123" },
    }),
    {
      type: "show-totp",
      userId: "user_123",
    }
  );
});

test("getPostPasswordSuccessAction falls back to a hard redirect for non-totp logins", () => {
  assert.deepEqual(getPostPasswordSuccessAction(null), {
    type: "redirect",
    href: "/search",
  });

  assert.deepEqual(
    getPostPasswordSuccessAction({
      needsTotp: false,
      user: { id: "user_123" },
    }),
    {
      type: "redirect",
      href: "/search",
    }
  );
});

test("getPostPasswordSuccessAction also redirects when totp is marked but the session user id is missing", () => {
  assert.deepEqual(
    getPostPasswordSuccessAction({
      needsTotp: true,
      user: {},
    }),
    {
      type: "redirect",
      href: "/search",
    }
  );
});