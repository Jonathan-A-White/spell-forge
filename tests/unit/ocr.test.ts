import { describe, it, expect, vi } from 'vitest';
import { cleanWords, normalizeWhitespace } from '../../src/ocr/utils.ts';
import { correctOcrWords } from '../../src/ocr/spell-check.ts';
import { LocalOcrProvider } from '../../src/ocr/local.ts';
import { RemoteOcrProvider } from '../../src/ocr/remote.ts';
import { OcrManagerImpl } from '../../src/ocr/manager.ts';
import { addPadding, rotateImage, recognizeWithOrientationDetection } from '../../src/ocr/preprocess.ts';
import type { OcrWorker } from '../../src/ocr/preprocess.ts';
import type { RecognizerFn } from '../../src/ocr/local.ts';

// ─── Word Cleaning ───────────────────────────────────────────

describe('cleanWords', () => {
  it('splits on whitespace and newlines', () => {
    expect(cleanWords('cat  dog\nfish\t\tbird')).toEqual(['cat', 'dog', 'fish', 'bird']);
  });

  it('lowercases all words', () => {
    expect(cleanWords('Apple BANANA Cherry')).toEqual(['apple', 'banana', 'cherry']);
  });

  it('removes non-alphabetic characters', () => {
    expect(cleanWords('hello! world? 123test foo#bar')).toEqual(['hello', 'world', 'test', 'foobar']);
  });

  it('filters short tokens after stripping non-alpha chars', () => {
    // "b!!" → "b" (too short), "x9" → "x" (too short)
    expect(cleanWords('apple b!! x9 nice')).toEqual(['apple', 'nice']);
  });

  it('preserves internal hyphens and strips leading/trailing ones', () => {
    expect(cleanWords('well-known -hello- -world ice-cream')).toEqual([
      'well-known',
      'hello',
      'world',
      'ice-cream',
    ]);
  });

  it('removes duplicates', () => {
    expect(cleanWords('cat dog cat DOG fish')).toEqual(['cat', 'dog', 'fish']);
  });

  it('filters short tokens except allowed words like "a" and "i"', () => {
    expect(cleanWords('a I b c the x go by')).toEqual(['a', 'i', 'the']);
  });

  it('handles empty / whitespace-only input', () => {
    expect(cleanWords('')).toEqual([]);
    expect(cleanWords('   \n\t  ')).toEqual([]);
  });

  it('handles messy OCR output and filters noise', () => {
    const messy = '  The  qu1ck  brown  f0x!!  jumps\n\nover the... LAZY d0g. the ';
    const result = cleanWords(messy);
    // "fx" → too short (2 chars), "dg" → too short and no vowel
    // "quck" has vowel "u" so it passes
    expect(result).toEqual(['the', 'quck', 'brown', 'jumps', 'over', 'lazy']);
  });

  it('filters consonant-only noise tokens', () => {
    expect(cleanWords('str nrl srnr badge')).toEqual(['badge']);
  });

  it('filters repeated-character tokens', () => {
    expect(cleanWords('aaa eee rrr hello')).toEqual(['hello']);
  });

  it('filters tokens with excessive consonant clusters', () => {
    // "strengths" has "ngths" (5 consonants in a row) → filtered
    // "srnrle" has "srnrl" (5 consonants) → filtered
    expect(cleanWords('strengths srnrle apple price')).toEqual(['apple', 'price']);
  });

  it('keeps hyphenated words that are plausible', () => {
    expect(cleanWords('well-known ice-cream')).toEqual(['well-known', 'ice-cream']);
  });

  it('handles typical OCR garbage from word list photos', () => {
    const garbage = 'func tt ci lr te mens sal beta bi bn rt thad rs sa pha om';
    const result = cleanWords(garbage);
    // Most short/vowel-less fragments should be filtered
    expect(result).toEqual(['func', 'mens', 'sal', 'beta', 'thad', 'pha']);
  });
});

