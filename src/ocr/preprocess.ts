// src/ocr/preprocess.ts — image preprocessing utilities for OCR

import { cleanWords } from './utils.ts';
import { WORD_SET } from './word-list.ts';

/**
 * A minimal Tesseract.js worker interface for orientation detection.
 */
export interface OcrWorker {
  recognize(image: unknown, opts?: Record<string, unknown>): Promise<{
    data: { text: string; confidence: number };
  }>;
}

/**
 * Canvas-style image operations used by the OCR pipeline.
 *
 * The browser implementation (canvasImageOps) uses createImageBitmap +
 * OffscreenCanvas. Tests can inject a Node implementation (e.g. sharp-based)
 * so the exact same orientation-detection logic is exercised end to end.
 */
export interface ImageOps {
  /**
   * Decode the image, apply EXIF orientation, downscale to maxDimension,
   * flatten uneven illumination and re-encode without metadata. Returns null
   * when unavailable/failed.
   */
  normalize(image: Blob, maxDimension?: number): Promise<Blob | null>;
  /**
   * Rotate the image by quarterTurns × 90° clockwise, swapping canvas
   * dimensions so no pixels are cropped. Returns null when unavailable/failed.
   */
  rotate(image: Blob, quarterTurns: 1 | 2 | 3): Promise<Blob | null>;
  /**
   * Rotate the image by a small angle (degrees, clockwise) about its center,
   * keeping the canvas size. Used to deskew tilted handheld photos. Returns
   * null when unavailable/failed.
   */
  rotateSmall(image: Blob, degrees: number): Promise<Blob | null>;
}

/**
 * Quarter-turn rotations to try, in order. 0 first: with EXIF normalization
 * most photos are already upright, so the first attempt usually wins and
 * early-exits.
 */
const CANDIDATE_QUARTER_TURNS = [0, 1, 2, 3] as const;

/** rotateRadians equivalents for the Tesseract fallback path (clockwise). */
const QUARTER_TURN_RADIANS = [0, Math.PI / 2, Math.PI, -Math.PI / 2] as const;

/**
 * Maximum pixel dimension (width or height) after normalization.
 * Modern phone photos are ~4000×3000; Tesseract gains nothing from that
 * resolution on a word list, and large bitmaps risk mobile memory issues.
 */
const MAX_DIMENSION = 1800;

/**
 * Retry dimension used when the first pass yields garbage. Blurry photos
 * (dim-light handheld shots) often become readable when downscaled further:
 * shrinking re-sharpens soft strokes relative to letter size.
 */
const RETRY_DIMENSION = 1200;

/**
 * Target paper brightness (0-255) after illumination flattening.
 */
const FLATTEN_PAPER_LEVEL = 230;

/**
 * Factor by which the image is shrunk to estimate the background for
 * illumination flattening (downscale-then-upscale acts as a cheap blur whose
 * radius scales with the image).
 */
const BACKGROUND_SHRINK_FACTOR = 24;

/**
 * Minimum valid output blob size in bytes. A valid JPEG/PNG of a photo will
 * always exceed this; anything smaller is a blank/corrupt canvas export.
 */
const MIN_BLOB_SIZE = 1024;

// NOTE: never add a solid white border around photos here. Tesseract's page
// segmentation classifies a sharp-edged photo region floating on a uniform
// white "page" as a picture (not text) and returns empty output at 0.0
// confidence — this was the root cause of the historical addPadding failures.

/**
 * Orientation scoring: dictionary words are weighted heavier than merely
 * plausible tokens. A wrongly-rotated image still produces tokens that pass
 * the plausibility heuristics, but it produces almost no real English words.
 */
const DICTIONARY_WORD_WEIGHT = 3;

/**
 * Early exit: stop trying further rotations once an orientation yields at
 * least this many dictionary words AND dictionary words are the majority of
 * recognized tokens. (Confidence is deliberately not used here — real photos
 * of colored/textured paper score low confidence even when perfectly read.)
 */
const MIN_DICT_WORDS_FOR_EARLY_EXIT = 5;

/**
 * Tesseract reads tilted text reliably only up to ~3-4° of skew. When the
 * best cardinal orientation scores below this confidence (0-100), small
 * corrective rotations are attempted. ±4°/±8° leave at most ~2° of residual
 * tilt for any handheld skew up to ~10°.
 */
const DESKEW_CONFIDENCE_THRESHOLD = 80;
const DESKEW_ANGLES_DEG = [4, -4, 8, -8];

