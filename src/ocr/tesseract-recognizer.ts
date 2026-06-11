// src/ocr/tesseract-recognizer.ts — Lazy-loading Tesseract.js recognizer

import type { RecognizerFn } from './local.ts';
import { recognizeWithOrientationDetection } from './preprocess.ts';

/**
 * Thrown when the OCR engine itself can't be loaded (as opposed to a photo
 * that can't be read). The most common cause in production is a stale page:
 * Tesseract.js is a lazily loaded chunk with a content hash, so a deploy
 * between page load and the first photo import 404s the old chunk
 * ("Failed to fetch dynamically imported module"). Also covers being
 * offline before the engine was ever fetched.
 */
export class OcrEngineLoadError extends Error {
  constructor() {
    super(
      "Couldn't load the photo reader. Check your connection, or refresh the page to get the latest version of the app, then try again.",
    );
    this.name = 'OcrEngineLoadError';
  }
}

/** The tesseract.js module shape, for injecting a fake loader in tests. */
type TesseractModule = typeof import('tesseract.js');

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
export function createTesseractRecognizer(
  loadTesseract: () => Promise<TesseractModule> = () => import('tesseract.js'),
): RecognizerFn {
  let workerPromise: Promise<Tesseract.Worker> | null = null;

  function getWorker(): Promise<Tesseract.Worker> {
    if (!workerPromise) {
      workerPromise = (async () => {
        try {
          const Tesseract = await loadTesseract();
          // createWorker fetches worker scripts and traineddata, which fail
          // in the same ways the module chunk does (stale deploy, offline).
          return await Tesseract.createWorker('eng', undefined, {
            langPath: getLangPath(),
            gzip: false,
          });
        } catch {
          throw new OcrEngineLoadError();
        }
      })();
      // A failed load must not poison future attempts: drop the cached
      // promise so the next photo import retries from scratch (e.g. after
      // the user refreshes a stale page or comes back online).
      workerPromise.catch(() => {
        workerPromise = null;
      });
    }
    return workerPromise;
  }

  const recognizer: RecognizerFn = async (image: Blob) => {
    const worker = await getWorker();
    // Normalization (EXIF, downscale, padding) and rotation happen inside
    // recognizeWithOrientationDetection via canvas; Tesseract never relies on
    // its own EXIF parsing or rotateRadians in the browser.
    return recognizeWithOrientationDetection(worker, image);
  };

  return recognizer;
}
