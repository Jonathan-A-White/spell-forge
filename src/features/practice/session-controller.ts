// src/features/practice/session-controller.ts — Orchestrates a practice session

import type {
  Word,
  WordStats,
  WordList,
  SessionLog,
  TechniqueResult,
} from '../../contracts/types';
import { selectSessionWords } from '../../core/word-selection/selector';
import { analyzeEngagement, determineAction } from '../../core/adaptive/engine';
import { updateWordStats } from '../../core/spaced-rep';
import { shuffle as shuffleArray } from '../../core/shuffle';
import { v4 as uuidv4 } from 'uuid';

export interface SessionState {
  sessionId: string;
  profileId: string;
  words: Word[];
  currentIndex: number;
  results: TechniqueResult[];
  startedAt: Date;
  wordsCorrect: number;
  wordsAttempted: number;
  isComplete: boolean;
  endReason: SessionLog['endReason'] | null;
  currentWord: Word | null;
  attemptCount: number;
  scaffoldingActive: boolean;
  /** How many times each word has been re-queued this session (wordId → count) */
  requeueCounts: Record<string, number>;
  /** Words that were missed this session — show phonics scaffolding when re-presented */
  scaffoldWordIds: string[];
}

export interface SessionConfig {
  sessionSize: number;
  maxMinutes: number;
  adaptive: boolean;
  historicalToleranceMs: number;
}

const DEFAULT_CONFIG: SessionConfig = {
  sessionSize: 8,
  maxMinutes: 10,
  adaptive: true,
  historicalToleranceMs: 5 * 60 * 1000, // 5 minutes default
};

// Successive relearning: a missed word comes back a few words later in the
// same session for a true delayed retrieval, instead of disappearing until
// the next session. Capped so one stubborn word can't stall the session.
const REQUEUE_GAP = 3;
const MAX_REQUEUES_PER_WORD = 2;

export function createSession(
  profileId: string,
  activeList: WordList | null,
  allWords: Word[],
  allStats: WordStats[],
  daysUntilTest: number | null,
  config: Partial<SessionConfig> = {},
  masteredWordIds?: Set<string>,
): SessionState {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Filter to only words the user has encountered in learning mode when provided
  const filteredWords = masteredWordIds
    ? allWords.filter((w) => masteredWordIds.has(w.id))
    : allWords;

  const selection = selectSessionWords(
    activeList,
    filteredWords,
    allStats,
    cfg.sessionSize,
    daysUntilTest,
  );

  const sessionWords = [
    ...selection.currentListWords,
    ...selection.reviewWords,
    ...selection.maintenanceWords,
  ];

  // Shuffle the words so it's not predictable
  const shuffled = shuffleArray(sessionWords);

  return {
    sessionId: uuidv4(),
    profileId,
    words: shuffled,
    currentIndex: 0,
    results: [],
    startedAt: new Date(),
    wordsCorrect: 0,
    wordsAttempted: 0,
    isComplete: false,
    endReason: null,
    currentWord: shuffled.length > 0 ? shuffled[0] : null,
    attemptCount: 0,
    scaffoldingActive: false,
    requeueCounts: {},
    scaffoldWordIds: [],
  };
}

