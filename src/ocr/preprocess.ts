// src/ocr/preprocess.ts — image preprocessing utilities for OCR

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

/** Confidence threshold (0-100 Tesseract scale) to short-circuit orientation search. */
const HIGH_CONFIDENCE_THRESHOLD = 80;

/**
 * Percentage of the smaller image dimension to use as padding on each side.
 * Tesseract needs whitespace around text to reliably detect text boundaries.
 * 5% on each side (10% total) matches the Tesseract best-practices recommendation.
 */
const PADDING_PERCENT = 0.05;

/**
 * Adds white padding around an image Blob using an OffscreenCanvas.
 * Returns a new Blob with the padded image, or the original if padding
 * cannot be applied (e.g. OffscreenCanvas not available).
 */
export async function addPadding(image: Blob): Promise<Blob> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return image;
  }

  const bitmap = await createImageBitmap(image);
  const pad = Math.round(Math.min(bitmap.width, bitmap.height) * PADDING_PERCENT);
  const canvas = new OffscreenCanvas(bitmap.width + pad * 2, bitmap.height + pad * 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return image;
  }

  // Fill with white, then draw the original image offset by the padding amount
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, pad, pad);
  bitmap.close();

  return canvas.convertToBlob({ type: image.type || 'image/png' });
}

/**
 * Tries multiple orientations on the given image using the provided worker
 * and returns the result with the highest confidence.
 *
 * This is necessary because Tesseract's built-in auto-rotation (deskew) only
 * corrects small angles (~±15°), not the 90°/180°/270° rotations common in
 * phone-captured photos of spelling lists and worksheets.
 */
export async function recognizeWithOrientationDetection(
  worker: OcrWorker,
  image: unknown,
): Promise<{ text: string; confidence: number }> {
  let bestText = '';
  let bestConfidence = -1;

  for (const angle of CANDIDATE_ROTATIONS) {
    const { data } = await worker.recognize(image, { rotateRadians: angle });
    if (data.confidence > bestConfidence) {
      bestConfidence = data.confidence;
      bestText = data.text;
    }
    // Early exit: high-confidence result found, no need to try more angles
    if (data.confidence >= HIGH_CONFIDENCE_THRESHOLD) break;
  }

  return {
    text: bestText,
    confidence: bestConfidence / 100,
  };
}
