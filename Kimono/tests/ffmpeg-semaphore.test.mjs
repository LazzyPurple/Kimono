import test from "node:test";
import assert from "node:assert/strict";

import { createFfmpegSemaphore } from "../lib/ffmpeg-semaphore.ts";

test("ffmpeg semaphore limits concurrent access to the configured maximum", async () => {
  const semaphore = createFfmpegSemaphore(2);
  const log = [];

  const worker = async (id) => {
    const release = await semaphore.acquire();
    log.push(`start-${id}`);
    assert.ok(semaphore.active <= 2, `active should be <= 2, got ${semaphore.active}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    log.push(`end-${id}`);
    release();
  };

  await Promise.all([worker("a"), worker("b"), worker("c"), worker("d")]);

  assert.equal(log.length, 8);
  assert.equal(semaphore.active, 0);
  assert.equal(semaphore.pending, 0);
});

test("ffmpeg semaphore resolves immediately when under the limit", async () => {
  const semaphore = createFfmpegSemaphore(4);
  const release1 = await semaphore.acquire();
  const release2 = await semaphore.acquire();

  assert.equal(semaphore.active, 2);
  assert.equal(semaphore.pending, 0);

  release1();
  release2();

  assert.equal(semaphore.active, 0);
});

test("ffmpeg semaphore queues requests when at capacity", async () => {
  const semaphore = createFfmpegSemaphore(1);
  const release = await semaphore.acquire();

  assert.equal(semaphore.active, 1);

  let secondAcquired = false;
  const secondPromise = semaphore.acquire().then((releaseSecond) => {
    secondAcquired = true;
    return releaseSecond;
  });

  assert.equal(semaphore.pending, 1);
  assert.equal(secondAcquired, false);

  release();

  const releaseSecond = await secondPromise;
  assert.equal(secondAcquired, true);
  assert.equal(semaphore.active, 1);
  assert.equal(semaphore.pending, 0);

  releaseSecond();
  assert.equal(semaphore.active, 0);
});