describe('normalizeWhitespace', () => {
  it('collapses runs of whitespace', () => {
    expect(normalizeWhitespace('  hello   world  ')).toBe('hello world');
  });

  it('normalizes newlines and tabs', () => {
    expect(normalizeWhitespace('a\n\nb\t\tc')).toBe('a b c');
  });
});

// ─── correctOcrWords (spell-check post-processing) ──────────

describe('correctOcrWords', () => {
  it('leaves correctly spelled words unchanged', () => {
    expect(correctOcrWords(['badge', 'edge', 'judge'])).toEqual(['badge', 'edge', 'judge']);
  });

  it('corrects d→a substitution (dlmost → almost)', () => {
    expect(correctOcrWords(['dlmost'])).toEqual(['almost']);
  });

  it('corrects d→a substitution (pedce → peace)', () => {
    expect(correctOcrWords(['pedce'])).toEqual(['peace']);
  });

  it('corrects rn→m substitution (cornputer → computer)', () => {
    expect(correctOcrWords(['cornputer'])).toEqual(['computer']);
  });

  it('corrects l→i substitution (prlce → price)', () => {
    expect(correctOcrWords(['prlce'])).toEqual(['price']);
  });

  it('leaves unknown words unchanged when no correction found', () => {
    expect(correctOcrWords(['xyzqwk'])).toEqual(['xyzqwk']);
  });

  it('handles mixed correct and incorrect words', () => {
    const input = ['badge', 'dlmost', 'edge', 'pedce', 'huge'];
    const result = correctOcrWords(input);
    expect(result).toEqual(['badge', 'almost', 'edge', 'peace', 'huge']);
  });

  it('handles empty input', () => {
    expect(correctOcrWords([])).toEqual([]);
  });
});

// ─── recognizeWithOrientationDetection ──────────────────────

