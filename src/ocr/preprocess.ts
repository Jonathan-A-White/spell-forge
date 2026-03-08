// src/ocr/preprocess.ts — image preprocessing utilities for OCR

import { cleanWords } from './utils.ts';
import { raceWithTimeout } from './timeout.ts';

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
 * Minimum number of plausible words to short-circuit orientation search.
 * If a rotation produces at least this many words OR high confidence, we skip
 * the remaining rotations. Lowered from 5 to 3 to avoid unnecessary passes
 * on slow devices.
 */
const MIN_WORDS_FOR_EARLY_EXIT = 3;

/** Confidence threshold (0-100 Tesseract scale) to short-circuit orientation search. */
const HIGH_CONFIDENCE_THRESHOLD = 75;

/** Maximum time (ms) for a single orientation recognition pass. */
const PER_ORIENTATION_TIMEOUT_MS = 20_000;

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
 * Tries multiple orientations on the given image using the provided worker
 * and returns the result that produces the most plausible English words.
 *
 * This is necessary because Tesseract's built-in auto-rotation (deskew) only
 * corrects small angles (~±15°), not the 90°/180°/270° rotations common in
 * phone-captured photos of spelling lists and worksheets.
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
    // For 0° (upright), omit rotateRadians entirely so Tesseract uses its
    // default path — passing rotateRadians: 0 can trigger unnecessary
    // image-rotation codepaths in some Tesseract.js versions.
    const opts = angle === 0 ? {} : { rotateRadians: angle };

    let data: { text: string; confidence: number };
    try {
      const result = await raceWithTimeout(
        worker.recognize(image, opts),
        PER_ORIENTATION_TIMEOUT_MS,
        `OCR timed out for rotation ${angle}`,
      );
      data = result.data;
    } catch {
      // If one orientation times out (common on slow devices), skip it
      // and try the next one rather than blocking the whole pipeline.
      continue;
    }

    const wordCount = cleanWords(data.text).length;

    if (
      wordCount > bestWordCount ||
      (wordCount === bestWordCount && data.confidence > bestConfidence)
    ) {
      bestConfidence = data.confidence;
      bestText = data.text;
      bestWordCount = wordCount;
    }

    // Early exit: enough real words OR high confidence — no need to try more.
    // Using OR (not AND) so slow devices don't burn through all 4 rotations
    // when the first good result is already usable.
    if (wordCount >= MIN_WORDS_FOR_EARLY_EXIT || data.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
      break;
    }
  }

  return {
    text: bestText,
    confidence: bestConfidence / 100,
  };
}
