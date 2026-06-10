// src/ocr/local.ts — Local OCR provider (pluggable recognizer, wraps Tesseract.js interface)

import type { OcrProvider, OcrResult } from '../contracts/types.ts';
import { cleanWords, normalizeWhitespace } from './utils.ts';
import { correctOcrWords } from './spell-check.ts';
import { isLikelyGarbage, scoreRecognizedText } from './preprocess.ts';

/**
 * Thrown when OCR ran but the output is unusable noise. Carries a
 * user-actionable message — the alternative (importing fragments like "fis"
 * or "erg" into a child's word list) is far worse than asking for a retake.
 */
export class OcrUnreadableError extends Error {
  constructor() {
    super(
      "Couldn't read the words in this photo. Try again with more light, hold the phone steady, and fill the frame with the list.",
    );
    this.name = 'OcrUnreadableError';
  }
}

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
    const words = correctOcrWords(cleanWords(rawText));

    // Refuse to return noise. Tesseract confidence is not a usable signal
    // here (it reports up to 95 on garbage), so gate on whether the output
    // actually looks like an English word list.
    if (isLikelyGarbage(scoreRecognizedText(words.join(' ')))) {
      throw new OcrUnreadableError();
    }

    return {
      rawText,
      words,
      confidence,
      source: 'local',
    };
  }
}
