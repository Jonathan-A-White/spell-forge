import { describe, it, expect } from 'vitest';
import { generateMemoryAids } from '../../src/core/memory-aids';
import { generatePhoneticAid } from '../../src/core/memory-aids/phonetic-aid';
import { generatePatternAid } from '../../src/core/memory-aids/pattern-aid';
import { generateMnemonicAid } from '../../src/core/memory-aids/mnemonic-aid';

// ─── generateMemoryAids (engine) ──────────────────────────────

describe('generateMemoryAids', () => {
  it('returns exactly 3 aids: phonetic, pattern, mnemonic', () => {
    const aids = generateMemoryAids('cat');
    expect(aids).toHaveLength(3);
    expect(aids[0].type).toBe('phonetic');
    expect(aids[1].type).toBe('pattern');
    expect(aids[2].type).toBe('mnemonic');
  });

  it('handles single-syllable words', () => {
    const aids = generateMemoryAids('dog');
    expect(aids[0].type).toBe('phonetic');
    expect(aids[1].type).toBe('pattern');
    expect(aids[2].type).toBe('mnemonic');
  });

  it('handles multi-syllable words', () => {
    const aids = generateMemoryAids('beautiful');
    expect(aids).toHaveLength(3);
  });
});

// ─── Phonetic Aid ─────────────────────────────────────────────

describe('generatePhoneticAid', () => {
  it('returns type "phonetic"', () => {
    const aid = generatePhoneticAid('cat');
    expect(aid.type).toBe('phonetic');
  });

  it('breaks multi-syllable words into chunks', () => {
    const aid = generatePhoneticAid('together');
    expect(aid.chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('each chunk has text and pronunciation', () => {
    const aid = generatePhoneticAid('important');
    for (const chunk of aid.chunks) {
      expect(chunk.text).toBeTruthy();
      expect(chunk.pronunciation).toBeTruthy();
    }
  });

  it('summary contains dot-separated syllables', () => {
    const aid = generatePhoneticAid('tomorrow');
    expect(aid.summary).toContain('Say it:');
    // Should have dot separators for multi-syllable words
    expect(aid.summary).toContain('·');
  });

  it('handles short words', () => {
    const aid = generatePhoneticAid('cat');
    expect(aid.chunks.length).toBeGreaterThanOrEqual(1);
    expect(aid.chunks[0].text).toBe('cat');
  });
});

// ─── Pattern Aid ──────────────────────────────────────────────

describe('generatePatternAid', () => {
  it('returns type "pattern"', () => {
    const aid = generatePatternAid('cake');
    expect(aid.type).toBe('pattern');
  });

  it('segments cover the entire word', () => {
    const word = 'night';
    const aid = generatePatternAid(word);
    const reassembled = aid.segments.map(s => s.text).join('');
    expect(reassembled).toBe(word);
  });

  it('detects patterns and assigns color indices', () => {
    const aid = generatePatternAid('train');
    // "ai" vowel team should be detected
    const coloredSegments = aid.segments.filter(s => s.colorIndex > 0);
    expect(coloredSegments.length).toBeGreaterThan(0);
  });

  it('provides tips for detected patterns', () => {
    const aid = generatePatternAid('rain');
    // "ai" vowel team should produce a tip
    expect(aid.tips.length).toBeGreaterThan(0);
    expect(aid.tips[0].hint).toBeTruthy();
  });

  it('limits tips to at most 3', () => {
    // A complex word with many patterns
    const aid = generatePatternAid('unbelievable');
    expect(aid.tips.length).toBeLessThanOrEqual(3);
  });

  it('segments reassemble to original word for any word', () => {
    const words = ['cat', 'beautiful', 'knight', 'through', 'surprise'];
    for (const word of words) {
      const aid = generatePatternAid(word);
      const reassembled = aid.segments.map(s => s.text).join('');
      expect(reassembled).toBe(word);
    }
  });
});

// ─── Mnemonic Aid ─────────────────────────────────────────────

describe('generateMnemonicAid', () => {
  it('returns type "mnemonic"', () => {
    const aid = generateMnemonicAid('cat');
    expect(aid.type).toBe('mnemonic');
  });

  it('provides known mnemonic for common tricky words', () => {
    const aid = generateMnemonicAid('because');
    expect(aid.tricks.length).toBeGreaterThan(0);
    const rememberTrick = aid.tricks.find(t => t.label === 'Remember');
    expect(rememberTrick).toBeTruthy();
    expect(rememberTrick!.content).toContain('Big Elephants');
  });

  it('finds hidden words inside longer words', () => {
    const aid = generateMnemonicAid('together');
    const wordsTrick = aid.tricks.find(t => t.label === 'Words inside');
    expect(wordsTrick).toBeTruthy();
    // "get" and "her" are hidden in "together"
    expect(wordsTrick!.content).toMatch(/GET|HER/);
  });

  it('detects double letters', () => {
    const aid = generateMnemonicAid('balloon');
    const doubleTrick = aid.tricks.find(t => t.label === 'Watch out');
    expect(doubleTrick).toBeTruthy();
    expect(doubleTrick!.content).toContain('"ll"');
  });

  it('detects silent letters', () => {
    const aid = generateMnemonicAid('knight');
    const silentTrick = aid.tricks.find(t => t.label.startsWith('Silent letter'));
    expect(silentTrick).toBeTruthy();
  });

  it('provides clap-it-out for multi-syllable words', () => {
    const aid = generateMnemonicAid('important');
    const clapTrick = aid.tricks.find(t => t.label === 'Clap it out');
    expect(clapTrick).toBeTruthy();
    expect(clapTrick!.content).toContain('·');
  });

  it('limits tricks to at most 3', () => {
    const aid = generateMnemonicAid('embarrass');
    expect(aid.tricks.length).toBeLessThanOrEqual(3);
  });

  it('handles very short words gracefully', () => {
    const aid = generateMnemonicAid('go');
    // Should not crash, may have few or no tricks
    expect(aid.type).toBe('mnemonic');
    expect(aid.tricks).toBeDefined();
  });

  it('known mnemonic for "believe" mentions LIE', () => {
    const aid = generateMnemonicAid('believe');
    const rememberTrick = aid.tricks.find(t => t.label === 'Remember');
    expect(rememberTrick).toBeTruthy();
    expect(rememberTrick!.content).toContain('LIE');
  });
});
