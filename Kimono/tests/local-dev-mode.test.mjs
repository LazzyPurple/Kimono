import test from "node:test";
import assert from "node:assert/strict";

import { resolveLocalDevMode, parseBooleanFlag } from "../lib/local-dev-mode.ts";

test("parseBooleanFlag only enables explicit truthy values", () => {
  assert.equal(parseBooleanFlag("true"), true);
  assert.equal(parseBooleanFlag("TRUE"), true);
  assert.equal(parseBooleanFlag("1"), true);
  assert.equal(parseBooleanFlag("false"), false);
  assert.equal(parseBooleanFlag("0"), false);
  assert.equal(parseBooleanFlag(undefined), false);
});

test("resolveLocalDevMode only enables local mode when LOCAL_DEV_MODE is explicitly truthy", () => {
  assert.equal(
    resolveLocalDevMode({
      LOCAL_DEV_MODE: "true",
    }),
    true
  );

  assert.equal(
    resolveLocalDevMode({
      LOCAL_DEV_MODE: "false",
    }),
    false
  );
});

test("resolveLocalDevMode ignores NEXT_PUBLIC_LOCAL_DEV_MODE and defaults to false", () => {
  assert.equal(
    resolveLocalDevMode({
      NEXT_PUBLIC_LOCAL_DEV_MODE: "true",
    }),
    false
  );

  assert.equal(resolveLocalDevMode({}), false);
});

test("resolveLocalDevMode is forced off in production", () => {
  assert.equal(
    resolveLocalDevMode({
      LOCAL_DEV_MODE: "true",
      NODE_ENV: "production",
    }),
    false
  );

  assert.equal(
    resolveLocalDevMode({
      LOCAL_DEV_MODE: "1",
      NODE_ENV: "development",
    }),
    true
  );
});
