// src/features/practice/practice-screen.tsx — Main practice session screen

import { useState, useCallback, useEffect, useRef } from 'react';
import { LetterBank } from './letter-bank';
import { SessionSummary } from './session-summary';
import type {
  Word,
  WordStats,
  WordList,
  SessionLog,
  RewardEvent,
  Profile,
} from '../../contracts/types';
import {
  createSession,
  recordAttempt,
  endSession,
  type SessionState,
  type SessionConfig,
} from './session-controller';
import { analyzeWord } from '../../core/phonics';
import { activityProgressRepo } from '../../data/repositories/activity-progress-repo';
import { learningProgressRepo } from '../../data/repositories/learning-progress-repo';

interface PracticeScreenProps {
  profile: Profile;
  activeList: WordList | null;
  allWords: Word[];
  allStats: WordStats[];
  daysUntilTest: number | null;
  streakCount: number;
  onSessionEnd: (log: SessionLog) => void;
  onStatsUpdate?: (stats: WordStats) => void;
  onBack: () => void;
  onSpeak?: (word: string) => void;
}

/** Serialize SessionState for IndexedDB storage */
function serializeSession(state: SessionState): Record<string, unknown> {
  return {
    ...state,
    startedAt: state.startedAt.toISOString(),
    results: state.results.map((r) => ({
      ...r,
      timestamp: r.timestamp.toISOString(),
    })),
    words: state.words.map((w) => ({
      ...w,
      createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : w.createdAt,
    })),
    currentWord: state.currentWord
      ? {
          ...state.currentWord,
          createdAt: state.currentWord.createdAt instanceof Date
            ? state.currentWord.createdAt.toISOString()
            : state.currentWord.createdAt,
        }
      : null,
  };
}

/** Deserialize SessionState from IndexedDB storage */
function deserializeSession(data: Record<string, unknown>): SessionState {
  const raw = data as Record<string, unknown>;
  const words = (raw.words as Record<string, unknown>[]).map((w) => ({
    ...w,
    createdAt: new Date(w.createdAt as string),
  })) as unknown as Word[];
  const currentWord = raw.currentWord
    ? {
        ...(raw.currentWord as Record<string, unknown>),
        createdAt: new Date((raw.currentWord as Record<string, unknown>).createdAt as string),
      } as unknown as Word
    : null;
  const results = (raw.results as Record<string, unknown>[]).map((r) => ({
    ...r,
    timestamp: new Date(r.timestamp as string),
  })) as unknown as SessionState['results'];

  return {
    sessionId: raw.sessionId as string,
    profileId: raw.profileId as string,
    words,
    currentIndex: raw.currentIndex as number,
    results,
    startedAt: new Date(raw.startedAt as string),
    wordsCorrect: raw.wordsCorrect as number,
    wordsAttempted: raw.wordsAttempted as number,
    isComplete: raw.isComplete as boolean,
    endReason: raw.endReason as SessionState['endReason'],
    currentWord,
    attemptCount: raw.attemptCount as number,
    scaffoldingActive: raw.scaffoldingActive as boolean,
  };
}

