import test from "node:test";
import assert from "node:assert/strict";

import {
  formatVideoDurationLabel,
  pickLongestVideoDuration,
} from "../lib/media-card-utils.ts";

test("pickLongestVideoDuration returns the largest known duration", () => {
  assert.equal(pickLongestVideoDuration([12, 95, 48]), 95);
  assert.equal(pickLongestVideoDuration([undefined, null, 0]), null);
});

test("formatVideoDurationLabel formats durations for card overlays", () => {
  assert.equal(formatVideoDurationLabel(5), "0:05");
  assert.equal(formatVideoDurationLabel(75), "1:15");
  assert.equal(formatVideoDurationLabel(3671), "1:01:11");
  assert.equal(formatVideoDurationLabel(null), null);
});
