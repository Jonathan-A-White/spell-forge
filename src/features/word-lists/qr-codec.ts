// src/features/word-lists/qr-codec.ts — Encode/decode word lists for QR codes

import QRCode from 'qrcode';

/**
 * Compact payload format for QR codes. Short keys to minimize data size
 * since QR codes have limited capacity (~2KB usable at medium error correction).
 */
export interface QrWordListPayload {
  /** Format version for forward compatibility */
  v: 1;
  /** List name */
  n: string;
  /** Words array */
  w: string[];
  /** Test date as ISO string (optional) */
  t?: string;
}

/** Prefix to identify SpellForge QR codes vs random QR data */
const MAGIC_PREFIX = 'SF:';

/** Maximum words that can reliably fit in a single QR code */
const MAX_WORDS = 100;

/** Maximum total payload size in bytes */
const MAX_PAYLOAD_BYTES = 2500;

/**
 * Encode a word list into a QR code data URL (PNG image).
 * Throws if the word list is too large for a QR code.
 */
export async function encodeWordListToQr(
  name: string,
  words: string[],
  testDate?: Date | null,
): Promise<string> {
  if (words.length === 0) {
    throw new Error('Cannot create QR code for an empty word list');
  }
  if (words.length > MAX_WORDS) {
    throw new Error(`Too many words for a QR code (${words.length}). Maximum is ${MAX_WORDS}.`);
  }

  const payload: QrWordListPayload = {
    v: 1,
    n: name,
    w: words,
  };

  if (testDate) {
    payload.t = testDate.toISOString().split('T')[0]; // YYYY-MM-DD only
  }

  const json = MAGIC_PREFIX + JSON.stringify(payload);

  if (new TextEncoder().encode(json).length > MAX_PAYLOAD_BYTES) {
    throw new Error('Word list is too large for a single QR code. Try removing some words.');
  }

  return QRCode.toDataURL(json, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 300,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

/**
 * Decode a scanned QR string back into a word list payload.
 * Returns null if the string isn't a valid SpellForge QR code.
 */
export function decodeQrPayload(raw: string): QrWordListPayload | null {
  if (!raw.startsWith(MAGIC_PREFIX)) return null;

  try {
    const json = raw.slice(MAGIC_PREFIX.length);
    const parsed: unknown = JSON.parse(json);

    if (
      typeof parsed !== 'object' || parsed === null ||
      !('v' in parsed) || !('n' in parsed) || !('w' in parsed)
    ) {
      return null;
    }

    const obj = parsed as Record<string, unknown>;

    if (obj.v !== 1) return null;
    if (typeof obj.n !== 'string' || obj.n.length === 0) return null;
    if (!Array.isArray(obj.w) || obj.w.length === 0) return null;
    if (!obj.w.every((w: unknown) => typeof w === 'string')) return null;

    const payload: QrWordListPayload = {
      v: 1,
      n: obj.n as string,
      w: obj.w as string[],
    };

    if (typeof obj.t === 'string') {
      payload.t = obj.t;
    }

    return payload;
  } catch {
    return null;
  }
}