describe('recognizeWithOrientationDetection', () => {
  it('picks the rotation that produces the most plausible words', async () => {
    // Simulate: 0° returns garbage, 180° returns real words
    const calls: number[] = [];
    const fakeWorker: OcrWorker = {
      recognize: async (_image, opts) => {
        const angle = (opts?.rotateRadians as number) ?? 0;
        calls.push(angle);
        if (Math.abs(angle - Math.PI) < 0.01) {
          // 180° — correct orientation
          return { data: { text: 'badge edge judge pace mice', confidence: 85 } };
        }
        // All other orientations — garbage
        return { data: { text: 'xqz rrr ttt bbb nnn', confidence: 70 } };
      },
    };

    const result = await recognizeWithOrientationDetection(fakeWorker, 'fake-image');

    expect(result.text).toBe('badge edge judge pace mice');
    expect(result.confidence).toBeCloseTo(0.85);
  });

  it('short-circuits when enough words with high confidence are found', async () => {
    const calls: number[] = [];
    const fakeWorker: OcrWorker = {
      recognize: async (_image, opts) => {
        const angle = (opts?.rotateRadians as number) ?? 0;
        calls.push(angle);
        if (angle === 0) {
          // Upright — lots of real words with high confidence
          return {
            data: {
              text: 'badge edge judge pace mice peace huge giraffe gems price',
              confidence: 90,
            },
          };
        }
        return { data: { text: 'garbage noise', confidence: 50 } };
      },
    };

    const result = await recognizeWithOrientationDetection(fakeWorker, 'fake-image');

    // Should short-circuit after 0° (≥5 words and ≥80 confidence)
    expect(calls).toHaveLength(1);
    expect(result.text).toContain('badge');
    expect(result.confidence).toBeCloseTo(0.90);
  });

  it('does not pass rotateRadians for 0° angle', async () => {
    const receivedOpts: Array<Record<string, unknown> | undefined> = [];
    const fakeWorker: OcrWorker = {
      recognize: async (_image, opts) => {
        receivedOpts.push(opts as Record<string, unknown> | undefined);
        // Return high-quality result for all rotations to prevent short-circuit issues
        return { data: { text: 'badge edge judge pace mice peace huge', confidence: 90 } };
      },
    };

    await recognizeWithOrientationDetection(fakeWorker, 'fake-image');

    // First call (0°) should have no rotateRadians
    expect(receivedOpts[0]).toEqual({});
  });

  it('uses confidence as tiebreaker when word counts are equal', async () => {
    const fakeWorker: OcrWorker = {
      recognize: async (_image, opts) => {
        const angle = (opts?.rotateRadians as number) ?? 0;
        if (angle === 0) {
          return { data: { text: 'apple banana cherry', confidence: 60 } };
        }
        if (Math.abs(angle - Math.PI) < 0.01) {
          // Same word count but higher confidence
          return { data: { text: 'edge badge judge', confidence: 80 } };
        }
        return { data: { text: 'xxx yyy zzz', confidence: 40 } };
      },
    };

    const result = await recognizeWithOrientationDetection(fakeWorker, 'fake-image');

    // Both 0° and 180° produce 3 words, but 180° has higher confidence
    expect(result.text).toBe('edge badge judge');
    expect(result.confidence).toBeCloseTo(0.80);
  });

  it('continues trying other rotations when one attempt fails', async () => {
    let callCount = 0;
    const fakeWorker: OcrWorker = {
      recognize: async (_image, opts) => {
        callCount++;
        const angle = (opts?.rotateRadians as number) ?? 0;
        if (angle === 0) {
          throw new Error('Tesseract WASM error');
        }
        if (Math.abs(angle - Math.PI) < 0.01) {
          return { data: { text: 'badge edge judge pace mice', confidence: 85 } };
        }
        return { data: { text: 'xqz rrr ttt', confidence: 30 } };
      },
    };

    const result = await recognizeWithOrientationDetection(fakeWorker, 'fake-image');

    // Should recover from the 0° failure and find good results at 180°
    expect(result.text).toBe('badge edge judge pace mice');
    expect(result.confidence).toBeCloseTo(0.85);
    expect(callCount).toBeGreaterThan(1);
  });

  it('returns empty result when all rotation attempts fail', async () => {
    const fakeWorker: OcrWorker = {
      recognize: async () => {
        throw new Error('Tesseract WASM error');
      },
    };

    const result = await recognizeWithOrientationDetection(fakeWorker, 'fake-image');

    expect(result.text).toBe('');
    expect(result.confidence).toBe(-1 / 100);
  });
});

// ─── LocalOcrProvider ────────────────────────────────────────

