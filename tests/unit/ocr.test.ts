import { describe, it, expect, vi } from 'vitest';
import { cleanWords, normalizeWhitespace } from '../../src/ocr/utils.ts';
import { LocalOcrProvider } from '../../src/ocr/local.ts';
import { RemoteOcrProvider } from '../../src/ocr/remote.ts';
import { OcrManagerImpl } from '../../src/ocr/manager.ts';
import { addPadding } from '../../src/ocr/preprocess.ts';
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

    const mockResponse = { text: 'Spelling  Words', confidence: 0.88 };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await provider.extractWords(new Blob(['img']));

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.source).toBe('remote');
    expect(result.confidence).toBe(0.88);
    expect(result.words).toEqual(['spelling', 'words']);
    expect(result.rawText).toBe('Spelling Words');

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

  it('pads the image when OffscreenCanvas is available', async () => {
    // Minimal mock of OffscreenCanvas + createImageBitmap
    const drawImageCalls: unknown[] = [];
    const fillRectCalls: unknown[] = [];

    const fakeCtx = {
      fillStyle: '',
      fillRect: (...args: unknown[]) => fillRectCalls.push(args),
      drawImage: (...args: unknown[]) => drawImageCalls.push(args),
    };

    const outputBlob = new Blob(['padded'], { type: 'image/png' });

    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() { return fakeCtx; }
      convertToBlob() { return Promise.resolve(outputBlob); }
    }

    const fakeBitmap = { width: 200, height: 100, close: vi.fn() };

    // Install globals
    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
    vi.stubGlobal('createImageBitmap', () => Promise.resolve(fakeBitmap));

    try {
      const blob = new Blob(['test'], { type: 'image/png' });
      const result = await addPadding(blob);

      // Should return the padded blob, not the original
      expect(result).toBe(outputBlob);
      expect(result).not.toBe(blob);

      // Padding = 5% of min(200, 100) = 5
      // Canvas should be 210 x 110
      expect(fillRectCalls).toHaveLength(1);
      expect(fillRectCalls[0]).toEqual([0, 0, 210, 110]);

      // Image drawn at offset (5, 5)
      expect(drawImageCalls).toHaveLength(1);
      expect(drawImageCalls[0]).toEqual([fakeBitmap, 5, 5]);

      // Bitmap should be cleaned up
      expect(fakeBitmap.close).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
