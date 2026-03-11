import test from 'node:test';
import assert from 'node:assert/strict';
import * as helpers from '../lib/api/helpers.ts';

const { resolvePostMedia } = helpers;

function makePost(overrides = {}) {
  return {
    id: 'post-1',
    user: 'creator-1',
    service: 'patreon',
    site: 'kemono',
    title: 'Sample post',
    content: '',
    published: '2026-03-10T00:00:00.000Z',
    added: '2026-03-10T00:00:00.000Z',
    edited: '2026-03-10T00:00:00.000Z',
    embed: {},
    file: { name: '', path: '' },
    attachments: [],
    ...overrides,
  };
}

test('resolvePostMedia exposes a direct preview image for image posts', () => {
  assert.equal(typeof resolvePostMedia, 'function');

  const media = resolvePostMedia(
    makePost({
      file: { name: 'cover.jpg', path: '/abc/cover.jpg' },
    })
  );

  assert.deepEqual(media, {
    type: 'image',
    previewImageUrl: 'https://kemono.cr/data/abc/cover.jpg',
    videoUrl: undefined,
  });
});

test('resolvePostMedia falls back to attachment previews for attachment-first services', () => {
  const media = resolvePostMedia(
    makePost({
      service: 'fansly',
      file: { name: '', path: '' },
      attachments: [
        { name: 'clip.mp4', path: '/fan/clip.mp4' },
        { name: 'preview.webp', path: '/fan/preview.webp' },
      ],
    })
  );

  assert.deepEqual(media, {
    type: 'video',
    previewImageUrl: 'https://kemono.cr/data/fan/preview.webp',
    videoUrl: 'https://kemono.cr/data/fan/clip.mp4',
  });
});

test('resolvePostMedia returns a video-only preview when no image exists', () => {
  const media = resolvePostMedia(
    makePost({
      site: 'coomer',
      file: { name: 'video.mp4', path: '/coomer/video.mp4' },
    })
  );

  assert.deepEqual(media, {
    type: 'video',
    previewImageUrl: undefined,
    videoUrl: 'https://coomer.st/data/coomer/video.mp4',
  });
});

test('resolvePostMedia keeps text posts without preview urls', () => {
  const media = resolvePostMedia(makePost());

  assert.deepEqual(media, {
    type: 'text',
    previewImageUrl: undefined,
    videoUrl: undefined,
  });
});