export interface OrientationScore {
  score: number;
  dictWords: number;
  plausibleWords: number;
}

/**
 * Score recognized text for orientation selection.
 * Exported for tests.
 */
export function scoreRecognizedText(text: string): OrientationScore {
  const words = cleanWords(text);
  let dictWords = 0;
  for (const w of words) {
    if (WORD_SET.has(w)) dictWords++;
  }
  return {
    score: dictWords * DICTIONARY_WORD_WEIGHT + (words.length - dictWords),
    dictWords,
    plausibleWords: words.length,
  };
}

function isEarlyExit(s: OrientationScore): boolean {
  return (
    s.dictWords >= MIN_DICT_WORDS_FOR_EARLY_EXIT &&
    s.dictWords * 2 >= s.plausibleWords
  );
}

/**
 * Heuristic for "this OCR result is unusable noise, not a word list".
 * Dim/blurry photos produce stray letter-run tokens that pass the
 * plausibility filters ("fis", "alia", "erg") but are not English words.
 * Tesseract's own confidence cannot be used for this: it reports up to 95
 * on pure noise.
 */
export function isLikelyGarbage(score: OrientationScore): boolean {
  if (score.plausibleWords === 0) return true;
  if (score.dictWords < 3) return true;
  return score.dictWords / score.plausibleWords < 0.35;
}

/**
 * Divide an RGBA image by a blurred-background RGBA estimate of the same
 * size, writing a flattened grayscale result in place. This removes uneven
 * lighting (vignettes, shadows, dim rooms) that defeats Tesseract's global
 * binarization on real phone photos.
 *
 * Shared by the browser canvas implementation and the Node test
 * implementation so both paths run identical math.
 */
export function flattenWithBackground(
  image: Uint8ClampedArray,
  background: Uint8ClampedArray,
): void {
  for (let i = 0; i < image.length; i += 4) {
    const gray = (image[i] + image[i + 1] + image[i + 2]) / 3;
    const bg = (background[i] + background[i + 1] + background[i + 2]) / 3;
    const v = Math.min(255, Math.round((gray / Math.max(bg, 1)) * FLATTEN_PAPER_LEVEL));
    image[i] = v;
    image[i + 1] = v;
    image[i + 2] = v;
  }
}

/**
 * Draw `source` scaled down to (dstW, dstH) using progressive halving.
 * A single drawImage with a large shrink ratio samples only a few source
 * pixels per destination pixel (canvas 2d has no mipmapping), which aliases
 * textured photos badly and degrades both recognition and the background
 * estimate. Halving repeatedly approximates proper area averaging.
 */
function drawScaled(
  source: ImageBitmap | OffscreenCanvas,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): OffscreenCanvas | null {
  let current: ImageBitmap | OffscreenCanvas = source;
  let curW = srcW;
  let curH = srcH;

  while (curW / 2 >= dstW && curH / 2 >= dstH) {
    const nextW = Math.max(dstW, Math.round(curW / 2));
    const nextH = Math.max(dstH, Math.round(curH / 2));
    const next = new OffscreenCanvas(nextW, nextH);
    const ctx = next.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(current, 0, 0, curW, curH, 0, 0, nextW, nextH);
    current = next;
    curW = nextW;
    curH = nextH;
  }

  const out = new OffscreenCanvas(dstW, dstH);
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  // White underlay so transparent PNGs flatten correctly under JPEG encode
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dstW, dstH);
  ctx.drawImage(current, 0, 0, curW, curH, 0, 0, dstW, dstH);
  return out;
}

/**
 * Browser implementation of ImageOps using createImageBitmap + OffscreenCanvas.
 *
 * createImageBitmap applies EXIF orientation during decode (the default
 * imageOrientation is "from-image" in all modern browsers), which sidesteps
 * Tesseract.js's unreliable EXIF sniffing — its regex parser only understands
 * big-endian EXIF, while many phone cameras write little-endian, so phone
 * photos otherwise reach Tesseract sideways with no warning.
 */
