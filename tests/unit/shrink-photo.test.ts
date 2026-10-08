// mw-z361n.4: shrinkPhoto gets a photo into what the grinds take (JPEG, PNG or WebP, at most 4 MiB), re-encoding anything else.
import { describe, expect, it } from 'vitest';
import { grist } from 'bsv-kit/grist';
import { shrinkPhoto } from '../../src/grist';

const PHOTO_LIMIT = 4_194_304;

describe('shrinkPhoto', () => {
  const blobOf = (size: number, type: string) => new Blob([new Uint8Array(size).fill(7)], { type });
  const encoded = new Uint8Array([9, 9, 9]);

  it('passes a small jpeg, png or webp through unchanged', async () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      let called = false;
      const out = await shrinkPhoto(blobOf(100, type), async () => {
        called = true;
        return encoded;
      });
      expect(called).toBe(false);
      expect(out.mime).toBe(type);
      expect(out.bytes).toEqual(new Uint8Array(100).fill(7));
    }
  });

  it('passes a photo of exactly the limit through unchanged', async () => {
    const out = await shrinkPhoto(blobOf(PHOTO_LIMIT, 'image/png'), async () => encoded);
    expect(out.bytes.length).toBe(PHOTO_LIMIT);
    expect(out.mime).toBe('image/png');
  });

  it('re-encodes a photo over the limit as JPEG under it', async () => {
    const calls: { type: string; maxBytes: number }[] = [];
    const out = await shrinkPhoto(blobOf(PHOTO_LIMIT + 1, 'image/png'), async (blob, maxBytes) => {
      calls.push({ type: blob.type, maxBytes });
      return encoded;
    });
    expect(calls).toEqual([{ type: 'image/png', maxBytes: PHOTO_LIMIT }]);
    expect(out).toEqual({ bytes: encoded, mime: 'image/jpeg' });
  });

  it('re-encodes a photo of another type (HEIC, GIF, no type) as JPEG', async () => {
    for (const type of ['image/heic', 'image/gif', '']) {
      const out = await shrinkPhoto(blobOf(100, type), async () => encoded);
      expect(out).toEqual({ bytes: encoded, mime: 'image/jpeg' });
    }
  });

  it('throws a GristInputError when the encoder cannot get under the limit', async () => {
    await expect(
      shrinkPhoto(blobOf(PHOTO_LIMIT + 1, 'image/jpeg'), async () => new Uint8Array(PHOTO_LIMIT + 1)),
    ).rejects.toBeInstanceOf(grist.GristInputError);
  });

  it('passes the encoder\'s own failure up', async () => {
    await expect(
      shrinkPhoto(blobOf(100, 'image/gif'), async () => {
        throw new Error('cannot decode');
      }),
    ).rejects.toThrow('cannot decode');
  });
});
