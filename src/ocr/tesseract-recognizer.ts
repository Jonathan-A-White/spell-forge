// src/ocr/tesseract-recognizer.ts — Lazy-loading Tesseract.js recognizer

import type { RecognizerFn } from './local.ts';
import { addPadding, recognizeWithOrientationDetection } from './preprocess.ts';
import { raceWithTimeout } from './timeout.ts';

/**
 * Resolve the base URL for language data bundled in public/tessdata/.
 * Vite serves public/ assets under the configured `base` path.
 */
function getLangPath(): string {
  return `${import.meta.env.BASE_URL}tessdata`;
}

/** Maximum time (ms) to wait for the Tesseract worker to initialize. */
const WORKER_INIT_TIMEOUT_MS = 30_000;

/**
 * Maximum time (ms) for the entire recognition pipeline (all orientations).
 * On low-powered tablets a single recognize() call can take 20+ seconds;
 * four orientations could exceed 80 seconds. Cap at 60 s to avoid hanging.
 */
const RECOGNITION_TIMEOUT_MS = 60_000;

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

      // If init times out, clear the cached promise so the next attempt
      // creates a fresh worker instead of re-awaiting a stuck promise.
      workerPromise.catch(() => {
        workerPromise = null;
      });
    }
    return workerPromise;
  }

  const recognizer: RecognizerFn = async (image: Blob) => {
    const worker = await raceWithTimeout(
      getWorker(),
      WORKER_INIT_TIMEOUT_MS,
      'OCR engine took too long to start — please try again',
    );

    // Downscale large images and add whitespace padding for better OCR results.
    // This prevents memory issues on low-RAM devices like older tablets.
    const prepared = await addPadding(image);

    return raceWithTimeout(
      recognizeWithOrientationDetection(worker, prepared),
      RECOGNITION_TIMEOUT_MS,
      'Reading the image took too long — try a smaller or clearer photo',
    );
  };

  return recognizer;
}