export const canvasImageOps: ImageOps = {
  async normalize(image: Blob, maxDimension: number = MAX_DIMENSION): Promise<Blob | null> {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      return null;
    }
    try {
      const bitmap = await createImageBitmap(image);
      try {
        let drawWidth = bitmap.width;
        let drawHeight = bitmap.height;
        const maxSide = Math.max(drawWidth, drawHeight);
        if (maxSide > maxDimension) {
          const scale = maxDimension / maxSide;
          drawWidth = Math.round(drawWidth * scale);
          drawHeight = Math.round(drawHeight * scale);
        }

        const canvas = drawScaled(bitmap, bitmap.width, bitmap.height, drawWidth, drawHeight);
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // Flatten uneven lighting: estimate the background by shrinking the
        // image and scaling it back up (a cheap, portable blur), then divide.
        // Best-effort — if any canvas op fails, the unflattened image is used.
        try {
          const bgW = Math.max(1, Math.round(drawWidth / BACKGROUND_SHRINK_FACTOR));
          const bgH = Math.max(1, Math.round(drawHeight / BACKGROUND_SHRINK_FACTOR));
          const small = drawScaled(canvas, drawWidth, drawHeight, bgW, bgH);
          const bgCanvas = small
            ? drawScaled(small, bgW, bgH, drawWidth, drawHeight)
            : null;
          const bgCtx = bgCanvas?.getContext('2d');
          if (bgCtx && bgCanvas) {
            const imageData = ctx.getImageData(0, 0, drawWidth, drawHeight);
            const bgData = bgCtx.getImageData(0, 0, drawWidth, drawHeight);
            flattenWithBackground(imageData.data, bgData.data);
            ctx.putImageData(imageData, 0, 0);
          }
        } catch {
          // keep the unflattened image
        }

        const result = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
        if (result.size < MIN_BLOB_SIZE) return null;
        return result;
      } finally {
        bitmap.close();
      }
    } catch {
      return null;
    }
  },

  async rotate(image: Blob, quarterTurns: 1 | 2 | 3): Promise<Blob | null> {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      return null;
    }
    try {
      const bitmap = await createImageBitmap(image);
      try {
        const { width: srcW, height: srcH } = bitmap;
        const swap = quarterTurns % 2 === 1;
        const dstW = swap ? srcH : srcW;
        const dstH = swap ? srcW : srcH;

        const canvas = new OffscreenCanvas(dstW, dstH);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.translate(dstW / 2, dstH / 2);
        ctx.rotate((quarterTurns * Math.PI) / 2);
        ctx.drawImage(bitmap, -srcW / 2, -srcH / 2);

        const result = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
        if (result.size < MIN_BLOB_SIZE) return null;
        return result;
      } finally {
        bitmap.close();
      }
    } catch {
      return null;
    }
  },

  async rotateSmall(image: Blob, degrees: number): Promise<Blob | null> {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      return null;
    }
    try {
      const bitmap = await createImageBitmap(image);
      try {
        const { width, height } = bitmap;
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // Mid-gray corner fill: white fill makes Tesseract's page
        // segmentation discard the photo region (see padding note above).
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, width, height);
        ctx.translate(width / 2, height / 2);
        ctx.rotate((degrees * Math.PI) / 180);
        ctx.drawImage(bitmap, -width / 2, -height / 2);

        const result = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
        if (result.size < MIN_BLOB_SIZE) return null;
        return result;
      } finally {
        bitmap.close();
      }
    } catch {
      return null;
    }
  },
};

/**
 * Tries the four cardinal orientations of the given image and returns the
 * result that produces the most real English words.
 *
 * This is necessary because Tesseract's built-in auto-rotation (deskew) only
 * corrects small angles (~±15°), not the 90°/180°/270° rotations common in
 * phone-captured photos of spelling lists and worksheets. Small skew from a
 * handheld photo is handled by Tesseract itself on top of the cardinal
 * rotation chosen here.
 *
 * Rotation strategy:
 *  - With ImageOps available (browser, or tests injecting a Node
 *    implementation): the image is normalized once (EXIF applied, downscaled,
 *    padded, metadata stripped), then physically rotated per orientation with
 *    correct dimension swapping. Tesseract always receives an upright-encoded
 *    image and never consults its own EXIF parsing or rotation.
 *  - Without ImageOps (plain Node): falls back to Tesseract's rotateRadians.
 *
 * Scoring: dictionary-word count is the primary signal (see
 * scoreRecognizedText) — Tesseract's confidence is only a tiebreaker, since
 * it can report similar or higher confidence for a wrongly-rotated image by
 * "recognizing" garbage characters.
 *
 * Safety net: if every orientation of the preprocessed image yields nothing,
 * the original untouched blob is retried once (guards against rare canvas
 * encode failures producing blank images on specific devices).
 */
