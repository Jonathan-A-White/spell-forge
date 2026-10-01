// src/grist/shrink-photo.ts — Get a photo into what a grist may carry: JPEG, PNG or WebP, at most 4 MiB.
// One already in those limits goes through untouched; anything else is re-encoded as JPEG by an encoder
// that tests replace (the default needs a browser: createImageBitmap and a canvas).

import { GristLimitError } from './errors';
import { GRIST_MAX_PHOTO_BYTES, GRIST_MIMES } from './send-grist';
import type { GristPhoto } from './send-grist';

/** Re-encodes `blob` as JPEG bytes, trying to land at or under `maxBytes`. */
export type PhotoEncoder = (blob: Blob, maxBytes: number) => Promise<Uint8Array>;

const JPEG = 'image/jpeg';
/** The longest side the first attempt keeps; a phone's 12-megapixel photo is read as well at this size. */
const FIRST_LONGEST_SIDE = 2560;
const QUALITIES = [0.85, 0.7, 0.55];
const SCALE_STEPS = 6;

async function toBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

interface Drawing {
  width: number;
  height: number;
  /** Draws the photo at `scale` and encodes it as JPEG at `quality`. */
  encode(scale: number, quality: number): Promise<Blob>;
  close(): void;
}

async function draw(blob: Blob): Promise<Drawing> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return {
      width: bitmap.width,
      height: bitmap.height,
      async encode(scale, quality) {
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        if (typeof OffscreenCanvas === 'function') {
          const canvas = new OffscreenCanvas(width, height);
          canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
          return canvas.convertToBlob({ type: JPEG, quality });
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
        return canvasBlob(canvas, quality);
      },
      close: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(blob);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new GristLimitError('This photo could not be opened.'));
    image.src = url;
  });
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    async encode(scale, quality) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvasBlob(canvas, quality);
    },
    close: () => URL.revokeObjectURL(url),
  };
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new GristLimitError('This photo could not be saved as a JPEG.'))),
      JPEG,
      quality,
    );
  });
}

/** The browser encoder: JPEG at falling quality, then at smaller sizes, until it fits under `maxBytes`. */
export const browserPhotoEncoder: PhotoEncoder = async (blob, maxBytes) => {
  const drawing = await draw(blob);
  try {
    let scale = Math.min(1, FIRST_LONGEST_SIDE / Math.max(drawing.width, drawing.height));
    let smallest: Blob | undefined;
    for (let step = 0; step < SCALE_STEPS; step += 1) {
      for (const quality of QUALITIES) {
        const encoded = await drawing.encode(scale, quality);
        if (encoded.size <= maxBytes) return toBytes(encoded);
        if (!smallest || encoded.size < smallest.size) smallest = encoded;
      }
      scale *= 0.75;
    }
    return smallest ? toBytes(smallest) : new Uint8Array();
  } finally {
    drawing.close();
  }
};

/**
 * A photo ready to send: `blob` as it is when it is a JPEG, PNG or WebP of at most 4 MiB, else re-encoded as a
 * JPEG under that. Throws a GristLimitError if the encoder cannot get it under.
 */
export async function shrinkPhoto(blob: Blob, encode: PhotoEncoder = browserPhotoEncoder): Promise<GristPhoto> {
  if (GRIST_MIMES.includes(blob.type) && blob.size <= GRIST_MAX_PHOTO_BYTES) {
    return { bytes: await toBytes(blob), mime: blob.type };
  }
  const bytes = await encode(blob, GRIST_MAX_PHOTO_BYTES);
  if (bytes.length === 0 || bytes.length > GRIST_MAX_PHOTO_BYTES) {
    throw new GristLimitError('This photo is too large to send, even made smaller.');
  }
  return { bytes, mime: JPEG };
}
