// src/features/practice/practice-screen.tsx — Main practice session screen

import { useState, useCallback, useEffect } from 'react';
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
  const [session, setSession] = useState<SessionState | null>(() => {
    const config: Partial<SessionConfig> = {
      maxMinutes: profile.settings.sessionMaxMinutes,
      adaptive: profile.settings.sessionAdaptive,
    };
    return createSession(
      profile.id,
      activeList,
      allWords,
      allStats,
      daysUntilTest,
      config,
    );
  });
  const [sessionLog, setSessionLog] = useState<SessionLog | null>(null);
  const [reward] = useState<RewardEvent | null>(null);

  // Auto-speak the word when it changes or on first load
  const currentWord = session?.currentWord ?? null;
  useEffect(() => {
    if (currentWord) {
      onSpeak?.(currentWord.text);
    }
  }, [currentWord, onSpeak]);

  const handleWordComplete = useCallback(
    (correct: boolean, responseTimeMs: number) => {
      if (!session || !session.currentWord) return;

      const struggled = responseTimeMs > 15000 || !correct;
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
      }
    },
    [session, profile, allStats, onSessionEnd, onStatsUpdate],
  );

  const handleQuit = useCallback(() => {
    if (session) {
      const log = endSession(session, 'user-quit');
      setSessionLog(log);
      onSessionEnd(log);
    }
  }, [session, onSessionEnd]);

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
      <div className="flex items-center justify-center min-h-screen bg-sf-bg">
        <p className="text-sf-text text-lg">No words to practice!</p>
        <button onClick={onBack} className="ml-4 text-sf-muted underline">
          Go Back
        </button>
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
