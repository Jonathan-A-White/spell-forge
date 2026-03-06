// @vitest-environment node
/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanWords, normalizeWhitespace } from '../../src/ocr/utils.ts';
import { recognizeWithOrientationDetection } from '../../src/ocr/preprocess.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Integration test: runs a real spelling-list photo through the full local
 * Tesseract.js OCR pipeline — including orientation detection — and verifies
 * the extracted word list.
 *
 * The fixture image reproduces a classroom spelling list (Unit 3, WK 6)
 * with text rotated 90° counter-clockwise, as commonly photographed by
 * parents/teachers.
 *
 * Pipeline exercised:
 *   orientation detection → Tesseract.js recognize → normalizeWhitespace → cleanWords
 */
describe('OCR image integration', () => {
  it('extracts the correct word list from a rotated spelling-list photo', async () => {
    const imagePath = resolve(__dirname, '../fixtures/spelling-list-unit3-wk6.jpg');
    const imageBuffer = readFileSync(imagePath);

    // Create Tesseract worker with local language data (no CDN fetch)
    const Tesseract = await import('tesseract.js');
    const langPath = resolve(__dirname, '../fixtures/tessdata');
    const worker = await Tesseract.createWorker('eng', undefined, {
      langPath,
      gzip: false,
    });

    // Run OCR with orientation detection (tries 0°, 90°, 180°, 270°)
    const { text, confidence } = await recognizeWithOrientationDetection(
      worker,
      imageBuffer,
    );
    await worker.terminate();

    // Run through the same cleanup pipeline as LocalOcrProvider
    const rawText = normalizeWhitespace(text);
    const words = cleanWords(rawText);

    // All words visible in the image after cleanWords processing:
    // - "Unit 3, WK 6" header → "unit" (3/wk/6 filtered as non-alpha or too short)
    // - 10 spelling words: badge edge judge pace mice peace huge giraffe gems price
    // - "Challenge Words" header → "challenge", "words"
    // - 3 challenge words: celebrate emergency message
    // - "High Frequency Words" header → "high", "frequency", "words" (deduped)
    // - 2 high-frequency words: group almost
    const expectedWords = [
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

    expect(confidence).toBeGreaterThan(0);

    // Sort both arrays to compare contents regardless of OCR line order
    // (rotated images may produce different reading orders)
    expect([...words].sort()).toEqual([...expectedWords].sort());
  }, 120_000); // Tesseract can be slow with multiple orientation attempts
});
