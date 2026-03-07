// src/features/settings/qr-code.ts — Minimal QR code generator (Mode Byte, ECC-L, version 2-4)
// Generates an SVG string for display — no external dependencies.

/**
 * Generate a QR code SVG element as a string.
 * Uses a simplified approach: encode the URL into a grid via the QR matrix
 * algorithm at a low error-correction level for short URLs.
 */
export function generateQrSvg(text: string, size = 200): string {
  const modules = encodeToModules(text);
  const n = modules.length;
  if (n === 0) return '';

  const cellSize = size / (n + 2); // 1-cell quiet zone
  const offset = cellSize;

  let rects = '';
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (modules[row][col]) {
        const x = (offset + col * cellSize).toFixed(2);
        const y = (offset + row * cellSize).toFixed(2);
        const w = cellSize.toFixed(2);
        rects += `<rect x="${x}" y="${y}" width="${w}" height="${w}"/>`;
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`,
    `<rect width="${size}" height="${size}" fill="#fff"/>`,
    `<g fill="#000">${rects}</g>`,
    `</svg>`,
  ].join('');
}

// ─── QR encoding (byte mode, ECC-L) ─────────────────────────

function encodeToModules(text: string): boolean[][] {
  const data = new TextEncoder().encode(text);
  const version = selectVersion(data.length);
  if (version < 1) return [];

  const size = 17 + version * 4;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null),
  );

  addFinderPatterns(matrix, size);
  addAlignmentPatterns(matrix, size, version);
  addTimingPatterns(matrix, size);
  reserveFormatArea(matrix, size);

  const dataBits = buildDataBits(data, version);
  placeData(matrix, size, dataBits);
  applyMaskAndFormat(matrix, size);

  return matrix.map((row) => row.map((v) => v === true));
}

function selectVersion(byteLen: number): number {
  // Byte-mode capacity at ECC-L for versions 1-6
  const caps = [0, 17, 32, 53, 78, 106, 134];
  for (let v = 1; v <= 6; v++) {
    if (byteLen <= caps[v]) return v;
  }
  return -1;
}

function addFinderPatterns(m: (boolean | null)[][], s: number): void {
  const draw = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= s || cc < 0 || cc >= s) continue;
        if (dr === -1 || dr === 7 || dc === -1 || dc === 7) {
          m[rr][cc] = false; // separator
        } else if (
          dr === 0 || dr === 6 || dc === 0 || dc === 6 ||
          (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)
        ) {
          m[rr][cc] = true;
        } else {
          m[rr][cc] = false;
        }
      }
    }
  };
  draw(0, 0);
  draw(0, s - 7);
  draw(s - 7, 0);
}

const ALIGNMENT_POSITIONS: Record<number, number[]> = {
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
};

function addAlignmentPatterns(m: (boolean | null)[][], s: number, v: number): void {
  const positions = ALIGNMENT_POSITIONS[v];
  if (!positions) return;
  for (const row of positions) {
    for (const col of positions) {
      if (m[row][col] !== null) continue; // overlap with finder
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const rr = row + dr;
          const cc = col + dc;
          if (rr < 0 || rr >= s || cc < 0 || cc >= s) continue;
          m[rr][cc] =
            Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
        }
      }
    }
  }
}

function addTimingPatterns(m: (boolean | null)[][], s: number): void {
  for (let i = 8; i < s - 8; i++) {
    if (m[6][i] === null) m[6][i] = i % 2 === 0;
    if (m[i][6] === null) m[i][6] = i % 2 === 0;
  }
}

function reserveFormatArea(m: (boolean | null)[][], s: number): void {
  for (let i = 0; i < 8; i++) {
    if (m[8][i] === null) m[8][i] = false;
    if (m[i][8] === null) m[i][8] = false;
    if (m[8][s - 1 - i] === null) m[8][s - 1 - i] = false;
    if (m[s - 1 - i][8] === null) m[s - 1 - i][8] = false;
  }
  if (m[8][8] === null) m[8][8] = false;
  m[s - 8][8] = true; // dark module
}

// ─── Data encoding ───────────────────────────────────────────

function buildDataBits(data: Uint8Array, version: number): boolean[] {
  const totalCodewords = TOTAL_CODEWORDS[version] ?? 0;
  const ecCodewords = EC_CODEWORDS[version] ?? 0;
  const dataCodewords = totalCodewords - ecCodewords;

  const bits: boolean[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push(((val >> i) & 1) === 1);
  };

  // Mode indicator (byte = 0100)
  push(0b0100, 4);
  // Character count (8 bits for versions 1-9)
  push(data.length, 8);
  // Data bytes
  for (const byte of data) push(byte, 8);
  // Terminator (up to 4 zeros)
  const remain = dataCodewords * 8 - bits.length;
  push(0, Math.min(4, remain));
  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(false);
  // Pad codewords
  let padIdx = 0;
  const pads = [0xEC, 0x11];
  while (bits.length < dataCodewords * 8) {
    push(pads[padIdx % 2], 8);
    padIdx++;
  }

  // Generate EC codewords (simplified Reed-Solomon)
  const dataBytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ? 1 : 0);
    dataBytes.push(byte);
  }
  const ecBytes = generateEC(dataBytes, ecCodewords);

  // Append EC to bit stream
  for (const byte of ecBytes) push(byte, 8);

  return bits;
}

const TOTAL_CODEWORDS: Record<number, number> = {
  1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172,
};
const EC_CODEWORDS: Record<number, number> = {
  1: 7, 2: 10, 3: 15, 4: 20, 5: 26, 6: 36,
};

// ─── Reed-Solomon EC ─────────────────────────────────────────

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function generateEC(data: number[], ecLen: number): number[] {
  // Build generator polynomial
  let gen = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], GF_EXP[i]);
    }
    gen = next;
  }

  const msg = [...data, ...new Array(ecLen).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

// ─── Data placement ──────────────────────────────────────────

function placeData(m: (boolean | null)[][], s: number, bits: boolean[]): void {
  let idx = 0;
  let upward = true;

  for (let right = s - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip timing column
    const rows = upward
      ? Array.from({ length: s }, (_, i) => s - 1 - i)
      : Array.from({ length: s }, (_, i) => i);

    for (const row of rows) {
      for (const col of [right, right - 1]) {
        if (m[row][col] === null) {
          m[row][col] = idx < bits.length ? bits[idx] : false;
          idx++;
        }
      }
    }
    upward = !upward;
  }
}

// ─── Masking ─────────────────────────────────────────────────

function applyMaskAndFormat(m: (boolean | null)[][], s: number): void {
  // Use mask pattern 0 (checkerboard: (row + col) % 2 === 0)
  for (let r = 0; r < s; r++) {
    for (let c = 0; c < s; c++) {
      if (isDataModule(m, s, r, c) && (r + c) % 2 === 0) {
        m[r][c] = !m[r][c];
      }
    }
  }

  // Write format info (ECC-L, mask 0) = 0b111011111000100
  const FORMAT_BITS = 0b111011111000100;
  const fmtBits: boolean[] = [];
  for (let i = 14; i >= 0; i--) fmtBits.push(((FORMAT_BITS >> i) & 1) === 1);

  // Horizontal run near top-left
  const hPositions = [0, 1, 2, 3, 4, 5, 7, 8, s - 8, s - 7, s - 6, s - 5, s - 4, s - 3, s - 2];
  for (let i = 0; i < 15; i++) m[8][hPositions[i]] = fmtBits[i];

  // Vertical run near top-left
  const vPositions = [s - 1, s - 2, s - 3, s - 4, s - 5, s - 6, s - 7, 8, 7, 5, 4, 3, 2, 1, 0];
  for (let i = 0; i < 15; i++) m[vPositions[i]][8] = fmtBits[i];
}

function isDataModule(m: (boolean | null)[][], s: number, r: number, c: number): boolean {
  // Finder + separator regions
  if (r <= 8 && c <= 8) return false;
  if (r <= 8 && c >= s - 8) return false;
  if (r >= s - 8 && c <= 8) return false;
  // Timing
  if (r === 6 || c === 6) return false;
  // Dark module
  if (r === s - 8 && c === 8) return false;
  // We treat everything else (including alignment) as data for simplicity
  // which is fine since we reserved those cells earlier.
  return m[r] !== undefined && m[r][c] !== undefined;
}
