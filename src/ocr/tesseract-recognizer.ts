// src/ocr/tesseract-recognizer.ts — Lazy-loading Tesseract.js recognizer

import type { RecognizerFn } from './local.ts';
import { recognizeWithOrientationDetection } from './preprocess.ts';

/**
 * Resolve the base URL for language data bundled in public/tessdata/.
 * Vite serves public/ assets under the configured `base` path.
 */
function getLangPath(): string {
  return `${import.meta.env.BASE_URL}tessdata`;
}

/**
 * Creates a RecognizerFn that lazy-loads a Tesseract.js worker on first call.
 * The worker is reused for subsequent calls and can be terminated when no longer needed.
 * Uses multi-orientation detection (0°/90°/180°/270°) to handle rotated photos.
 *
 * Language data (eng.traineddata) is loaded from the app's own public/tessdata/
 * directory rather than fetched from a CDN, ensuring reliable offline operation.
 */
export function createTesseractRecognizer(): RecognizerFn {
  let workerPromise: Promise<Tesseract.Worker> | null = null;

  async function getWorker(): Promise<Tesseract.Worker> {
    if (!workerPromise) {
      workerPromise = (async () => {
        const Tesseract = await import('tesseract.js');
        const worker = await Tesseract.createWorker('eng', undefined, {
          langPath: getLangPath(),
          gzip: false,
        });
        return worker;
      })();
    }
    return workerPromise;
  }

  const recognizer: RecognizerFn = async (image: Blob) => {
    const worker = await getWorker();
    return recognizeWithOrientationDetection(worker, image);
  };

  return recognizer;
}
