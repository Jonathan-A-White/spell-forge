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
    audioCustom: null,
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
    // Word 2: completed with 2 mistakes
    ({ state: session } = recordAttempt(session, true, 5000, true, false, {}, null, 2));
    // Word 3: perfect (no mistakes)
    ({ state: session } = recordAttempt(session, true, 2000, false, false, {}, null, 0));
    // Word 4: completed with 1 mistake
    ({ state: session } = recordAttempt(session, true, 4000, true, false, {}, null, 1));

    expect(session.wordsAttempted).toBe(4);
    expect(session.wordsCorrect).toBe(2);
    expect(session.isComplete).toBe(true);

    const log = endSession(session);
    expect(log.wordsAttempted).toBe(4);
    expect(log.wordsCorrect).toBe(2);
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