describe('LocalOcrProvider', () => {
  it('isAvailable() returns false when no recognizer', () => {
    const provider = new LocalOcrProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it('isAvailable() returns true when recognizer is set', () => {
    const recognizer: RecognizerFn = async () => ({ text: '', confidence: 0 });
    const provider = new LocalOcrProvider(recognizer);
    expect(provider.isAvailable()).toBe(true);
  });

  it('throws when extractWords called without recognizer', async () => {
    const provider = new LocalOcrProvider();
    await expect(provider.extractWords(new Blob())).rejects.toThrow('not available');
  });

  it('returns cleaned words from recognizer', async () => {
    const recognizer: RecognizerFn = async () => ({
      text: '  Hello  WORLD  hello ',
      confidence: 0.95,
    });
    const provider = new LocalOcrProvider(recognizer);
    const result = await provider.extractWords(new Blob());

    expect(result.source).toBe('local');
    expect(result.confidence).toBe(0.95);
    expect(result.words).toEqual(['hello', 'world']);
    expect(result.rawText).toBe('Hello WORLD hello');
  });

  it('applies spell-check correction to OCR output', async () => {
    const recognizer: RecognizerFn = async () => ({
      text: 'badge edge dlmost pedce',
      confidence: 0.9,
    });
    const provider = new LocalOcrProvider(recognizer);
    const result = await provider.extractWords(new Blob());

    expect(result.words).toContain('almost');
    expect(result.words).toContain('peace');
    expect(result.words).toContain('badge');
    expect(result.words).toContain('edge');
  });
});

// ─── RemoteOcrProvider ───────────────────────────────────────

describe('RemoteOcrProvider', () => {
  it('isAvailable() returns false without endpoint', () => {
    const provider = new RemoteOcrProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it('isAvailable() returns true with endpoint', () => {
    const provider = new RemoteOcrProvider('https://ocr.example.com/api');
    expect(provider.isAvailable()).toBe(true);
  });

  it('throws when extractWords called without endpoint', async () => {
    const provider = new RemoteOcrProvider();
    await expect(provider.extractWords(new Blob())).rejects.toThrow('not configured');
  });

  it('posts image to endpoint and returns cleaned result', async () => {
    const provider = new RemoteOcrProvider('https://ocr.example.com/api');

    const mockResponse = { text: 'apple banana', confidence: 0.88 };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await provider.extractWords(new Blob(['img']));

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.source).toBe('remote');
    expect(result.confidence).toBe(0.88);
    expect(result.words).toEqual(['apple', 'banana']);
    expect(result.rawText).toBe('apple banana');

    fetchSpy.mockRestore();
  });

  it('applies spell-check correction to remote OCR output', async () => {
    const provider = new RemoteOcrProvider('https://ocr.example.com/api');

    const mockResponse = { text: 'dlmost pedce badge', confidence: 0.9 };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await provider.extractWords(new Blob(['img']));

    expect(result.words).toContain('almost');
    expect(result.words).toContain('peace');
    expect(result.words).toContain('badge');

    fetchSpy.mockRestore();
  });

  it('throws on non-OK response', async () => {
    const provider = new RemoteOcrProvider('https://ocr.example.com/api');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('error', { status: 500, statusText: 'Internal Server Error' }),
    );

    await expect(provider.extractWords(new Blob())).rejects.toThrow('500');

    fetchSpy.mockRestore();
  });
});

// ─── OcrManager ──────────────────────────────────────────────

function makeLocalProvider(opts?: {
  available?: boolean;
  text?: string;
  confidence?: number;
  shouldThrow?: boolean;
}): LocalOcrProvider {
  const { available = true, text = 'hello world', confidence = 0.9, shouldThrow = false } = opts ?? {};

  if (!available) {
    return new LocalOcrProvider(); // no recognizer → unavailable
  }

  const recognizer: RecognizerFn = async () => {
    if (shouldThrow) throw new Error('local engine crashed');
    return { text, confidence };
  };

  return new LocalOcrProvider(recognizer);
}

function makeRemoteProvider(opts?: {
  endpoint?: string;
  text?: string;
  confidence?: number;
  shouldThrow?: boolean;
}): RemoteOcrProvider {
  const {
    endpoint = 'https://ocr.example.com',
    text = 'remote result',
    confidence = 0.85,
    shouldThrow = false,
  } = opts ?? {};

  const provider = new RemoteOcrProvider(endpoint);

  // Mock fetch for tests that use the remote provider
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (shouldThrow) throw new Error('network error');
    return new Response(JSON.stringify({ text, confidence }), { status: 200 });
  });

  return provider;
}

