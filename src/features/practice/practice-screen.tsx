// src/features/practice/practice-screen.tsx — Main practice session screen

import { useState, useCallback } from 'react';
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

interface PracticeScreenProps {
  profile: Profile;
  activeList: WordList | null;
  allWords: Word[];
  allStats: WordStats[];
  daysUntilTest: number | null;
  streakCount: number;
  onSessionEnd: (log: SessionLog) => void;
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

  const handleWordComplete = useCallback(
    (correct: boolean, responseTimeMs: number) => {
      if (!session) return;

      const struggled = responseTimeMs > 15000 || !correct;
      const { state: newState } = recordAttempt(
        session,
        correct,
        responseTimeMs,
        struggled,
        session.scaffoldingActive,
        { maxMinutes: profile.settings.sessionMaxMinutes, adaptive: profile.settings.sessionAdaptive },
      );

      setSession(newState);

      if (newState.isComplete) {
        const log = endSession(newState);
        setSessionLog(log);
        onSessionEnd(log);
      }
    },
    [session, profile, onSessionEnd],
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
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-amber-700 text-lg">No words to practice!</p>
        <button onClick={onBack} className="ml-4 text-amber-600 underline">
          Go Back
        </button>
      </div>
    );
  }

  const progress = session.words.length > 0
    ? Math.round((session.currentIndex / session.words.length) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-amber-50 p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={handleQuit}
          className="text-amber-600 hover:text-amber-800 font-medium"
          aria-label="Quit session"
        >
          Quit
        </button>
        <div className="text-sm text-amber-600">
          {session.currentIndex + 1} / {session.words.length}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-amber-200 rounded-full h-2 mb-8">
        <div
          className="bg-amber-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Current word */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <div className="text-center">
          <p className="text-amber-600 text-sm mb-2">Spell this word:</p>
          <button
            onClick={() => onSpeak?.(session.currentWord!.text)}
            className="text-2xl font-bold text-amber-900 hover:text-amber-700 transition-colors"
            aria-label={`Hear the word ${session.currentWord.text}`}
          >
            Hear it again
          </button>
        </div>

        <LetterBank
          word={session.currentWord.text}
          onComplete={handleWordComplete}
          scaffolding={
            session.scaffoldingActive
              ? {
                  chunks: session.currentWord.syllables.length > 0
                    ? session.currentWord.syllables
                    : [session.currentWord.text],
                  hints: [],
                }
              : null
          }
          tapTargetSize={profile.settings.tapTargetSize}
        />

        {session.attemptCount > 0 && !session.scaffoldingActive && (
          <p className="text-amber-700 text-center">
            Almost! Try sounding it out.
          </p>
        )}
      </div>
    </div>
  );
}
