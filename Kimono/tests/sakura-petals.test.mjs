import test from "node:test";
import assert from "node:assert/strict";

import { createSakuraPetals } from "../lib/sakura-petals.ts";

function parseCssNumber(value, suffix) {
  assert.equal(value.endsWith(suffix), true);
  return Number.parseFloat(value.slice(0, -suffix.length));
}

test("createSakuraPetals returns stable petals for SSR and hydration", () => {
  const first = createSakuraPetals();
  const second = createSakuraPetals();

  assert.equal(first.length, 24);
  assert.deepEqual(first, second);
});

test("createSakuraPetals keeps generated values within the visual bounds", () => {
  for (const petal of createSakuraPetals(8)) {
    const left = parseCssNumber(petal.left, "%");
    const duration = parseCssNumber(petal.animationDuration, "s");
    const delay = parseCssNumber(petal.animationDelay, "s");
    const scale = Number.parseFloat(petal.transform.slice(6, -1));

    assert.equal(left >= -5 && left <= 105, true);
    assert.equal(duration >= 16 && duration <= 36, true);
    assert.equal(delay <= 0 && delay >= -30, true);
    assert.equal(scale >= 0.2 && scale <= 0.55, true);
    assert.equal(
      ["float-petal", "float-petal-reverse"].includes(petal.animationName),
      true
    );
  }
});
