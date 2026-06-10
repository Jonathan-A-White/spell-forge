// @vitest-environment node
/// <reference types="node" />
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { cleanWords, normalizeWhitespace } from '../../src/ocr/utils.ts';
import { correctOcrWords } from '../../src/ocr/spell-check.ts';
import { recognizeWithOrientationDetection } from '../../src/ocr/preprocess.ts';
import type { ImageOps } from '../../src/ocr/preprocess.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// All words visible in the fixture image after cleanWords + spell-check processing:
// - "Unit 3, WK 6" header → "unit" (3/wk/6 filtered as non-alpha or too short)
// - 10 spelling words: badge edge judge pace mice peace huge giraffe gems price
// - "Challenge Words" header → "challenge", "words"
// - 3 challenge words: celebrate emergency message
// - "High Frequency Words" header → "high", "frequency", "words" (deduped)
// - 2 high-frequency words: group almost
const EXPECTED_WORDS = [
  'unit',
  'badge',
  'edge',
  'judge',
  'pace',
  'mice',
  'peace',
  'huge',
  'giraffe',
  'gems',
  'price',
  'challenge',
  'words',
  'celebrate',
  'emergency',
  'message',
  'high',
  'frequency',
  'group',
  'almost',
];

/**
 * Helper: create a Tesseract worker with local language data (no CDN fetch).
 */
async function createTestWorker(): Promise<Tesseract.Worker> {
  const Tesseract = await import('tesseract.js');
  const langPath = resolve(__dirname, '../fixtures/tessdata');
  return Tesseract.createWorker('eng', undefined, {
    langPath,
    gzip: false,
  });
}

/**
 * Helper: load the fixture image as a Buffer.
 */
function loadFixtureImage(): Buffer {
  return readFileSync(
    resolve(__dirname, '../fixtures/spelling-list-unit3-wk6.jpg'),
  );
}

/**
 * Integration test: runs a real spelling-list photo through the full local
 * Tesseract.js OCR pipeline — including orientation detection — and verifies
 * the extracted word list.
 *
 * The fixture image reproduces a classroom spelling list (Unit 3, WK 6)
 * with text rotated 90° counter-clockwise, as commonly photographed by
 * parents/teachers.
 */
describe('OCR image integration', () => {
  it('extracts the correct word list from a rotated spelling-list photo', async () => {
    const imageBuffer = loadFixtureImage();
    const worker = await createTestWorker();

    // Run OCR with orientation detection (tries 0°, 90°, 180°, 270°)
    const { text, confidence } = await recognizeWithOrientationDetection(
      worker,
      imageBuffer,
    );
    await worker.terminate();

    // Run through the same cleanup pipeline as LocalOcrProvider
    const rawText = normalizeWhitespace(text);
    const words = correctOcrWords(cleanWords(rawText));

    expect(confidence).toBeGreaterThan(0);

    // Sort both arrays to compare contents regardless of OCR line order
    // (rotated images may produce different reading orders)
    expect([...words].sort()).toEqual([...EXPECTED_WORDS].sort());
  }, 120_000); // Tesseract can be slow with multiple orientation attempts

});

// ─── Real-photo regression suite ─────────────────────────────────────────────
//
// Fixtures are downscaled variants of an actual phone photo of a classroom
// spelling list (Unit 5, WK 6 — purple paper, graph-paper background, staple,
// uneven lighting). Camera import historically failed on exactly this kind of
// photo while passing on the clean synthetic fixture above.
//
// Variants cover the rotations and metadata real phones produce:
//  - upright           pixels upright, no EXIF
//  - 90cw / 90ccw /180 physically rotated pixels, no EXIF
//  - skew7             upright but tilted 7° (handheld shot)
//  - exif6             pixels stored 90° CCW + little-endian EXIF orientation 6,
//                      exactly what Android cameras emit in portrait mode and
//                      exactly the case Tesseract.js's own EXIF sniffing misses

