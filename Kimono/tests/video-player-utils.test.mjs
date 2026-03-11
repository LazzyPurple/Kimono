import test from 'node:test';
import assert from 'node:assert/strict';
import * as utils from '../lib/video-player-utils.ts';

const {
  formatPlayerTime,
  getEffectiveDuration,
  getPointerRatio,
  getVideoAreaAction,
} = utils;

test('formatPlayerTime formats mm:ss and hh:mm:ss values', () => {
  assert.equal(typeof formatPlayerTime, 'function');
  assert.equal(formatPlayerTime(0), '0:00');
  assert.equal(formatPlayerTime(65), '1:05');
  assert.equal(formatPlayerTime(3665), '1:01:05');
});

test('getPointerRatio clamps values inside the bar bounds', () => {
  assert.equal(getPointerRatio(-20, 100, 200), 0);
  assert.equal(getPointerRatio(200, 100, 200), 0.5);
  assert.equal(getPointerRatio(500, 100, 200), 1);
});

test('getVideoAreaAction splits the player into previous, toggle and next zones', () => {
  assert.equal(getVideoAreaAction(120, 100, 300), 'seek-backward');
  assert.equal(getVideoAreaAction(250, 100, 300), 'toggle-fit');
  assert.equal(getVideoAreaAction(360, 100, 300), 'seek-forward');
});

test('getEffectiveDuration falls back to the seekable range when duration is invalid', () => {
  const video = {
    duration: Number.NaN,
    seekable: {
      length: 1,
      end(index) {
        assert.equal(index, 0);
        return 92;
      },
    },
  };

  assert.equal(getEffectiveDuration(video), 92);
  assert.equal(getEffectiveDuration(null), 0);
});