import { describe, it, expect, vi } from 'vitest';
import { cleanWords, normalizeWhitespace, filterImportWords } from '../../src/ocr/utils.ts';
import { correctOcrWords } from '../../src/ocr/spell-check.ts';
import { LocalOcrProvider } from '../../src/ocr/local.ts';
import { RemoteOcrProvider } from '../../src/ocr/remote.ts';
import { OcrManagerImpl } from '../../src/ocr/manager.ts';
import { binarizeWithBackground, blockMaxBackground, canvasImageOps, filterLowConfidenceWords, flattenWithBackground, isLikelyGarbage, mergeShadowPassText, recognizeWithOrientationDetection, scoreRecognizedText } from '../../src/ocr/preprocess.ts';
import type { ImageOps, OcrBlockInfo, OcrWorker } from '../../src/ocr/preprocess.ts';
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

// ─── filterImportWords ──────────────────────────────────────

describe('filterImportWords', () => {
  it('returns all words when filter list is empty', () => {
    expect(filterImportWords(['badge', 'edge', 'judge'], [])).toEqual(['badge', 'edge', 'judge']);
  });

  it('filters individual words from a phrase', () => {
    const words = ['unit', 'badge', 'edge', 'challenge', 'words', 'celebrate'];
    const filters = ['Challenge Words'];
    expect(filterImportWords(words, filters)).toEqual(['unit', 'badge', 'edge', 'celebrate']);
  });

  it('filters words from multiple phrases', () => {
    const words = ['unit', 'badge', 'challenge', 'words', 'high', 'frequency', 'celebrate', 'group'];
    const filters = ['Challenge Words', 'High Frequency Words'];
    // "words" appears in both phrases but the result is the same
    expect(filterImportWords(words, filters)).toEqual(['unit', 'badge', 'celebrate', 'group']);
  });

  it('is case-insensitive', () => {
    const words = ['unit', 'badge', 'challenge'];
    const filters = ['CHALLENGE'];
    expect(filterImportWords(words, filters)).toEqual(['unit', 'badge']);
  });

  it('strips non-alpha chars from filter phrases', () => {
    const words = ['unit', 'badge'];
    const filters = ['Unit 3, WK 6'];
    // "3" and "6" stripped, "unit" matches, "wk" not in words list
    expect(filterImportWords(words, filters)).toEqual(['badge']);
  });

  it('handles empty words list', () => {
    expect(filterImportWords([], ['Challenge Words'])).toEqual([]);
  });

  it('handles whitespace-only filter phrases gracefully', () => {
    const words = ['badge', 'edge'];
    expect(filterImportWords(words, ['  ', ''])).toEqual(['badge', 'edge']);
  });

  it('filters single-character OCR artifacts', () => {
    const words = ['badge', 'a', 'edge', 'i', 'judge'];
    const filters = ['Challenge Words'];
    expect(filterImportWords(words, filters)).toEqual(['badge', 'edge', 'judge']);
  });

  it('filters realistic OCR output from a spelling list photo', () => {
    // Simulates OCR output from the photo in the issue — includes "a" artifact
    // from OCR fragmenting the "Challenge Words" heading
    const ocrWords = [
      'unit', 'badge', 'edge', 'judge', 'pace', 'mice', 'peace', 'huge',
      'giraffe', 'gems', 'price', 'a', 'challenge', 'words', 'celebrate',
      'emergency', 'message', 'high', 'frequency', 'group', 'almost',
    ];
    const filters = ['Unit', 'Challenge Words', 'High Frequency Words'];
    const result = filterImportWords(ocrWords, filters);
    expect(result).toEqual([
      'badge', 'edge', 'judge', 'pace', 'mice', 'peace', 'huge',
      'giraffe', 'gems', 'price', 'celebrate',
      'emergency', 'message', 'group', 'almost',
    ]);
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

  it('corrects a→e substitution (ractangle → rectangle)', () => {
    expect(correctOcrWords(['ractangle'])).toEqual(['rectangle']);
  });

  it('corrects o→c substitution (frequenoy → frequency)', () => {
    expect(correctOcrWords(['frequenoy'])).toEqual(['frequency']);
  });

  it('corrects g→a plus a→e double misread (gngla → angle)', () => {
    // Rounded print fonts on worksheets: 'a' misread as 'g', 'e' as 'a'
    expect(correctOcrWords(['gngla'])).toEqual(['angle']);
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

  it('prefers real dictionary words over plausible-looking garbage', async () => {
    const fakeWorker: OcrWorker = {
      recognize: async (_image, opts) => {
        const angle = (opts?.rotateRadians as number) ?? 0;
        if (Math.abs(angle - Math.PI) < 0.01) {
          // Correct orientation: fewer tokens, but all real words
          return { data: { text: 'badge edge judge', confidence: 60 } };
        }
        // Wrong orientation: more tokens that pass plausibility heuristics
        // but are not English words (typical sideways-text OCR output)
        return { data: { text: 'oqe nire bame welo veno', confidence: 75 } };
      },
    };

    const result = await recognizeWithOrientationDetection(fakeWorker, 'fake-image');

    expect(result.text).toBe('badge edge judge');
  });

  it('rotates via ImageOps when available instead of rotateRadians', async () => {
    const rotateCalls: number[] = [];
    const fakeOps: ImageOps = {
      normalize: async () => new Blob(['normalized'], { type: 'image/jpeg' }),
      rotate: async (_image, quarterTurns) => {
        rotateCalls.push(quarterTurns);
        return new Blob([`rotated-${quarterTurns}`], { type: 'image/jpeg' });
      },
      rotateSmall: async () => null,
    };
    const receivedOpts: Array<Record<string, unknown> | undefined> = [];
    const fakeWorker: OcrWorker = {
      recognize: async (_image, opts) => {
        receivedOpts.push(opts as Record<string, unknown>);
        if (receivedOpts.length === 3) {
          // third attempt (180°) is the correct orientation
          return { data: { text: 'badge edge judge pace mice peace', confidence: 80 } };
        }
        return { data: { text: '', confidence: 10 } };
      },
    };

    const input = new Blob(['photo'], { type: 'image/jpeg' });
    const result = await recognizeWithOrientationDetection(fakeWorker, input, fakeOps);

    expect(result.text).toBe('badge edge judge pace mice peace');
    // Rotations were performed by ImageOps (90°, 180°), and early exit
    // stopped before 270°
    expect(rotateCalls).toEqual([1, 2]);
    // rotateRadians must never be passed when ImageOps rotation succeeds
    for (const opts of receivedOpts) {
      expect(opts).toEqual({});
    }
  });

  it('retries the raw image when the normalized image yields nothing', async () => {
    const normalized = new Blob(['blank-normalized'], { type: 'image/jpeg' });
    const fakeOps: ImageOps = {
      normalize: async () => normalized,
      rotate: async () => new Blob(['blank-rotated'], { type: 'image/jpeg' }),
      rotateSmall: async () => null,
    };
    const original = new Blob(['original-photo'], { type: 'image/jpeg' });
    const originalBytes = new Uint8Array(await original.arrayBuffer());

    const fakeWorker: OcrWorker = {
      recognize: async (image) => {
        // Simulate a device where canvas re-encoding produces blank images:
        // only the untouched original yields text
        const bytes = image as Uint8Array;
        const isOriginal =
          bytes.length === originalBytes.length &&
          bytes.every((b, i) => b === originalBytes[i]);
        if (isOriginal) {
          return { data: { text: 'badge edge judge pace mice', confidence: 70 } };
        }
        return { data: { text: '', confidence: 0 } };
      },
    };

    const result = await recognizeWithOrientationDetection(fakeWorker, original, fakeOps);

    expect(result.text).toBe('badge edge judge pace mice');
    expect(result.confidence).toBeCloseTo(0.70);
  });
});

// ─── scoreRecognizedText ────────────────────────────────────

describe('scoreRecognizedText', () => {
  it('weights dictionary words above merely plausible tokens', () => {
    const dict = scoreRecognizedText('badge edge judge');
    const garbage = scoreRecognizedText('oqe nire bame welo veno');
    expect(dict.dictWords).toBe(3);
    expect(garbage.dictWords).toBe(0);
    expect(dict.score).toBeGreaterThan(garbage.score);
  });

  it('returns zero score for empty or noise-only text', () => {
    expect(scoreRecognizedText('').score).toBe(0);
    expect(scoreRecognizedText('xq zz !!').score).toBe(0);
  });

  it('counts plausible non-dictionary words with low weight', () => {
    const s = scoreRecognizedText('badge wuggle');
    expect(s.dictWords).toBe(1);
    expect(s.plausibleWords).toBe(2);
    expect(s.score).toBe(7); // 6 × 1 long dictionary + 1 capped non-dict
  });

  it('never lets a wall of short hallucinated words outvote a clean list', () => {
    // Texture noise from wood grain / graph paper: many short real words
    const noise = scoreRecognizedText(
      'eat eye her one pan his all fat lot and red out end ill did etc ' +
      'tin oho gang corn need leaf here bull earn seta atr exd inra rit ' +
      'die hil hel eit enr fii fil ete rey ree esd tai bal lit dort cata',
    );
    // A clean read of an actual spelling list
    const clean = scoreRecognizedText(
      'action fraction motion addition vision tension turtle angle purple ' +
      'sparkle challenge words rectangle triangle condition high frequency',
    );
    expect(clean.score).toBeGreaterThan(noise.score);
  });
});

// ─── filterLowConfidenceWords ───────────────────────────────

describe('filterLowConfidenceWords', () => {
  const blocksFor = (words: Array<[string, number]>): OcrBlockInfo[] => [
    {
      paragraphs: [
        { lines: [{ words: words.map(([text, confidence]) => ({ text, confidence })) }] },
      ],
    },
  ];

  it('drops low-confidence stray tokens', () => {
    const blocks = blocksFor([['turtle', 91], ['faia', 12], ['erna', 8]]);
    expect(filterLowConfidenceWords('turtle faia erna', blocks)).toBe('turtle');
  });

  it('keeps long dictionary words regardless of confidence', () => {
    // Real list words on hard photos can come back very low ("purple" at 18)
    const blocks = blocksFor([['purple', 18], ['tension', 57]]);
    expect(filterLowConfidenceWords('purple tension', blocks)).toBe('purple tension');
  });

  it('keeps confident non-dictionary words (pseudoword lists)', () => {
    const blocks = blocksFor([['wuggle', 85], ['blarn', 78]]);
    expect(filterLowConfidenceWords('wuggle blarn', blocks)).toBe('wuggle blarn');
  });

  it('fails open when a token cannot be matched to a block word', () => {
    // Tokenization differences: blocks may join what text splits
    const blocks = blocksFor([['challengewords', 86]]);
    expect(filterLowConfidenceWords('challenge words', blocks)).toBe('challenge words');
  });

  it('fails open without blocks output', () => {
    expect(filterLowConfidenceWords('turtle faia', null)).toBe('turtle faia');
    expect(filterLowConfidenceWords('turtle faia', [])).toBe('turtle faia');
  });

  it('drops short low-confidence dictionary words from texture noise', () => {
    const blocks = blocksFor([['i', 27], ['his', 31], ['action', 95]]);
    expect(filterLowConfidenceWords('i his action', blocks)).toBe('action');
  });

  it('matches tokens case- and punctuation-insensitively', () => {
    const blocks = blocksFor([['Turtle,', 91], ['xqzt.', 5]]);
    expect(filterLowConfidenceWords('Turtle, xqzt.', blocks)).toBe('Turtle,');
  });
});

// ─── isLikelyGarbage ────────────────────────────────────────

describe('isLikelyGarbage', () => {
  it('flags empty results', () => {
    expect(isLikelyGarbage(scoreRecognizedText(''))).toBe(true);
  });

  it('flags letter-run fragments from blurry photos', () => {
    // Actual output observed from a dim, blurry word-list photo
    expect(isLikelyGarbage(scoreRecognizedText('a fat fis alia erg wri serge ing'))).toBe(true);
  });

  it('accepts a real word list', () => {
    expect(
      isLikelyGarbage(scoreRecognizedText('action fraction motion addition vision tension')),
    ).toBe(false);
  });

  it('accepts a list with some unusual words as long as most are real', () => {
    expect(
      isLikelyGarbage(scoreRecognizedText('badge edge judge wuggle blagic')),
    ).toBe(false);
  });
});

// ─── flattenWithBackground ──────────────────────────────────

describe('flattenWithBackground', () => {
  function rgba(...pixels: Array<[number, number, number]>): Uint8ClampedArray {
    const out = new Uint8ClampedArray(pixels.length * 4);
    pixels.forEach(([r, g, b], i) => {
      out[i * 4] = r;
      out[i * 4 + 1] = g;
      out[i * 4 + 2] = b;
      out[i * 4 + 3] = 255;
    });
    return out;
  }

  it('lifts dim paper to the target level and keeps text dark', () => {
    // Dim photo: paper at 120, text at 60; background estimate ≈ paper
    const image = rgba([120, 120, 120], [60, 60, 60]);
    const background = rgba([120, 120, 120], [120, 120, 120]);

    flattenWithBackground(image, background);

    expect(image[0]).toBe(230); // paper → target level
    expect(image[4]).toBe(115); // text stays proportionally dark
  });

  it('evens out a brightness gradient across the image', () => {
    // Same paper photographed bright on the left, dim on the right
    const image = rgba([200, 200, 200], [100, 100, 100]);
    const background = rgba([200, 200, 200], [100, 100, 100]);

    flattenWithBackground(image, background);

    expect(image[0]).toBe(230);
    expect(image[4]).toBe(230);
  });

  it('writes grayscale output and preserves alpha', () => {
    const image = rgba([90, 120, 150]);
    const background = rgba([130, 130, 130]);

    flattenWithBackground(image, background);

    expect(image[0]).toBe(image[1]);
    expect(image[1]).toBe(image[2]);
    expect(image[3]).toBe(255);
  });
});

// ─── Shadow binarization helpers ────────────────────────────

describe('blockMaxBackground', () => {
  function grayRow(...values: number[]): Uint8ClampedArray {
    const out = new Uint8ClampedArray(values.length * 4);
    values.forEach((v, i) => {
      out[i * 4] = v;
      out[i * 4 + 1] = v;
      out[i * 4 + 2] = v;
      out[i * 4 + 3] = 255;
    });
    return out;
  }

  it('takes the per-block maximum, ignoring dark text strokes', () => {
    // 8×1 image, block size 4: each block holds paper plus a dark stroke
    const image = grayRow(40, 200, 190, 35, 120, 30, 110, 25);
    const bg = blockMaxBackground(image, 8, 1, 4);

    expect(bg.width).toBe(2);
    expect(bg.height).toBe(1);
    expect(bg.data[0]).toBe(200); // lightest pixel of block 1 (paper)
    expect(bg.data[4]).toBe(120); // lightest pixel of block 2 (shadowed paper)
    expect(bg.data[3]).toBe(255); // opaque alpha
  });
});

describe('binarizeWithBackground', () => {
  function gray(...values: number[]): Uint8ClampedArray {
    const out = new Uint8ClampedArray(values.length * 4);
    values.forEach((v, i) => {
      out[i * 4] = v;
      out[i * 4 + 1] = v;
      out[i * 4 + 2] = v;
      out[i * 4 + 3] = 255;
    });
    return out;
  }

  it('thresholds against the local background, erasing shadow gradients', () => {
    // Bright region: paper 220, ink 80. Shadowed region: paper 120, ink 50.
    const image = gray(220, 80, 120, 50);
    const background = gray(220, 220, 120, 120);

    binarizeWithBackground(image, background);

    expect(image[0]).toBe(255); // bright paper → white
    expect(image[4]).toBe(0); // ink → black
    expect(image[8]).toBe(255); // shadowed paper → white too
    expect(image[12]).toBe(0); // shadowed ink → black
  });
});

describe('mergeShadowPassText', () => {
  it('appends dictionary words the main pass missed', () => {
    expect(mergeShadowPassText('action purple', 'rectangle sparkle')).toBe(
      'action purple rectangle sparkle',
    );
  });

  it('never merges non-dictionary tokens', () => {
    expect(mergeShadowPassText('action', 'nzan rectangle xqzt')).toBe(
      'action rectangle',
    );
  });

  it('skips words the main pass already found, ignoring case and punctuation', () => {
    expect(mergeShadowPassText('Action, purple.', 'action PURPLE rectangle')).toBe(
      'Action, purple. rectangle',
    );
  });

  it('returns the main text untouched when the shadow pass adds nothing', () => {
    expect(mergeShadowPassText('action purple', 'action zzqx')).toBe('action purple');
  });
});

describe('recognizeWithOrientationDetection shadow pass', () => {
  it('merges dictionary words recovered from the binarized image', async () => {
    const mainBlob = new Blob(['MAIN'], { type: 'image/jpeg' });
    const binarizedBlob = new Blob(['BINARIZED'], { type: 'image/jpeg' });
    const fakeOps: ImageOps = {
      normalize: async () => mainBlob,
      rotate: async () => null,
      rotateSmall: async () => null,
      binarizeShadow: async () => binarizedBlob,
    };
    const fakeWorker: OcrWorker = {
      recognize: async (image) => {
        const marker = new TextDecoder().decode(image as Uint8Array);
        if (marker === 'BINARIZED') {
          // Shadow pass: recovers two real words, hallucinates one garbage token
          return { data: { text: 'rectangle nzan sparkle action', confidence: 70 } };
        }
        return {
          data: {
            text: 'action fraction motion addition vision purple',
            confidence: 90,
          },
        };
      },
    };

    const result = await recognizeWithOrientationDetection(
      fakeWorker,
      new Blob(['raw'], { type: 'image/jpeg' }),
      fakeOps,
    );

    expect(result.text).toBe(
      'action fraction motion addition vision purple rectangle sparkle',
    );
  });

  it('keeps the main result when binarization is unavailable', async () => {
    const mainBlob = new Blob(['MAIN'], { type: 'image/jpeg' });
    const fakeOps: ImageOps = {
      normalize: async () => mainBlob,
      rotate: async () => null,
      rotateSmall: async () => null,
      binarizeShadow: async () => null,
    };
    const recognize = vi.fn(async () => ({
      data: { text: 'action fraction motion addition vision purple', confidence: 90 },
    }));
    const fakeWorker: OcrWorker = { recognize };

    const result = await recognizeWithOrientationDetection(
      fakeWorker,
      new Blob(['raw'], { type: 'image/jpeg' }),
      fakeOps,
    );

    expect(result.text).toBe('action fraction motion addition vision purple');
    // Early exit on 0° plus no shadow pass: exactly one recognition
    expect(recognize).toHaveBeenCalledTimes(1);
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
      text: '  Hello  WORLD  hello apple ',
      confidence: 0.95,
    });
    const provider = new LocalOcrProvider(recognizer);
    const result = await provider.extractWords(new Blob());

    expect(result.source).toBe('local');
    expect(result.confidence).toBe(0.95);
    expect(result.words).toEqual(['hello', 'world', 'apple']);
    expect(result.rawText).toBe('Hello WORLD hello apple');
  });

  it('throws OcrUnreadableError when output is noise rather than words', async () => {
    const recognizer: RecognizerFn = async () => ({
      // Stray letter-run fragments typical of a blurry/dim photo — these
      // pass the plausibility filters but are not English words
      text: 'a fat fis alia erg wri serge ing',
      confidence: 0.45,
    });
    const provider = new LocalOcrProvider(recognizer);

    await expect(provider.extractWords(new Blob())).rejects.toThrow(
      /couldn't read the words/i,
    );
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
  const { available = true, text = 'hello world apple', confidence = 0.9, shouldThrow = false } = opts ?? {};

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
    const local = makeLocalProvider({ text: 'apple banana orange', confidence: 0.92 });
    const remote = new RemoteOcrProvider(); // no endpoint — unavailable

    const manager = new OcrManagerImpl(local, remote);
    const result = await manager.extractWords(new Blob());

    expect(result.source).toBe('local');
    expect(result.words).toEqual(['apple', 'banana', 'orange']);
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

  it('surfaces the unreadable-photo message when output is noise and remote is unavailable', async () => {
    const local = makeLocalProvider({ text: '  ', confidence: 0.1 });
    const remote = new RemoteOcrProvider(); // not configured

    const manager = new OcrManagerImpl(local, remote, { confidenceThreshold: 0.5 });

    await expect(manager.extractWords(new Blob())).rejects.toThrow(/couldn't read the words/i);
  });

  it('returns local result when confidence equals threshold', async () => {
    const local = makeLocalProvider({ text: 'badge edge judge', confidence: 0.5 });
    const remote = new RemoteOcrProvider();

    const manager = new OcrManagerImpl(local, remote, { confidenceThreshold: 0.5 });
    const result = await manager.extractWords(new Blob());

    expect(result.source).toBe('local');
    expect(result.confidence).toBe(0.5);
  });
});

// ─── canvasImageOps.normalize ───────────────────────────────

describe('canvasImageOps.normalize', () => {
  it('returns null when OffscreenCanvas is unavailable', async () => {
    // jsdom does not provide OffscreenCanvas, so normalize gracefully falls back
    const blob = new Blob(['test'], { type: 'image/png' });
    const result = await canvasImageOps.normalize(blob);
    expect(result).toBeNull();
  });

  /**
   * Helper: set up OffscreenCanvas + createImageBitmap mocks and run normalize.
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

    const canvasSizes: string[] = [];
    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        canvasSizes.push(`${w}x${h}`);
      }
      getContext() { return fakeCtx; }
      convertToBlob() { return Promise.resolve(outputBlob); }
    }

    const fakeBitmap = { width: bitmapWidth, height: bitmapHeight, close: vi.fn() };

    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);
    vi.stubGlobal('createImageBitmap', () => Promise.resolve(fakeBitmap));

    const blob = new Blob(['test'], { type: 'image/png' });
    try {
      const result = await canvasImageOps.normalize(blob);
      return { result, blob, outputBlob, fakeBitmap, drawImageCalls, fillRectCalls, canvasSizes };
    } finally {
      vi.unstubAllGlobals();
    }
  }

  it('re-encodes a small image at original size without any border', async () => {
    const { result, outputBlob, fakeBitmap, drawImageCalls, fillRectCalls, canvasSizes } =
      await runWithMockCanvas(200, 100);

    expect(result).toBe(outputBlob);

    // No downscaling and — critically — no padding: a solid white border
    // makes Tesseract's page segmentation discard the photo as a picture.
    // The main canvas keeps the original size; later canvases belong to the
    // illumination-flattening background estimate.
    expect(canvasSizes[0]).toBe('200x100');
    expect(fillRectCalls[0]).toEqual([0, 0, 200, 100]);

    // First drawImage call places the bitmap with 9-arg form:
    // (bitmap, sx, sy, sw, sh, dx, dy, dw, dh)
    expect(drawImageCalls[0]).toEqual([fakeBitmap, 0, 0, 200, 100, 0, 0, 200, 100]);

    // Bitmap should be cleaned up
    expect(fakeBitmap.close).toHaveBeenCalled();
  });

  it('downscales large images with progressive halving', async () => {
    // Simulate a 4000x3000 phone photo (exceeds MAX_DIMENSION of 1800)
    const { result, outputBlob, fakeBitmap, drawImageCalls, canvasSizes } =
      await runWithMockCanvas(4000, 3000);

    expect(result).toBe(outputBlob);

    // Scale factor = 1800/4000 = 0.45. A single large-ratio drawImage
    // aliases (canvas 2d has no mipmaps), so the image is halved to
    // 2000x1500 first, then drawn to the final 1800x1350 — no border.
    expect(canvasSizes[0]).toBe('2000x1500');
    expect(canvasSizes[1]).toBe('1800x1350');

    // First draw consumes the full-resolution bitmap
    expect(drawImageCalls[0]).toEqual([fakeBitmap, 0, 0, 4000, 3000, 0, 0, 2000, 1500]);

    expect(fakeBitmap.close).toHaveBeenCalled();
  });

  it('returns null when convertToBlob produces a tiny blob', async () => {
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
      const result = await canvasImageOps.normalize(original);
      // A suspiciously small output blob means a blank/corrupt canvas export
      expect(result).toBeNull();
      expect(fakeBitmap.close).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns null when createImageBitmap throws (OOM)', async () => {
    vi.stubGlobal('OffscreenCanvas', class { constructor() {} });
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('OOM')));

    try {
      const original = new Blob(['original'], { type: 'image/png' });
      const result = await canvasImageOps.normalize(original);
      expect(result).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
