import { describe, it, expect } from 'vitest';
import {
  recordAttempt,
  endSession,
  type SessionState,
} from '../../src/features/practice/session-controller';
import type { Word } from '../../src/contracts/types';

// ─── Helpers ─────────────────────────────────────────────────

function makeWord(id: string, text: string): Word {
  return {
    id,
    listId: 'list-1',
    profileId: 'profile-1',
    text,
    syllables: [],
    phonemes: [],
    patterns: [],
    imageUrl: null,
    imageCached: false,
    createdAt: new Date('2026-03-01'),
  };
}

function makeSessionWithWords(words: Word[]): SessionState {
  return {
    sessionId: 'test-session',
    profileId: 'profile-1',
    words,
    currentIndex: 0,
    results: [],
    startedAt: new Date(),
    wordsCorrect: 0,
    wordsAttempted: 0,
    isComplete: false,
    endReason: null,
    currentWord: words[0] ?? null,
    attemptCount: 0,
    scaffoldingActive: false,
    requeueCounts: {},
    scaffoldWordIds: [],
  };
}

// ─── Accuracy with mistakes ──────────────────────────────────

describe('recordAttempt accuracy with mistakes', () => {
  it('should count word as correct when completed with no mistakes', () => {
    const words = [makeWord('w1', 'cat'), makeWord('w2', 'dog')];
    const session = makeSessionWithWords(words);

    const { state } = recordAttempt(
      session,
      true,   // correct (completed)
      3000,   // responseTimeMs
      false,  // struggled
      false,  // scaffoldingUsed
      {},
      null,
      0,      // mistakeCount = 0
    );

    expect(state.wordsAttempted).toBe(1);
    expect(state.wordsCorrect).toBe(1);
  });

  it('should count word as attempted but NOT correct when completed with mistakes', () => {
    const words = [makeWord('w1', 'cat'), makeWord('w2', 'dog')];
    const session = makeSessionWithWords(words);

    const { state } = recordAttempt(
      session,
      true,   // correct (completed)
      5000,   // responseTimeMs
      true,   // struggled
      false,  // scaffoldingUsed
      {},
      null,
      3,      // mistakeCount = 3
    );

    expect(state.wordsAttempted).toBe(1);
    expect(state.wordsCorrect).toBe(0);
  });

  it('should still advance to next word even with mistakes', () => {
    const words = [makeWord('w1', 'cat'), makeWord('w2', 'dog')];
    const session = makeSessionWithWords(words);

    const { state } = recordAttempt(
      session,
      true,
      5000,
      true,
      false,
      {},
      null,
      2, // mistakes
    );

    expect(state.currentIndex).toBe(1);
    expect(state.currentWord).toEqual(words[1]);
  });

  it('should produce correct accuracy across a full session', () => {
    const words = [
      makeWord('w1', 'cat'),
      makeWord('w2', 'dog'),
      makeWord('w3', 'hat'),
      makeWord('w4', 'sun'),
    ];
    let session = makeSessionWithWords(words);

    // Word 1: perfect (no mistakes)
    ({ state: session } = recordAttempt(session, true, 3000, false, false, {}, null, 0));
    // Word 2: completed with 2 mistakes — gets re-queued
    ({ state: session } = recordAttempt(session, true, 5000, true, false, {}, null, 2));
    // Word 3: perfect (no mistakes)
    ({ state: session } = recordAttempt(session, true, 2000, false, false, {}, null, 0));
    // Word 4: completed with 1 mistake — gets re-queued
    ({ state: session } = recordAttempt(session, true, 4000, true, false, {}, null, 1));

    // Both missed words come back for a delayed retrieval
    expect(session.isComplete).toBe(false);
    expect(session.words).toHaveLength(6);
    expect(session.currentWord?.id).toBe('w2');

    // Re-queued words answered perfectly this time
    ({ state: session } = recordAttempt(session, true, 3000, false, false, {}, null, 0));
    ({ state: session } = recordAttempt(session, true, 3000, false, false, {}, null, 0));

    expect(session.wordsAttempted).toBe(6);
    expect(session.wordsCorrect).toBe(4);
    expect(session.isComplete).toBe(true);

    const log = endSession(session);
    expect(log.wordsAttempted).toBe(6);
    expect(log.wordsCorrect).toBe(4);
  });

  it('should default mistakeCount to 0 for backward compatibility', () => {
    const words = [makeWord('w1', 'cat'), makeWord('w2', 'dog')];
    const session = makeSessionWithWords(words);

    // Call without mistakeCount parameter
    const { state } = recordAttempt(
      session,
      true,
      3000,
      false,
      false,
    );

    expect(state.wordsAttempted).toBe(1);
    expect(state.wordsCorrect).toBe(1);
  });

  it('should not count incorrect attempt toward wordsAttempted until 3 failures', () => {
    const words = [makeWord('w1', 'cat'), makeWord('w2', 'dog')];
    let session = makeSessionWithWords(words);

    // First failed attempt
    ({ state: session } = recordAttempt(session, false, 5000, true, false, {}, null, 0));
    expect(session.wordsAttempted).toBe(0);
    expect(session.currentIndex).toBe(0);

    // Second failed attempt
    ({ state: session } = recordAttempt(session, false, 5000, true, false, {}, null, 0));
    expect(session.wordsAttempted).toBe(0);
    expect(session.currentIndex).toBe(0);

    // Third failed attempt — now it counts and advances
    ({ state: session } = recordAttempt(session, false, 5000, true, false, {}, null, 0));
    expect(session.wordsAttempted).toBe(1);
    expect(session.wordsCorrect).toBe(0);
    expect(session.currentIndex).toBe(1);
  });
});