describe('OcrManager', () => {
  it('tries local first and returns result', async () => {
    const local = makeLocalProvider({ text: 'apple banana', confidence: 0.92 });
    const remote = new RemoteOcrProvider(); // no endpoint — unavailable

    const manager = new OcrManagerImpl(local, remote);
    const result = await manager.extractWords(new Blob());

    expect(result.source).toBe('local');
    expect(result.words).toEqual(['apple', 'banana']);
  });

  it('falls back to remote when local is unavailable', async () => {
    const local = makeLocalProvider({ available: false });
    const remote = makeRemoteProvider({ text: 'cherry date', confidence: 0.8 });

    const manager = new OcrManagerImpl(local, remote);
    const result = await manager.extractWords(new Blob());

    expect(result.source).toBe('remote');
    expect(result.words).toEqual(['cherry', 'date']);

    vi.restoreAllMocks();
  });

  it('falls back to remote when local throws', async () => {
    const local = makeLocalProvider({ shouldThrow: true });
    const remote = makeRemoteProvider({ text: 'elderberry fig', confidence: 0.75 });

    const manager = new OcrManagerImpl(local, remote);
    const result = await manager.extractWords(new Blob());

    expect(result.source).toBe('remote');
    expect(result.words).toEqual(['elderberry', 'fig']);

    vi.restoreAllMocks();
  });

  it('falls back to remote when local confidence is below threshold', async () => {
    const local = makeLocalProvider({ text: 'low conf', confidence: 0.1 });
    const remote = makeRemoteProvider({ text: 'grape honeydew', confidence: 0.88 });

    const manager = new OcrManagerImpl(local, remote, { confidenceThreshold: 0.5 });
    const result = await manager.extractWords(new Blob());

    expect(result.source).toBe('remote');
    expect(result.words).toEqual(['grape', 'honeydew']);

    vi.restoreAllMocks();
  });

  it('throws when both providers fail', async () => {
    const local = makeLocalProvider({ shouldThrow: true });
    const remote = makeRemoteProvider({ shouldThrow: true });

    const manager = new OcrManagerImpl(local, remote);

    await expect(manager.extractWords(new Blob())).rejects.toThrow('All OCR providers failed');

    vi.restoreAllMocks();
  });

  it('throws when both providers are unavailable', async () => {
    const local = new LocalOcrProvider();
    const remote = new RemoteOcrProvider();

    const manager = new OcrManagerImpl(local, remote);

    await expect(manager.extractWords(new Blob())).rejects.toThrow('All OCR providers failed');
  });

  it('setRemoteEndpoint configures the remote provider', () => {
    const local = new LocalOcrProvider();
    const remote = new RemoteOcrProvider();

    const manager = new OcrManagerImpl(local, remote);
    expect(remote.isAvailable()).toBe(false);

    manager.setRemoteEndpoint('https://new-endpoint.example.com');
    expect(remote.isAvailable()).toBe(true);
    expect(remote.getEndpoint()).toBe('https://new-endpoint.example.com');
  });

  it('returns low-confidence local result when remote is unavailable and words were found', async () => {
    const local = makeLocalProvider({ text: 'badge edge judge', confidence: 0.24 });
    const remote = new RemoteOcrProvider(); // not configured

    const manager = new OcrManagerImpl(local, remote, { confidenceThreshold: 0.5 });
    const result = await manager.extractWords(new Blob());

    expect(result.source).toBe('local');
    expect(result.confidence).toBe(0.24);
    expect(result.words).toEqual(['badge', 'edge', 'judge']);
  });

  it('throws when local has low confidence with no words and remote is unavailable', async () => {
    const local = makeLocalProvider({ text: '  ', confidence: 0.1 });
    const remote = new RemoteOcrProvider(); // not configured

    const manager = new OcrManagerImpl(local, remote, { confidenceThreshold: 0.5 });

    await expect(manager.extractWords(new Blob())).rejects.toThrow('All OCR providers failed');
  });

  it('returns local result when confidence equals threshold', async () => {
    const local = makeLocalProvider({ text: 'exact threshold', confidence: 0.5 });
    const remote = new RemoteOcrProvider();

    const manager = new OcrManagerImpl(local, remote, { confidenceThreshold: 0.5 });
    const result = await manager.extractWords(new Blob());

    expect(result.source).toBe('local');
    expect(result.confidence).toBe(0.5);
  });
});

// ─── addPadding ─────────────────────────────────────────────