export function recordAttempt(
  state: SessionState,
  correct: boolean,
  responseTimeMs: number,
  struggled: boolean,
  scaffoldingUsed: boolean,
  config: Partial<SessionConfig> = {},
  currentWordStats?: WordStats | null,
  mistakeCount: number = 0,
  userInput?: string,
): { state: SessionState; updatedStats: WordStats | null; result: TechniqueResult } {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const result: TechniqueResult = {
    techniqueId: 'spelling-input',
    timestamp: new Date(),
    correct,
    responseTimeMs,
    struggled,
    scaffoldingUsed,
    mistakeCount,
    ...(userInput !== undefined ? { userInput } : {}),
  };

  const newResults = [...state.results, result];
  const newAttemptCount = state.attemptCount + 1;

  const updatedStats: WordStats | null = currentWordStats
    ? updateWordStats(currentWordStats, result)
    : null;
  let newWordsCorrect = state.wordsCorrect;
  let newWordsAttempted = state.wordsAttempted;

  // A word counts as "correct" for accuracy only if completed without mistakes
  const perfectAttempt = correct && mistakeCount === 0;

  // A corrected attempt is one where the user got it wrong initially but
  // completed the correction flow (retype). These still advance the word.
  const corrected = !correct && mistakeCount > 0;

  if (correct) {
    newWordsAttempted++;
    if (perfectAttempt) {
      newWordsCorrect++;
    }
  } else if (corrected) {
    // User completed correction flow — count as attempted but not correct
    newWordsAttempted++;
  } else if (newAttemptCount >= 3) {
    // After 3 failed attempts, mark as wrong and move on
    newWordsAttempted++;
  }

  const shouldAdvance = correct || corrected || newAttemptCount >= 3;

  // Check adaptive signals
  let shouldWrapUp = false;
  let adaptiveScaffolding = false;
  if (cfg.adaptive && newResults.length >= 3) {
    const sessionDurationMs = Date.now() - state.startedAt.getTime();
    const signals = analyzeEngagement(
      newResults,
      sessionDurationMs,
      cfg.historicalToleranceMs,
    );
    const action = determineAction(signals);
    if (action.type === 'wrap-up') {
      shouldWrapUp = true;
    }
    // The word queue is fixed mid-session, so both struggle signals resolve
    // to the same support: phonics scaffolding on the upcoming words.
    if (action.type === 'more-scaffolding' || action.type === 'easier-word') {
      adaptiveScaffolding = true;
    }
  }

  // Check max time
  const elapsedMinutes = (Date.now() - state.startedAt.getTime()) / 60000;
  if (elapsedMinutes >= cfg.maxMinutes) {
    shouldWrapUp = true;
  }

  // Re-queue missed words for a delayed retrieval later in the session
  // (successive relearning). Anything short of a perfect attempt counts.
  let newWords = state.words;
  let newRequeueCounts = state.requeueCounts;
  let newScaffoldWordIds = state.scaffoldWordIds;
  const missedWord = state.currentWord;
  if (shouldAdvance && !perfectAttempt && !shouldWrapUp && missedWord) {
    const requeues = state.requeueCounts[missedWord.id] ?? 0;
    if (requeues < MAX_REQUEUES_PER_WORD) {
      const insertAt = Math.min(state.currentIndex + 1 + REQUEUE_GAP, state.words.length);
      newWords = [
        ...state.words.slice(0, insertAt),
        missedWord,
        ...state.words.slice(insertAt),
      ];
      newRequeueCounts = { ...state.requeueCounts, [missedWord.id]: requeues + 1 };
      if (!state.scaffoldWordIds.includes(missedWord.id)) {
        newScaffoldWordIds = [...state.scaffoldWordIds, missedWord.id];
      }
    }
  }

  const nextIndex = shouldAdvance ? state.currentIndex + 1 : state.currentIndex;
  const isComplete = shouldWrapUp || nextIndex >= newWords.length;

  const newState: SessionState = {
    ...state,
    results: newResults,
    wordsCorrect: newWordsCorrect,
    wordsAttempted: newWordsAttempted,
    words: newWords,
    requeueCounts: newRequeueCounts,
    scaffoldWordIds: newScaffoldWordIds,
    currentIndex: nextIndex,
    currentWord: isComplete ? null : newWords[nextIndex] ?? null,
    isComplete,
    endReason: isComplete
      ? shouldWrapUp
        ? 'adaptive-stop'
        : 'completed'
      : null,
    attemptCount: shouldAdvance ? 0 : newAttemptCount,
    scaffoldingActive: (!correct && !shouldAdvance) || adaptiveScaffolding,
  };

  return { state: newState, updatedStats, result };
}

export function endSession(state: SessionState, reason?: SessionLog['endReason']): SessionLog {
  return {
    id: state.sessionId,
    profileId: state.profileId,
    startedAt: state.startedAt,
    endedAt: new Date(),
    wordsAttempted: state.wordsAttempted,
    wordsCorrect: state.wordsCorrect,
    engagementScore: computeEngagementScore(state),
    endReason: reason ?? state.endReason ?? 'user-quit',
    rewardEarned: null, // Filled in by the caller with theme engine
  };
}

function computeEngagementScore(state: SessionState): number {
  if (state.wordsAttempted === 0) return 0;
  const accuracy = state.wordsCorrect / state.wordsAttempted;
  const completionRatio = state.currentIndex / Math.max(state.words.length, 1);
  return Math.min(1, (accuracy * 0.6 + completionRatio * 0.4));
}