export async function recognizeWithOrientationDetection(
  worker: OcrWorker,
  image: unknown,
  imageOps: ImageOps = canvasImageOps,
): Promise<{ text: string; confidence: number }> {
  const normalized =
    image instanceof Blob ? await imageOps.normalize(image) : null;

  let best = await tryAllOrientations(worker, normalized ?? image, imageOps, normalized !== null);

  // Safety net: preprocessed image produced nothing usable — retry the raw
  // input via the Tesseract-side rotation path before giving up.
  if (best.score.plausibleWords === 0 && normalized !== null) {
    const rawBest = await tryAllOrientations(worker, image, imageOps, false);
    if (rawBest.score.score > best.score.score) {
      return { text: rawBest.text, confidence: rawBest.confidence / 100 };
    }
  }

  // Deskew sweep: a low-confidence result on the winning cardinal
  // orientation usually means the photo was taken at a slight tilt, which
  // Tesseract only tolerates up to ~3-4°. Try small corrective rotations and
  // keep whichever scores best.
  if (best.confidence < DESKEW_CONFIDENCE_THRESHOLD && best.image instanceof Blob) {
    best = await trySmallRotations(worker, best, imageOps);
  }

  // Low-resolution retry: blurry photos (dim handheld shots) often become
  // readable when downscaled further, because shrinking re-sharpens soft
  // strokes relative to letter size.
  if (isLikelyGarbage(best.score) && image instanceof Blob) {
    const smaller = await imageOps.normalize(image, RETRY_DIMENSION);
    if (smaller) {
      let retryBest = await tryAllOrientations(worker, smaller, imageOps, true);
      if (retryBest.confidence < DESKEW_CONFIDENCE_THRESHOLD && retryBest.image instanceof Blob) {
        retryBest = await trySmallRotations(worker, retryBest, imageOps);
      }
      if (retryBest.score.score > best.score.score) {
        best = retryBest;
      }
    }
  }

  return { text: best.text, confidence: best.confidence / 100 };
}

interface OrientationResult {
  text: string;
  confidence: number;
  score: OrientationScore;
  /** The (possibly rotated) image that produced this result. */
  image: unknown;
}

async function trySmallRotations(
  worker: OcrWorker,
  best: OrientationResult,
  imageOps: ImageOps,
): Promise<OrientationResult> {
  const baseImage = best.image as Blob;

  for (const degrees of DESKEW_ANGLES_DEG) {
    try {
      const rotated = await imageOps.rotateSmall(baseImage, degrees);
      if (!rotated) break; // rotation unavailable — no point trying more angles

      const bytes = new Uint8Array(await rotated.arrayBuffer());
      const { data } = await worker.recognize(bytes, {});
      const score = scoreRecognizedText(data.text);

      if (
        score.score > best.score.score ||
        (score.score === best.score.score && data.confidence > best.confidence)
      ) {
        best = { text: data.text, confidence: data.confidence, score, image: rotated };
      }

      if (best.confidence >= DESKEW_CONFIDENCE_THRESHOLD && isEarlyExit(best.score)) break;
    } catch {
      continue;
    }
  }

  return best;
}

async function tryAllOrientations(
  worker: OcrWorker,
  image: unknown,
  imageOps: ImageOps,
  useImageRotation: boolean,
): Promise<OrientationResult> {
  let best: OrientationResult = {
    text: '',
    confidence: 0,
    score: { score: -1, dictWords: 0, plausibleWords: 0 },
    image,
  };

  for (const quarterTurns of CANDIDATE_QUARTER_TURNS) {
    try {
      let attemptImage = image;
      let recognizeImage = image;
      let opts: Record<string, unknown> = {};

      if (quarterTurns !== 0) {
        let rotated: Blob | null = null;
        if (useImageRotation && image instanceof Blob) {
          rotated = await imageOps.rotate(image, quarterTurns);
        }
        if (rotated) {
          attemptImage = rotated;
          recognizeImage = rotated;
        } else {
          opts = { rotateRadians: QUARTER_TURN_RADIANS[quarterTurns] };
        }
      }

      // Tesseract.js's Blob handling differs between its browser and Node
      // loaders (Node silently mangles Blobs) — raw bytes work in both.
      if (recognizeImage instanceof Blob) {
        recognizeImage = new Uint8Array(await recognizeImage.arrayBuffer());
      }

      const { data } = await worker.recognize(recognizeImage, opts);
      const score = scoreRecognizedText(data.text);

      if (
        score.score > best.score.score ||
        (score.score === best.score.score && data.confidence > best.confidence)
      ) {
        best = { text: data.text, confidence: data.confidence, score, image: attemptImage };
      }

      if (isEarlyExit(score)) break;
    } catch {
      // Individual rotation attempt failed — keep trying the others.
      continue;
    }
  }

  return best;
}
