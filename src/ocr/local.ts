// src/ocr/local.ts — Local OCR provider (pluggable recognizer, wraps Tesseract.js interface)

import type { OcrProvider, OcrResult } from '../contracts/types.ts';
import { cleanWords, normalizeWhitespace } from './utils.ts';

/**
 * A recognizer function that takes an image Blob and returns
 * the raw recognized text plus a confidence score (0-1).
 * This is the seam where Tesseract.js (or any other engine) plugs in.
 */
export interface RecognizerFn {
  (image: Blob): Promise<{ text: string; confidence: number }>;
}

export class LocalOcrProvider implements OcrProvider {
  private recognizer: RecognizerFn | null;

  constructor(recognizer?: RecognizerFn) {
    this.recognizer = recognizer ?? null;
  }

  /**
   * Swap in a recognizer at runtime (e.g. after lazy-loading Tesseract.js).
   */
  setRecognizer(recognizer: RecognizerFn): void {
    this.recognizer = recognizer;
  }

  isAvailable(): boolean {
    return this.recognizer !== null;
  }

  async extractWords(image: Blob): Promise<OcrResult> {
    if (!this.recognizer) {
      throw new Error('Local OCR recognizer is not available');
    }

    const { text, confidence } = await this.recognizer(image);
    const rawText = normalizeWhitespace(text);
    const words = cleanWords(rawText);

    return {
      rawText,
      words,
      confidence,
      source: 'local',
    };
  }
}
