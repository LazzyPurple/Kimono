import test from "node:test";
import assert from "node:assert/strict";

import {
  extractDiagnosticAccessToken,
  getDiagnosticAccessDecision,
} from "../lib/diagnostic-access.ts";

test("diagnostic access allows local dev, authenticated sessions, or a matching debug token", () => {
  assert.deepEqual(
    getDiagnosticAccessDecision({
      localDevMode: true,
      session: null,
      providedToken: null,
      env: {},
    }),
    {
      type: "allowed",
      via: "local-dev",
    }
  );

  assert.deepEqual(
    getDiagnosticAccessDecision({
      localDevMode: false,
      session: {
        user: {
          id: "user_123",
        },
      },
      providedToken: null,
      env: {},
    }),
    {
      type: "allowed",
      via: "session",
    }
  );

  assert.deepEqual(
    getDiagnosticAccessDecision({
      localDevMode: false,
      session: {
        user: {
          id: "user_123",
        },
        needsTotp: true,
      },
      providedToken: null,
      env: {
        AUTH_DEBUG_TOKEN: "expected-token",
      },
    }),
    {
      type: "denied",
    }
  );

  assert.deepEqual(
    getDiagnosticAccessDecision({
      localDevMode: false,
      session: null,
      providedToken: "expected-token",
      env: {
        AUTH_DEBUG_TOKEN: "expected-token",
      },
    }),
    {
      type: "allowed",
      via: "debug-token",
    }
  );
});

test("diagnostic token extraction prefers headers and falls back to the query string", () => {
  assert.equal(
    extractDiagnosticAccessToken({
      url: "https://kimono.paracosm.fr/logs?debugToken=query-token",
      headers: new Headers({
        "x-auth-debug-token": "header-token",
      }),
    }),
    "header-token"
  );

  assert.equal(
    extractDiagnosticAccessToken({
      url: "https://kimono.paracosm.fr/logs?debugToken=query-token",
      headers: new Headers(),
    }),
    "query-token"
  );

  assert.equal(
    extractDiagnosticAccessToken({
      url: "https://kimono.paracosm.fr/logs",
      headers: new Headers(),
    }),
    null
  );
});