describe('addPadding', () => {
  it('returns original blob when OffscreenCanvas is unavailable', async () => {
    // jsdom does not provide OffscreenCanvas, so addPadding gracefully falls back
    const blob = new Blob(['test'], { type: 'image/png' });
    const result = await addPadding(blob);
    expect(result).toBe(blob);
  });

  /**
   * Helper: set up OffscreenCanvas + createImageBitmap mocks and run addPadding.
   * Returns the captured draw calls and result for assertions.
   */
  async function runWithMockCanvas(bitmapWidth: number, bitmapHeight: number) {
    const drawImageCalls: unknown[][] = [];
    const fillRectCalls: unknown[][] = [];

    const fakeCtx = {
      fillStyle: '',
      fillRect: (...args: unknown[]) => fillRectCalls.push(args),
      drawImage: (...args: unknown[]) => drawImageCalls.push(args),
    };

    // Output blob must exceed MIN_BLOB_SIZE (1024 bytes) to pass validation
    const outputBlob = new Blob([new Uint8Array(2048)], { type: 'image/png' });

    let canvasWidth = 0;
    let canvasHeight = 0;
    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        canvasWidth = w;
        canvasHeight = h;
      }
      getContext() { return fakeCtx; }
      convertToBlob() { return Promise.resolve(outputBlob); }
    }

    const fakeBitmap = { width: bitmapWidth, height: bitmapHeight, close: vi.fn() };

    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
    vi.stubGlobal('createImageBitmap', () => Promise.resolve(fakeBitmap));

    const blob = new Blob(['test'], { type: 'image/png' });
    try {
      const result = await addPadding(blob);
      return { result, blob, outputBlob, fakeBitmap, drawImageCalls, fillRectCalls, canvasWidth, canvasHeight };
    } finally {
      vi.unstubAllGlobals();
    }
  }

  it('pads a small image without downscaling', async () => {
    const { result, blob, outputBlob, fakeBitmap, drawImageCalls, fillRectCalls, canvasWidth, canvasHeight } =
      await runWithMockCanvas(200, 100);

    // Should return the padded blob, not the original
    expect(result).toBe(outputBlob);
    expect(result).not.toBe(blob);

    // No downscaling: drawWidth=200, drawHeight=100
    // Padding = 5% of min(200, 100) = 5
    // Canvas should be 210 x 110
    expect(canvasWidth).toBe(210);
    expect(canvasHeight).toBe(110);
    expect(fillRectCalls).toHaveLength(1);
    expect(fillRectCalls[0]).toEqual([0, 0, 210, 110]);

    // drawImage uses 9-arg form: (bitmap, sx, sy, sw, sh, dx, dy, dw, dh)
    expect(drawImageCalls).toHaveLength(1);
    expect(drawImageCalls[0]).toEqual([fakeBitmap, 0, 0, 200, 100, 5, 5, 200, 100]);

    // Bitmap should be cleaned up
    expect(fakeBitmap.close).toHaveBeenCalled();
  });

  it('downscales large images before padding', async () => {
    // Simulate a 4000x3000 phone photo (exceeds MAX_DIMENSION of 2048)
    const { result, outputBlob, fakeBitmap, drawImageCalls, canvasWidth, canvasHeight } =
      await runWithMockCanvas(4000, 3000);

    expect(result).toBe(outputBlob);

    // Scale factor = 2048/4000 = 0.512 → drawWidth=2048, drawHeight=1536
    // Padding = 5% of min(2048, 1536) = round(76.8) = 77
    // Canvas = 2048 + 154 x 1536 + 154 = 2202 x 1690
    expect(canvasWidth).toBe(2202);
    expect(canvasHeight).toBe(1690);

    // drawImage should scale from full source to downscaled destination
    expect(drawImageCalls).toHaveLength(1);
    expect(drawImageCalls[0]).toEqual([fakeBitmap, 0, 0, 4000, 3000, 77, 77, 2048, 1536]);

    expect(fakeBitmap.close).toHaveBeenCalled();
  });

  it('falls back to original when convertToBlob produces a tiny blob', async () => {
    const fakeCtx = {
      fillStyle: '',
      fillRect: () => {},
      drawImage: () => {},
    };

    // Tiny output blob (below MIN_BLOB_SIZE) simulates a blank/corrupt canvas
    const tinyBlob = new Blob(['x'], { type: 'image/png' });

    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(w: number, h: number) { this.width = w; this.height = h; }
      getContext() { return fakeCtx; }
      convertToBlob() { return Promise.resolve(tinyBlob); }
    }

    const fakeBitmap = { width: 200, height: 100, close: vi.fn() };
    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
    vi.stubGlobal('createImageBitmap', () => Promise.resolve(fakeBitmap));

    try {
      const original = new Blob(['original'], { type: 'image/png' });
      const result = await addPadding(original);
      // Should fall back to original since output was suspiciously small
      expect(result).toBe(original);
      expect(fakeBitmap.close).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back to original when createImageBitmap throws (OOM)', async () => {
    vi.stubGlobal('OffscreenCanvas', class { constructor() {} });
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('OOM')));

    try {
      const original = new Blob(['original'], { type: 'image/png' });
      const result = await addPadding(original);
      expect(result).toBe(original);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ─── rotateImage ────────────────────────────────────────────

describe('rotateImage', () => {
  it('returns null when OffscreenCanvas is unavailable', async () => {
    // jsdom does not provide OffscreenCanvas
    const blob = new Blob(['test'], { type: 'image/png' });
    const result = await rotateImage(blob, Math.PI / 2);
    expect(result).toBeNull();
  });

  it('rotates 90° CW (swaps width and height)', async () => {
    const drawImageCalls: unknown[][] = [];

    const fakeCtx = {
      fillStyle: '',
      fillRect: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: (...args: unknown[]) => drawImageCalls.push(args),
    };

    const outputBlob = new Blob([new Uint8Array(2048)], { type: 'image/png' });

    let canvasWidth = 0;
    let canvasHeight = 0;
    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        canvasWidth = w;
        canvasHeight = h;
      }
      getContext() { return fakeCtx; }
      convertToBlob() { return Promise.resolve(outputBlob); }
    }

    const fakeBitmap = { width: 200, height: 100, close: vi.fn() };
    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
    vi.stubGlobal('createImageBitmap', () => Promise.resolve(fakeBitmap));

    try {
      const blob = new Blob(['test'], { type: 'image/png' });
      const result = await rotateImage(blob, Math.PI / 2);

      expect(result).toBe(outputBlob);
      // 90° rotation swaps dimensions: 200x100 → 100x200
      expect(canvasWidth).toBe(100);
      expect(canvasHeight).toBe(200);
      expect(fakeCtx.translate).toHaveBeenCalledWith(50, 100);
      expect(fakeCtx.rotate).toHaveBeenCalledWith(Math.PI / 2);
      expect(drawImageCalls).toHaveLength(1);
      expect(drawImageCalls[0]).toEqual([fakeBitmap, -100, -50]);
      expect(fakeBitmap.close).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rotates 180° (keeps same dimensions)', async () => {
    const fakeCtx = {
      fillStyle: '',
      fillRect: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
    };

    const outputBlob = new Blob([new Uint8Array(2048)], { type: 'image/png' });

    let canvasWidth = 0;
    let canvasHeight = 0;
    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        canvasWidth = w;
        canvasHeight = h;
      }
      getContext() { return fakeCtx; }
      convertToBlob() { return Promise.resolve(outputBlob); }
    }

    const fakeBitmap = { width: 200, height: 100, close: vi.fn() };
    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
    vi.stubGlobal('createImageBitmap', () => Promise.resolve(fakeBitmap));

    try {
      const blob = new Blob(['test'], { type: 'image/png' });
      const result = await rotateImage(blob, Math.PI);

      expect(result).toBe(outputBlob);
      // 180° keeps same dimensions
      expect(canvasWidth).toBe(200);
      expect(canvasHeight).toBe(100);
      expect(fakeBitmap.close).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back to null when createImageBitmap throws', async () => {
    vi.stubGlobal('OffscreenCanvas', class { constructor() {} });
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('OOM')));

    try {
      const blob = new Blob(['test'], { type: 'image/png' });
      const result = await rotateImage(blob, Math.PI / 2);
      expect(result).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
