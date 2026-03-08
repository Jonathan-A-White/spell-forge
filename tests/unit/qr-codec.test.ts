import { describe, it, expect } from 'vitest';
import { encodeWordListToQr, decodeQrPayload, type QrWordListPayload } from '../../src/features/word-lists/qr-codec';

// ─── decodeQrPayload ──────────────────────────────────────────

describe('decodeQrPayload', () => {
  it('decodes a valid SpellForge QR payload', () => {
    const raw = 'SF:{"v":1,"n":"Unit 3 Words","w":["badge","edge","judge"]}';
    const result = decodeQrPayload(raw);
    expect(result).toEqual({
      v: 1,
      n: 'Unit 3 Words',
      w: ['badge', 'edge', 'judge'],
    });
  });

  it('decodes payload with test date', () => {
    const raw = 'SF:{"v":1,"n":"Spelling Test","w":["cat","dog"],"t":"2026-03-15"}';
    const result = decodeQrPayload(raw);
    expect(result).toEqual({
      v: 1,
      n: 'Spelling Test',
      w: ['cat', 'dog'],
      t: '2026-03-15',
    });
  });

  it('returns null for non-SpellForge QR data', () => {
    expect(decodeQrPayload('https://example.com')).toBeNull();
    expect(decodeQrPayload('Hello World')).toBeNull();
    expect(decodeQrPayload('')).toBeNull();
  });

  it('returns null for SF prefix with invalid JSON', () => {
    expect(decodeQrPayload('SF:not-json')).toBeNull();
    expect(decodeQrPayload('SF:{broken')).toBeNull();
  });

  it('returns null for wrong version', () => {
    const raw = 'SF:{"v":99,"n":"Test","w":["cat"]}';
    expect(decodeQrPayload(raw)).toBeNull();
  });

  it('returns null for missing name', () => {
    expect(decodeQrPayload('SF:{"v":1,"w":["cat"]}')).toBeNull();
  });

  it('returns null for empty name', () => {
    expect(decodeQrPayload('SF:{"v":1,"n":"","w":["cat"]}')).toBeNull();
  });

  it('returns null for missing words', () => {
    expect(decodeQrPayload('SF:{"v":1,"n":"Test"}')).toBeNull();
  });

  it('returns null for empty words array', () => {
    expect(decodeQrPayload('SF:{"v":1,"n":"Test","w":[]}')).toBeNull();
  });

  it('returns null for non-string words', () => {
    expect(decodeQrPayload('SF:{"v":1,"n":"Test","w":[1,2,3]}')).toBeNull();
  });

  it('ignores unknown extra fields', () => {
    const raw = 'SF:{"v":1,"n":"Test","w":["cat"],"extra":"ignored"}';
    const result = decodeQrPayload(raw);
    expect(result).toEqual({ v: 1, n: 'Test', w: ['cat'] });
  });
});

// ─── encodeWordListToQr ──────────────────────────────────────

describe('encodeWordListToQr', () => {
  it('generates a data URL', async () => {
    const url = await encodeWordListToQr('My List', ['cat', 'dog', 'fish']);
    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it('throws for empty word list', async () => {
    await expect(encodeWordListToQr('Empty', [])).rejects.toThrow('empty word list');
  });

  it('throws for too many words', async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `word${i}`);
    await expect(encodeWordListToQr('Big', tooMany)).rejects.toThrow('Too many words');
  });
});

// ─── Round-trip ──────────────────────────────────────────────

describe('QR codec round-trip', () => {
  it('encode then decode preserves data', () => {
    // We can't decode a QR image in Node, but we can verify the payload
    // format by encoding to JSON and decoding manually
    const payload: QrWordListPayload = {
      v: 1,
      n: 'Challenge Words',
      w: ['badge', 'edge', 'judge', 'pace', 'mice'],
      t: '2026-03-15',
    };

    const encoded = 'SF:' + JSON.stringify(payload);
    const decoded = decodeQrPayload(encoded);

    expect(decoded).toEqual(payload);
  });

  it('handles special characters in list name', () => {
    const payload: QrWordListPayload = {
      v: 1,
      n: "Unit 3 — Week 6's Words",
      w: ['ice-cream', 'well-known'],
    };

    const encoded = 'SF:' + JSON.stringify(payload);
    const decoded = decodeQrPayload(encoded);

    expect(decoded).toEqual(payload);
  });

  it('handles a realistically sized word list', () => {
    const payload: QrWordListPayload = {
      v: 1,
      n: 'Unit 3 Challenge Words',
      w: [
        'badge', 'edge', 'judge', 'pace', 'mice', 'peace', 'huge',
        'giraffe', 'gems', 'price', 'celebrate', 'emergency', 'message',
        'almost', 'group',
      ],
      t: '2026-03-20',
    };

    const encoded = 'SF:' + JSON.stringify(payload);
    // Verify it fits comfortably in QR size limits
    expect(new TextEncoder().encode(encoded).length).toBeLessThan(2500);

    const decoded = decodeQrPayload(encoded);
    expect(decoded).toEqual(payload);
  });
});
