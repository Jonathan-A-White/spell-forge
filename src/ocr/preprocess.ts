// src/ocr/preprocess.ts — image preprocessing utilities for OCR

import { cleanWords } from './utils.ts';

/**
 * A minimal Tesseract.js worker interface for orientation detection.
 */
export interface OcrWorker {
  recognize(image: unknown, opts?: Record<string, unknown>): Promise<{
    data: { text: string; confidence: number };
  }>;
}

/**
 * Candidate rotation angles (in radians) for orientation detection.
 * Covers the four cardinal orientations that cover common photo rotations.
 *
 * Research context: Multi-orientation OCR is a standard technique in document
 * analysis (see Smith 2007, "An Overview of the Tesseract OCR Engine" — §4
 * on page layout analysis). For photographed documents, the four cardinal
 * orientations cover the vast majority of real-world cases.
 */
const CANDIDATE_ROTATIONS = [
  0,                  // upright
  Math.PI / 2,        // 90° CW
  Math.PI,            // 180°
  -Math.PI / 2,       // 90° CCW (equivalently 270° CW)
];

/**
 * Minimum number of plausible words required to short-circuit orientation search.
 * If a rotation produces at least this many words with high confidence, we can
 * skip trying the remaining rotations.
 */
const MIN_WORDS_FOR_EARLY_EXIT = 5;

/** Confidence threshold (0-100 Tesseract scale) to short-circuit orientation search. */
const HIGH_CONFIDENCE_THRESHOLD = 80;

/**
 * Percentage of the smaller image dimension to use as padding on each side.
 * Tesseract needs whitespace around text to reliably detect text boundaries.
 * 5% on each side (10% total) matches the Tesseract best-practices recommendation.
 */
const PADDING_PERCENT = 0.05;

/**
 * Maximum pixel dimension (width or height) before downscaling.
 * Mobile devices can silently fail when OffscreenCanvas allocates large pixel
 * buffers (e.g. a 4000×3000 photo ≈ 48 MB RGBA). Capping at 2048 px keeps the
 * buffer under ~16 MB while preserving enough detail for Tesseract.
 */
const MAX_DIMENSION = 2048;

/**
 * Minimum valid output blob size in bytes.
 * A valid PNG or JPEG will always exceed this. If convertToBlob returns
 * something smaller it almost certainly produced a blank/corrupt image.
 */
const MIN_BLOB_SIZE = 1024;

/**
 * Adds white padding around an image Blob using an OffscreenCanvas.
 * Large images are downscaled first to avoid mobile memory issues.
 * Returns a new Blob with the padded image, or the original if padding
 * cannot be applied (e.g. OffscreenCanvas not available or canvas failure).
 *
 * Also normalizes EXIF orientation: createImageBitmap applies EXIF rotation,
 * and the output blob is a clean image without EXIF metadata.
 */
export async function addPadding(image: Blob): Promise<Blob> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return image;
  }

  try {
    const bitmap = await createImageBitmap(image);
    try {
      // Downscale if either dimension exceeds the cap
      let drawWidth = bitmap.width;
      let drawHeight = bitmap.height;
      const maxSide = Math.max(drawWidth, drawHeight);
      if (maxSide > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / maxSide;
        drawWidth = Math.round(drawWidth * scale);
        drawHeight = Math.round(drawHeight * scale);
      }

      const pad = Math.round(Math.min(drawWidth, drawHeight) * PADDING_PERCENT);
      const canvas = new OffscreenCanvas(drawWidth + pad * 2, drawHeight + pad * 2);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return image;
      }

      // Fill with white, then draw the (possibly downscaled) image offset by padding
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, pad, pad, drawWidth, drawHeight);

      const result = await canvas.convertToBlob({ type: image.type || 'image/png' });

      // Validate: a blank or corrupt blob will be suspiciously small
      if (result.size < MIN_BLOB_SIZE) {
        return image;
      }

      return result;
    } finally {
      bitmap.close();
    }
  } catch {
    // Any failure (OOM, SecurityError, etc.) → use the original image
    return image;
  }
}