/** The 15 spelling words on the photographed list. */
const REAL_PHOTO_WORDS = [
  'action', 'fraction', 'motion', 'addition', 'vision', 'tension', 'turtle',
  'angle', 'purple', 'sparkle', 'rectangle', 'triangle', 'condition',
  'toward', 'against',
];

/** Headers on the list that legitimately OCR into extra words. */
const REAL_PHOTO_HEADER_WORDS = [
  'unit', 'challenge', 'words', 'high', 'frequency',
];

/**
 * Node implementation of ImageOps backed by sharp, mirroring the browser
 * canvas implementation: normalize applies EXIF + downscales + pads white;
 * rotate turns by quarters with dimension swap. This lets the integration
 * tests exercise the exact orientation-detection logic the browser runs.
 */
function createSharpImageOps(): ImageOps {
  const MAX_DIMENSION = 1800;
  return {
    async normalize(image: Blob): Promise<Blob | null> {
      const input = Buffer.from(await image.arrayBuffer());
      const out = await sharp(input)
        .rotate() // applies EXIF orientation
        .resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 92 })
        .toBuffer();
      return new Blob([new Uint8Array(out)], { type: 'image/jpeg' });
    },
    async rotate(image: Blob, quarterTurns: 1 | 2 | 3): Promise<Blob | null> {
      const input = Buffer.from(await image.arrayBuffer());
      const out = await sharp(input)
        .rotate(quarterTurns * 90)
        .jpeg({ quality: 92 })
        .toBuffer();
      return new Blob([new Uint8Array(out)], { type: 'image/jpeg' });
    },
    async rotateSmall(image: Blob, degrees: number): Promise<Blob | null> {
      // Mirror the canvas implementation: rotate about the center keeping
      // the original canvas size, with mid-gray corner fill.
      const input = Buffer.from(await image.arrayBuffer());
      const { width = 0, height = 0 } = await sharp(input).metadata();
      const rotated = await sharp(input)
        .rotate(degrees, { background: '#808080' })
        .toBuffer();
      const { width: rw = 0, height: rh = 0 } = await sharp(rotated).metadata();
      const out = await sharp(rotated)
        .extract({
          left: Math.round((rw - width) / 2),
          top: Math.round((rh - height) / 2),
          width,
          height,
        })
        .jpeg({ quality: 92 })
        .toBuffer();
      return new Blob([new Uint8Array(out)], { type: 'image/jpeg' });
    },
  };
}

function loadFixtureBlob(name: string): Blob {
  const buf = readFileSync(resolve(__dirname, '../fixtures', name));
  return new Blob([new Uint8Array(buf)], { type: 'image/jpeg' });
}

describe('OCR real-photo regression suite', () => {
  let worker: Tesseract.Worker;

  beforeAll(async () => {
    worker = await createTestWorker();
  }, 120_000);

  afterAll(async () => {
    await worker.terminate();
  });

  const variants = [
    'real-photo-upright.jpg',
    'real-photo-90cw.jpg',
    'real-photo-90ccw.jpg',
    'real-photo-180.jpg',
    'real-photo-skew7.jpg',
    'real-photo-exif6.jpg',
  ];

  it.each(variants)(
    'extracts all 15 spelling words from %s',
    async (fixture) => {
      const blob = loadFixtureBlob(fixture);
      const { text } = await recognizeWithOrientationDetection(
        worker,
        blob,
        createSharpImageOps(),
      );
      const words = correctOcrWords(cleanWords(normalizeWhitespace(text)));

      for (const expected of REAL_PHOTO_WORDS) {
        expect(words, `missing "${expected}" in ${fixture}`).toContain(expected);
      }

      // Guard against garbage: everything recognized should be a list word,
      // a header word, or at worst a couple of stray fragments.
      const known = new Set([...REAL_PHOTO_WORDS, ...REAL_PHOTO_HEADER_WORDS]);
      const strays = words.filter((w) => !known.has(w));
      expect(strays.length, `too much garbage in ${fixture}: ${strays.join(' ')}`).toBeLessThanOrEqual(2);
    },
    300_000,
  );
});