// ─── In-session re-queue of missed words ─────────────────────

describe('recordAttempt re-queue (successive relearning)', () => {
  const sixWords = () => [
    makeWord('w1', 'cat'),
    makeWord('w2', 'dog'),
    makeWord('w3', 'hat'),
    makeWord('w4', 'sun'),
    makeWord('w5', 'pig'),
    makeWord('w6', 'fox'),
  ];

  it('should re-queue a corrected word a few positions later', () => {
    let session = makeSessionWithWords(sixWords());

    // Word 1 corrected (wrong initially, completed retype flow)
    ({ state: session } = recordAttempt(session, false, 5000, true, false, {}, null, 1, 'kat'));

    expect(session.words).toHaveLength(7);
    // Re-queued at currentIndex + 1 + gap(3) = position 4
    expect(session.words[4].id).toBe('w1');
    expect(session.requeueCounts['w1']).toBe(1);
    expect(session.currentIndex).toBe(1);
  });

  it('should not re-queue a word answered perfectly', () => {
    let session = makeSessionWithWords(sixWords());

    ({ state: session } = recordAttempt(session, true, 3000, false, false, {}, null, 0));

    expect(session.words).toHaveLength(6);
    expect(session.requeueCounts).toEqual({});
  });

  it('should cap re-queues per word', () => {
    const w1 = makeWord('w1', 'cat');
    // Session of just the one word, missed repeatedly
    let session = makeSessionWithWords([w1]);
    // Disable adaptive so consecutive-error wrap-up doesn't end the session
    const cfg = { adaptive: false };

    ({ state: session } = recordAttempt(session, false, 5000, true, false, cfg, null, 1, 'kat'));
    expect(session.words).toHaveLength(2);
    ({ state: session } = recordAttempt(session, false, 5000, true, false, cfg, null, 1, 'kat'));
    expect(session.words).toHaveLength(3);
    // Third miss: cap reached, no more re-queues — session completes
    ({ state: session } = recordAttempt(session, false, 5000, true, false, cfg, null, 1, 'kat'));
    expect(session.words).toHaveLength(3);
    expect(session.requeueCounts['w1']).toBe(2);
    expect(session.isComplete).toBe(true);
  });

  it('should mark missed words for scaffolding on re-presentation', () => {
    let session = makeSessionWithWords(sixWords());

    ({ state: session } = recordAttempt(session, false, 5000, true, false, {}, null, 1, 'kat'));

    expect(session.scaffoldWordIds).toContain('w1');
    expect(session.scaffoldWordIds).toHaveLength(1);
  });

  it('should re-queue at the end when fewer words remain than the gap', () => {
    const words = [makeWord('w1', 'cat'), makeWord('w2', 'dog')];
    let session = makeSessionWithWords(words);

    ({ state: session } = recordAttempt(session, false, 5000, true, false, {}, null, 1, 'kat'));

    expect(session.words.map((w) => w.id)).toEqual(['w1', 'w2', 'w1']);
    expect(session.isComplete).toBe(false);
  });
});

// ─── Adaptive scaffolding activation ─────────────────────────

describe('recordAttempt adaptive scaffolding', () => {
  it('should activate scaffolding when recent error rate is high', () => {
    const words = [
      makeWord('w1', 'cat'),
      makeWord('w2', 'dog'),
      makeWord('w3', 'hat'),
    ];
    let session = makeSessionWithWords(words);

    // Two non-advancing failures, then a success: error rate 2/3 ≥ 0.6
    // but no trailing consecutive errors → 'more-scaffolding' action
    ({ state: session } = recordAttempt(session, false, 5000, true, false, {}, null, 0));
    ({ state: session } = recordAttempt(session, false, 5000, true, false, {}, null, 0));
    ({ state: session } = recordAttempt(session, true, 4000, false, false, {}, null, 0));

    expect(session.scaffoldingActive).toBe(true);
  });

  it('should not activate scaffolding when signals are healthy', () => {
    const words = [
      makeWord('w1', 'cat'),
      makeWord('w2', 'dog'),
      makeWord('w3', 'hat'),
      makeWord('w4', 'sun'),
    ];
    let session = makeSessionWithWords(words);

    ({ state: session } = recordAttempt(session, true, 4000, false, false, {}, null, 0));
    ({ state: session } = recordAttempt(session, true, 4000, false, false, {}, null, 0));
    ({ state: session } = recordAttempt(session, true, 4000, false, false, {}, null, 0));

    expect(session.scaffoldingActive).toBe(false);
  });
});
