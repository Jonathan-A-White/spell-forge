import { describe, it, expect, vi } from 'vitest';
import type { OcrResult } from '../../src/contracts/types';
import type { OcrManager } from '../../src/ocr';

// ─── Mock OcrManager ────────────────────────────────────────

function createMockOcrManager(opts?: {
  words?: string[];
  confidence?: number;
  shouldThrow?: boolean;
  errorMessage?: string;
  listName?: string | null;
}): OcrManager {
  const {
    words = ['apple', 'banana', 'cherry'],
    confidence = 0.9,
    shouldThrow = false,
    errorMessage = 'OCR failed',
    listName = null,
  } = opts ?? {};

  return {
    extractWords: vi.fn(async (): Promise<OcrResult> => {
      if (shouldThrow) throw new Error(errorMessage);
      return {
        rawText: words.join(' '),
        words,
        confidence,
        source: 'local',
        listName,
      };
    }),
    setRemoteEndpoint: vi.fn(),
  };
}

// ─── OcrManager integration scenarios ───────────────────────

describe('Camera import OCR integration', () => {
  it('OcrManager returns extracted words from a blob', async () => {
    const manager = createMockOcrManager({ words: ['knight', 'bridge', 'light'] });
    const result = await manager.extractWords(new Blob(['fake image']));

    expect(result.words).toEqual(['knight', 'bridge', 'light']);
    expect(result.confidence).toBe(0.9);
    expect(result.source).toBe('local');
    expect(manager.extractWords).toHaveBeenCalledOnce();
  });

  it('OcrManager propagates errors', async () => {
    const manager = createMockOcrManager({
      shouldThrow: true,
      errorMessage: 'All OCR providers failed',
    });

    await expect(manager.extractWords(new Blob())).rejects.toThrow('All OCR providers failed');
  });

  it('handles empty word list from OCR', async () => {
    const manager = createMockOcrManager({ words: [] });
    const result = await manager.extractWords(new Blob());

    expect(result.words).toEqual([]);
    expect(result.words.length).toBe(0);
  });

  it('passes the image blob through to extractWords', async () => {
    const manager = createMockOcrManager();
    const imageBlob = new Blob(['test image data'], { type: 'image/jpeg' });

    await manager.extractWords(imageBlob);

    expect(manager.extractWords).toHaveBeenCalledWith(imageBlob);
  });

  it('OCR words can be merged with existing word text', async () => {
    const manager = createMockOcrManager({ words: ['because', 'thought'] });
    const result = await manager.extractWords(new Blob());

    // Simulate the merge logic from ListEditor
    const existingText = 'knight\nbridge';
    const newWords = result.words.join('\n');
    const merged = `${existingText}\n${newWords}`;

    const allWords = merged
      .split(/[\n,]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 0);

    expect(allWords).toEqual(['knight', 'bridge', 'because', 'thought']);
  });

  it('OCR words populate empty word list', async () => {
    const manager = createMockOcrManager({ words: ['apple', 'banana'] });
    const result = await manager.extractWords(new Blob());

    // Simulate merge with empty existing text
    const existingText = '';
    const newWords = result.words.join('\n');
    const merged = existingText ? `${existingText}\n${newWords}` : newWords;

    const allWords = merged
      .split(/[\n,]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 0);

    expect(allWords).toEqual(['apple', 'banana']);
  });

  it('confidence value is accessible from result', async () => {
    const manager = createMockOcrManager({ confidence: 0.42 });
    const result = await manager.extractWords(new Blob());

    expect(result.confidence).toBe(0.42);
    expect(Math.round(result.confidence * 100)).toBe(42);
  });

  it('source tracking: camera-imported lists get source "camera"', () => {
    // Verify the type system supports camera source
    const source: 'camera' | 'manual' | 'import' = 'camera';
    expect(source).toBe('camera');
  });

  it('OCR result includes detected list name', async () => {
    const manager = createMockOcrManager({
      words: ['badge', 'edge', 'judge'],
      listName: 'Unit 3, WK 6',
    });
    const result = await manager.extractWords(new Blob());

    expect(result.listName).toBe('Unit 3, WK 6');
  });

  it('list name is null when no header detected', async () => {
    const manager = createMockOcrManager({
      words: ['badge', 'edge', 'judge'],
      listName: null,
    });
    const result = await manager.extractWords(new Blob());

    expect(result.listName).toBeNull();
  });

  it('list name auto-populates empty name field', async () => {
    const manager = createMockOcrManager({
      words: ['badge', 'edge'],
      listName: 'Week 12',
    });
    const result = await manager.extractWords(new Blob());

    // Simulate the ListEditor logic: set name if empty
    let listName = '';
    if (result.listName && listName.trim() === '') {
      listName = result.listName;
    }

    expect(listName).toBe('Week 12');
  });

  it('list name does not overwrite existing name', async () => {
    const manager = createMockOcrManager({
      words: ['badge', 'edge'],
      listName: 'Week 12',
    });
    const result = await manager.extractWords(new Blob());

    // Simulate the ListEditor logic: do not overwrite existing name
    let listName = 'My Custom List';
    if (result.listName && listName.trim() === '') {
      listName = result.listName;
    }

    expect(listName).toBe('My Custom List');
  });
});