/**
 * Rotate an image Blob by the given angle using OffscreenCanvas.
 * Uses createImageBitmap which handles EXIF orientation automatically,
 * producing a clean output without EXIF metadata.
 *
 * Returns null if canvas rotation is unavailable (e.g. Node.js environment).
 */
export async function rotateImage(image: Blob, angle: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return null;
  }

  try {
    const bitmap = await createImageBitmap(image);
    try {
      const { width: srcW, height: srcH } = bitmap;

      // For 90°/270° rotations, swap width and height
      const absSin = Math.abs(Math.sin(angle));
      const absCos = Math.abs(Math.cos(angle));
      const dstW = Math.round(srcW * absCos + srcH * absSin);
      const dstH = Math.round(srcW * absSin + srcH * absCos);

      const canvas = new OffscreenCanvas(dstW, dstH);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Translate to center, rotate, then draw centered
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, dstW, dstH);
      ctx.translate(dstW / 2, dstH / 2);
      ctx.rotate(angle);
      ctx.drawImage(bitmap, -srcW / 2, -srcH / 2);

      const result = await canvas.convertToBlob({ type: image.type || 'image/png' });
      if (result.size < MIN_BLOB_SIZE) return null;
      return result;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/**
 * Tries multiple orientations on the given image using the provided worker
 * and returns the result that produces the most plausible English words.
 *
 * This is necessary because Tesseract's built-in auto-rotation (deskew) only
 * corrects small angles (~±15°), not the 90°/180°/270° rotations common in
 * phone-captured photos of spelling lists and worksheets.
 *
 * Rotation strategy:
 *  - In browser environments: pre-rotates images using OffscreenCanvas before
 *    passing to Tesseract. This is more reliable than Tesseract's rotateRadians
 *    because createImageBitmap correctly handles EXIF orientation metadata
 *    (which Tesseract's built-in EXIF parser handles unreliably).
 *  - In non-browser environments (Node.js): falls back to Tesseract's
 *    rotateRadians parameter.
 *
 * Scoring: the number of plausible words (via cleanWords) is the primary
 * signal; Tesseract confidence is the tiebreaker.  Raw confidence alone is
 * unreliable because Tesseract can report similar or even higher confidence
 * for a wrongly-rotated image (it "recognizes" garbage characters with
 * moderate per-character confidence).  The correct orientation consistently
 * produces more real English words.
 */
export async function recognizeWithOrientationDetection(
  worker: OcrWorker,
  image: unknown,
): Promise<{ text: string; confidence: number }> {
  let bestText = '';
  let bestConfidence = -1;
  let bestWordCount = -1;

  for (const angle of CANDIDATE_ROTATIONS) {
    try {
      let recognizeImage: unknown = image;
      let opts: Record<string, unknown> = {};

      if (angle === 0) {
        // No rotation needed — use image as-is with no options
      } else if (image instanceof Blob) {
        // Browser path: pre-rotate using Canvas (handles EXIF, more reliable)
        const rotated = await rotateImage(image, angle);
        if (rotated) {
          recognizeImage = rotated;
        } else {
          // Canvas unavailable — fall back to Tesseract's rotateRadians
          opts = { rotateRadians: angle };
        }
      } else {
        // Non-browser path (Node.js tests): use Tesseract's rotateRadians
        opts = { rotateRadians: angle };
      }

      const { data } = await worker.recognize(recognizeImage, opts);
      const wordCount = cleanWords(data.text).length;

      if (
        wordCount > bestWordCount ||
        (wordCount === bestWordCount && data.confidence > bestConfidence)
      ) {
        bestConfidence = data.confidence;
        bestText = data.text;
        bestWordCount = wordCount;
      }

      // Early exit: enough real words with high confidence — no need to try more
      if (wordCount >= MIN_WORDS_FOR_EARLY_EXIT && data.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
        break;
      }
    } catch {
      // Individual rotation attempt failed — continue trying other orientations
      continue;
    }
  }

  return {
    text: bestText,
    confidence: bestConfidence / 100,
  };
}
