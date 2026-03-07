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

  // Filter to only learning-mastered words when provided
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
): { state: SessionState; updatedStats: WordStats | null; result: TechniqueResult } {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const result: TechniqueResult = {
    techniqueId: 'letter-bank',
    timestamp: new Date(),
    correct,
    responseTimeMs,
    struggled,
    scaffoldingUsed,
  };

  const newResults = [...state.results, result];
  const newAttemptCount = state.attemptCount + 1;

  const updatedStats: WordStats | null = currentWordStats
    ? updateWordStats(currentWordStats, result)
    : null;
  let newWordsCorrect = state.wordsCorrect;
  let newWordsAttempted = state.wordsAttempted;

  if (correct) {
    newWordsCorrect++;
    newWordsAttempted++;
  } else if (newAttemptCount >= 3) {
    // After 3 failed attempts, mark as wrong and move on
    newWordsAttempted++;
  }

  const shouldAdvance = correct || newAttemptCount >= 3;

  // Check adaptive signals
  let shouldWrapUp = false;
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
  }

  // Check max time
  const elapsedMinutes = (Date.now() - state.startedAt.getTime()) / 60000;
  if (elapsedMinutes >= cfg.maxMinutes) {
    shouldWrapUp = true;
  }

  const nextIndex = shouldAdvance ? state.currentIndex + 1 : state.currentIndex;
  const isComplete = shouldWrapUp || nextIndex >= state.words.length;

  const newState: SessionState = {
    ...state,
    results: newResults,
    wordsCorrect: newWordsCorrect,
    wordsAttempted: newWordsAttempted,
    currentIndex: nextIndex,
    currentWord: isComplete ? null : state.words[nextIndex] ?? null,
    isComplete,
    endReason: isComplete
      ? shouldWrapUp
        ? 'adaptive-stop'
        : 'completed'
      : null,
    attemptCount: shouldAdvance ? 0 : newAttemptCount,
    scaffoldingActive: !correct && newAttemptCount >= 1,
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