export function PracticeScreen({
  profile,
  activeList,
  allWords,
  allStats,
  daysUntilTest,
  streakCount,
  onSessionEnd,
  onStatsUpdate,
  onBack,
  onSpeak,
}: PracticeScreenProps) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [sessionLog, setSessionLog] = useState<SessionLog | null>(null);
  const [reward] = useState<RewardEvent | null>(null);
  const [resumePrompt, setResumePrompt] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);

  // Stable ref for onSpeak so callback identity changes don't re-trigger speech
  const onSpeakRef = useRef(onSpeak);
  useEffect(() => {
    onSpeakRef.current = onSpeak;
  }, [onSpeak]);

  // On mount: check for saved progress
  useEffect(() => {
    let cancelled = false;
    async function checkSavedProgress() {
      const saved = await activityProgressRepo.get(profile.id, 'practice');
      if (cancelled) return;

      if (saved) {
        const restored = deserializeSession(saved.state);
        // Only offer resume if session isn't already complete
        if (!restored.isComplete && restored.currentWord) {
          setResumePrompt(restored);
          setLoading(false);
          return;
        }
        // Stale/complete saved progress — clear it
        await activityProgressRepo.clear(profile.id, 'practice');
      }

      // No saved progress (or it was stale) — start fresh
      const config: Partial<SessionConfig> = {
        maxMinutes: profile.settings.sessionMaxMinutes,
        adaptive: profile.settings.sessionAdaptive,
      };
      // Gate practice to learning-mastered words only
      const mastered = await learningProgressRepo.getMastered(profile.id);
      const masteredWordIds = new Set(mastered.map((p) => p.wordId));

      const newSession = createSession(
        profile.id,
        activeList,
        allWords,
        allStats,
        daysUntilTest,
        config,
        masteredWordIds,
      );
      if (!cancelled) {
        setSession(newSession);
        setLoading(false);
      }
    }
    checkSavedProgress();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startFreshSession = useCallback(async () => {
    const config: Partial<SessionConfig> = {
      maxMinutes: profile.settings.sessionMaxMinutes,
      adaptive: profile.settings.sessionAdaptive,
    };
    // Gate practice to learning-mastered words only
    const mastered = await learningProgressRepo.getMastered(profile.id);
    const masteredWordIds = new Set(mastered.map((p) => p.wordId));

    const newSession = createSession(
      profile.id,
      activeList,
      allWords,
      allStats,
      daysUntilTest,
      config,
      masteredWordIds,
    );
    setSession(newSession);
    setResumePrompt(null);
    activityProgressRepo.clear(profile.id, 'practice');
  }, [profile, activeList, allWords, allStats, daysUntilTest]);

  const handleContinue = useCallback(() => {
    if (resumePrompt) {
      setSession(resumePrompt);
      setResumePrompt(null);
    }
  }, [resumePrompt]);

  const handleReset = useCallback(() => {
    startFreshSession();
  }, [startFreshSession]);

  // Auto-speak the word when it changes or on first load
  const currentWord = session?.currentWord ?? null;
  useEffect(() => {
    if (currentWord && !sessionLog) {
      onSpeakRef.current?.(currentWord.text);
    }
  }, [currentWord, sessionLog]);

  // Auto-save session progress after each state change
  useEffect(() => {
    if (session && !session.isComplete && session.currentWord) {
      activityProgressRepo.save(
        profile.id,
        'practice',
        serializeSession(session),
      );
    }
  }, [session, profile.id]);

  const handleWordComplete = useCallback(
    (correct: boolean, responseTimeMs: number, mistakes: number) => {
      if (!session || !session.currentWord) return;

      const struggled = responseTimeMs > 15000 || mistakes > 0;
      const currentWordStats = allStats.find(
        (s) => s.wordId === session.currentWord!.id,
      ) ?? null;
      const { state: newState, updatedStats } = recordAttempt(
        session,
        correct,
        responseTimeMs,
        struggled,
        session.scaffoldingActive,
        { maxMinutes: profile.settings.sessionMaxMinutes, adaptive: profile.settings.sessionAdaptive },
        currentWordStats,
      );

      if (updatedStats) {
        onStatsUpdate?.(updatedStats);
      }

      setSession(newState);

      if (newState.isComplete) {
        const log = endSession(newState);
        setSessionLog(log);
        onSessionEnd(log);
        // Clear saved progress on completion
        activityProgressRepo.clear(profile.id, 'practice');
      }
    },
    [session, profile, allStats, onSessionEnd, onStatsUpdate],
  );

  const handleQuit = useCallback(() => {
    if (session) {
      const log = endSession(session, 'user-quit');
      setSessionLog(log);
      onSessionEnd(log);
      // Clear saved progress on quit
      activityProgressRepo.clear(profile.id, 'practice');
    }
  }, [session, onSessionEnd, profile.id]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-sf-bg">
        <p className="text-sf-text text-lg">Loading...</p>
      </div>
    );
  }

  // Resume prompt
  if (resumePrompt) {
    const resumeProgress = resumePrompt.words.length > 0
      ? Math.round((resumePrompt.currentIndex / resumePrompt.words.length) * 100)
      : 0;

    return (
      <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-center p-6">
        <div className="max-w-sm w-full bg-sf-surface border border-sf-border rounded-2xl p-6 space-y-5">
          <h2 className="text-xl font-bold text-sf-heading text-center">
            Continue where you left off?
          </h2>
          <p className="text-sf-muted text-center text-sm">
            You have a practice session in progress — {resumePrompt.currentIndex} of{' '}
            {resumePrompt.words.length} words done ({resumeProgress}%).
          </p>
          <div className="w-full bg-sf-track rounded-full h-2">
            <div
              className="bg-sf-track-fill h-2 rounded-full"
              style={{ width: `${resumeProgress}%` }}
            />
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleContinue}
              className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
            >
              Continue
            </button>
            <button
              onClick={handleReset}
              className="w-full bg-sf-surface border border-sf-border hover:bg-sf-surface-hover text-sf-heading font-medium py-3 px-6 rounded-xl transition-colors"
            >
              Start New Session
            </button>
            <button
              onClick={onBack}
              className="text-sf-muted hover:text-sf-secondary text-sm underline"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show summary after session
  if (sessionLog) {
    return (
      <SessionSummary
        session={sessionLog}
        reward={reward}
        streakCount={streakCount}
        onDone={onBack}
      />
    );
  }

  if (!session || !session.currentWord) {
    return (
      <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <p className="text-sf-heading text-lg font-bold">No words ready for practice yet!</p>
          <p className="text-sf-muted text-sm">
            Learn your spelling words first, then come back to practice the ones you&apos;ve mastered.
          </p>
          <button
            onClick={onBack}
            className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const progress = session.words.length > 0
    ? Math.round((session.currentIndex / session.words.length) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-sf-bg p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={handleQuit}
          className="text-sf-muted hover:text-sf-secondary font-medium"
          aria-label="Quit session"
        >
          Quit
        </button>
        <div className="text-sm text-sf-muted">
          {session.currentIndex + 1} / {session.words.length}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-sf-track rounded-full h-2 mb-8">
        <div
          className="bg-sf-track-fill h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Current word */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <div className="text-center">
          <p className="text-sf-muted text-sm mb-2">Spell this word:</p>
          <button
            onClick={() => onSpeak?.(session.currentWord!.text)}
            className="text-2xl font-bold text-sf-heading hover:text-sf-text transition-colors"
            aria-label={`Hear the word ${session.currentWord.text}`}
          >
            Hear it again
          </button>
        </div>

        <LetterBank
          key={session.currentWord.id}
          word={session.currentWord.text}
          onComplete={handleWordComplete}
          scaffolding={
            session.scaffoldingActive
              ? (() => {
                  const analysis = analyzeWord(session.currentWord!.text);
                  return {
                    chunks: analysis.syllables.length > 0
                      ? analysis.syllables
                      : session.currentWord!.syllables.length > 0
                        ? session.currentWord!.syllables
                        : [session.currentWord!.text],
                    hints: analysis.scaffoldingHints,
                  };
                })()
              : null
          }
          tapTargetSize={profile.settings.tapTargetSize}
        />

        {session.attemptCount > 0 && !session.scaffoldingActive && (
          <p className="text-sf-text text-center">
            Almost! Try sounding it out.
          </p>
        )}
      </div>
    </div>
  );
}
