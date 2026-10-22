// The worker takes a share from another app: a POST to the share target parks the pictures and words in Dexie and answers with a redirect to
// the tutor; a GET to the same path is a page load and is left to the app. src/sw.ts runs here as if it were the worker, and
// src/share/share-target.ts hands the parked share over once. The manifest's share_target is held equal to the worker's path.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerTo, picture, post, SCOPE, startWorker } from '../support/share-worker';
import { shareDb } from '../../src/share/share-store';
import { SHARE_FILE_ACCEPT, SHARE_FILES_FIELD, SHARE_TARGET_PATH, shareIdFromHash, takeShare, tutorShareHash } from '../../src/share/share-target';

vi.mock('workbox-precaching', () => ({ precacheAndRoute: vi.fn(), createHandlerBoundToURL: vi.fn() }));
vi.mock('workbox-routing', () => ({ registerRoute: vi.fn(), NavigationRoute: class {} }));

beforeAll(startWorker);
beforeEach(() => shareDb.shares.clear());
afterAll(() => shareDb.close());

function sharePost(): Request {
  const form = new FormData();
  form.append('files', picture('one.png', [1, 2, 3]));
  form.append('title', 'Homework');
  form.append('text', 'Question 4');
  return post(form);
}

describe('the worker taking a share', () => {
  it('parks a picture and the words as one pending share and redirects to the tutor', async () => {
    const answer = await answerTo(sharePost());
    expect(answer?.status).toBe(303);
    const rows = await shareDb.shares.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].files.map((f) => [f.name, f.type])).toEqual([['one.png', 'image/png']]);
    expect(Array.from(new Uint8Array(rows[0].files[0].bytes))).toEqual([1, 2, 3]);
    expect(rows[0].text).toBe('Homework\nQuestion 4');
    const to = new URL(answer?.headers.get('Location') ?? '');
    expect(to.pathname).toBe('/spell-forge/');
    expect(to.hash).toBe(tutorShareHash(rows[0].id));
  });

  it('keeps one share only: a second replaces the first', async () => {
    await answerTo(sharePost());
    await answerTo(sharePost());
    expect(await shareDb.shares.count()).toBe(1);
  });

  it('parks a share of words alone, with no files', async () => {
    const form = new FormData();
    form.append('text', 'https://example.org/page');
    await answerTo(post(form));
    const rows = await shareDb.shares.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].files).toEqual([]);
    expect(rows[0].text).toBe('https://example.org/page');
  });

  it('answers a share with nothing in it by opening Home, and parks nothing', async () => {
    const answer = await answerTo(post(new FormData()));
    expect(new URL(answer?.headers.get('Location') ?? '').hash).toBe('');
    expect(await shareDb.shares.count()).toBe(0);
  });

  it('answers a share it cannot read by opening Home', async () => {
    const broken = { method: 'POST', url: new URL(SHARE_TARGET_PATH, SCOPE).href, formData: async () => Promise.reject(new Error('bad body')) } as unknown as Request;
    const answer = await answerTo(broken);
    expect(answer?.status).toBe(303);
    expect(new URL(answer?.headers.get('Location') ?? '').hash).toBe('');
  });

  it('does not answer a GET to the share URL, nor a POST anywhere else', async () => {
    expect(await answerTo(new Request(new URL(SHARE_TARGET_PATH, SCOPE).href))).toBeUndefined();
    expect(await answerTo(post(new FormData(), 'elsewhere'))).toBeUndefined();
    expect(await shareDb.shares.count()).toBe(0);
  });
});

describe('the page taking the parked share', () => {
  it('returns the share once, with its pictures as files and its words', async () => {
    const answer = await answerTo(sharePost());
    const id = shareIdFromHash(new URL(answer?.headers.get('Location') ?? '').hash) ?? undefined;
    const taken = await takeShare(id);
    expect(taken?.text).toBe('Homework\nQuestion 4');
    expect(taken?.pictures.map((file) => [file.name, file.type, file.size])).toEqual([['one.png', 'image/png', 3]]);
    expect(await takeShare(id)).toBeUndefined();
  });

  it('leaves out a file that is not a picture', async () => {
    const form = new FormData();
    form.append('files', picture('notes.txt', [1], 'text/plain'));
    form.append('text', 'See the notes');
    await answerTo(post(form));
    const taken = await takeShare();
    expect(taken?.pictures).toEqual([]);
    expect(taken?.text).toBe('See the notes');
  });

  it('finds nothing when nothing waits', async () => {
    expect(await takeShare('nothing-here')).toBeUndefined();
  });

  it('reads the share id out of the address the worker redirects to, and nothing out of another address', () => {
    expect(shareIdFromHash(tutorShareHash('17-ab c'))).toBe('17-ab c');
    expect(shareIdFromHash('')).toBeNull();
    expect(shareIdFromHash('#/tutor')).toBeNull();
    expect(shareIdFromHash('#/tutor?share=')).toBeNull();
    expect(shareIdFromHash('#/settings')).toBeNull();
  });
});

describe('the manifest declares the share target the worker answers', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8')) as {
    scope: string;
    share_target: { action: string; method: string; enctype: string; params: { title: string; text: string; url: string; files: { name: string; accept: string[] }[] } };
  };

  it('posts multipart to the worker path, relative to the scope, with a title, text, a link and pictures', () => {
    const target = manifest.share_target;
    expect(target.action).toBe(SHARE_TARGET_PATH);
    expect(target.method).toBe('POST');
    expect(target.enctype).toBe('multipart/form-data');
    expect(target.params).toEqual({ title: 'title', text: 'text', url: 'url', files: [{ name: SHARE_FILES_FIELD, accept: SHARE_FILE_ACCEPT }] });
  });

  it('keeps the action under the scope, wherever the app is served', () => {
    for (const base of ['/spell-forge/', '/']) {
      const action = new URL(manifest.share_target.action, `https://example.org${base}manifest.json`);
      expect(action.pathname).toBe(`${base}${SHARE_TARGET_PATH}`);
    }
  });
});
