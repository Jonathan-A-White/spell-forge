// src/ocr/tesseract-recognizer.ts — Lazy-loading Tesseract.js recognizer

import type { RecognizerFn } from './local.ts';
import { addPadding, recognizeWithOrientationDetection } from './preprocess.ts';

/**
 * Creates a RecognizerFn that lazy-loads a Tesseract.js worker on first call.
 * The worker is reused for subsequent calls and can be terminated when no longer needed.
 * Uses multi-orientation detection (0°/90°/180°/270°) to handle rotated photos.
 */
export function createTesseractRecognizer(): RecognizerFn {
  let workerPromise: Promise<Tesseract.Worker> | null = null;

  async function getWorker(): Promise<Tesseract.Worker> {
    if (!workerPromise) {
      workerPromise = (async () => {
        const Tesseract = await import('tesseract.js');
        const worker = await Tesseract.createWorker('eng');
        return worker;
      })();
    }
    return workerPromise;
  }

  const recognizer: RecognizerFn = async (image: Blob) => {
    const worker = await getWorker();
    const padded = await addPadding(image);
    return recognizeWithOrientationDetection(worker, padded);
  };

  return recognizer;
}
