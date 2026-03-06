// @vitest-environment node
/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanWords, normalizeWhitespace } from '../../src/ocr/utils.ts';
import { addPadding, recognizeWithOrientationDetection } from '../../src/ocr/preprocess.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// All words visible in the fixture image after cleanWords processing:
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
    const words = cleanWords(rawText);

    expect(confidence).toBeGreaterThan(0);

    // Sort both arrays to compare contents regardless of OCR line order
    // (rotated images may produce different reading orders)
    expect([...words].sort()).toEqual([...EXPECTED_WORDS].sort());
  }, 120_000); // Tesseract can be slow with multiple orientation attempts

  it('produces correct results when addPadding is in the pipeline (unpadded image)', async () => {
    const imageBuffer = loadFixtureImage();
    const worker = await createTestWorker();

    // Exercise the same pipeline as tesseract-recognizer.ts:
    //   image → addPadding → recognizeWithOrientationDetection
    // In Node.js, addPadding gracefully returns the original (no OffscreenCanvas),
    // which mirrors the fallback behaviour the fix introduces for mobile failures.
    const imageBlob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' });
    const padded = await addPadding(imageBlob);

    // addPadding should return *something* usable (original or padded)
    expect(padded.size).toBeGreaterThan(0);

    // Feed the (possibly padded) blob through orientation detection
    // Tesseract.js in Node accepts Blob, Buffer, or path — convert back to Buffer
    // since Node Blob support in Tesseract varies.
    const paddedBuffer = Buffer.from(await padded.arrayBuffer());
    const { text, confidence } = await recognizeWithOrientationDetection(
      worker,
      paddedBuffer,
    );
    await worker.terminate();

    const rawText = normalizeWhitespace(text);
    const words = cleanWords(rawText);

    expect(confidence).toBeGreaterThan(0);
    expect([...words].sort()).toEqual([...EXPECTED_WORDS].sort());
  }, 120_000);
});
