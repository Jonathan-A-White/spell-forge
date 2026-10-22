// mw-vmx5cb.6: the grist photo mimes and file types are read from bsv-kit (grist.PHOTO_MIMES, grist.GRIST_FILE_TYPES),
// not copied: no list of them in src/, and the grinds' image and audio lists equal the kit's.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { grist } from 'bsv-kit/grist';
import * as grist_ from '../../src/grist';

const root = process.cwd();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

/** Lines of src/ that carry `needle`, as `path:line`. */
function linesWith(needle: RegExp): string[] {
  return sourceFiles(join(root, 'src')).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((text, index) => (needle.test(text) ? [`${relative(root, file)}:${index + 1}`] : [])),
  );
}

describe('the grist file types come from bsv-kit', () => {
  it('src/ names image/png and image/webp nowhere: a list of photo mimes is the kit\'s', () => {
    expect(linesWith(/image\/(png|webp)/)).toEqual([]);
  });

  it("image/jpeg appears in src/ only as a canvas encoder's output type, never in a list", () => {
    const hits = linesWith(/image\/jpeg/).map((hit) => hit.split(':')[0]);
    // the OCR preprocessor and the photo shrinker both encode TO a JPEG; neither lists what a grist accepts
    expect([...new Set(hits)].sort()).toEqual(['src/grist/shrink-photo.ts', 'src/ocr/preprocess.ts']);
  });

  it('src/grist no longer exports a mime list of its own', () => {
    expect('GRIST_MIMES' in grist_).toBe(false);
  });

  it("every grind's image mimes equal grist.PHOTO_MIMES and its audio mimes are within grist.AUDIO_MIMES", () => {
    for (const kind of ['tutor-turn', 'word-list', 'parent-ask']) {
      const grind = JSON.parse(readFileSync(join(root, 'grinds', `${kind}.json`), 'utf8')) as { attachments?: { max: number; mime?: string[] } };
      const mimes = grind.attachments?.mime ?? [];
      if (grind.attachments?.max === 0 || mimes.length === 0) continue;
      expect(mimes.filter((m) => m.startsWith('image/')), kind).toEqual([...grist.PHOTO_MIMES]);
      for (const audio of mimes.filter((m) => m.startsWith('audio/'))) expect(grist.AUDIO_MIMES, kind).toContain(audio);
    }
  });

  it("the shrinker's pass-through accepts exactly the kit's photo types", async () => {
    for (const type of grist.PHOTO_MIMES) {
      const out = await grist_.shrinkPhoto(new Blob([new Uint8Array(10)], { type }), async () => new Uint8Array([1]));
      expect(out.mime).toBe(type);
    }
    const gif = await grist_.shrinkPhoto(new Blob([new Uint8Array(10)], { type: 'image/gif' }), async () => new Uint8Array([1]));
    expect(gif.mime).toBe('image/jpeg');
  });
});
