// src/features/learning/learning-screen.tsx — Main learning mode screen

import { useState, useCallback, useEffect, useRef } from 'react';
import { LetterBank } from '../practice/letter-bank';
import { KeyboardInput } from './keyboard-input';
import { sayAndSpell, sayWordOnly } from './audio-helpers';
import type {
  Word,
  Profile,
  WordLearningProgress,
} from '../../contracts/types';
import type { AudioManager } from '../../audio/manager';
import { useAudioBusy } from '../../audio/use-audio-busy';
import {
  processAttempt,
  getInputMode,
  getHiddenCount,
  generateWordDisplay,
  createInitialProgress,
  sortWordsForLearning,
  findNextWord,
} from '../../core/learning';
import { wordListRepo } from '../../data/repositories/word-list-repo';
import { wordRepo } from '../../data/repositories/word-repo';
import { learningProgressRepo } from '../../data/repositories/learning-progress-repo';
import { activityProgressRepo } from '../../data/repositories/activity-progress-repo';

interface LearningScreenProps {
  profile: Profile;
  audioManager: AudioManager;
  onBack: () => void;
  onWordMastered?: (wordId: string) => void;
}

interface LearningSessionState {
  words: Word[];
  progressMap: Map<string, WordLearningProgress>;
  currentWord: Word | null;
  totalWords: number;
  masteredCount: number;
}

/** Serialize the session state for auto-save */
function serializeState(state: LearningSessionState): Record<string, unknown> {
  const progressEntries: [string, Record<string, unknown>][] = [];
  state.progressMap.forEach((v, k) => {
    progressEntries.push([k, {
      ...v,
      lastAttemptAt: v.lastAttemptAt?.toISOString() ?? null,
      createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : v.createdAt,
    }]);
  });

  return {
    words: state.words.map((w) => ({
      ...w,
      createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : w.createdAt,
    })),
    progressEntries,
    currentWordId: state.currentWord?.id ?? null,
    totalWords: state.totalWords,
    masteredCount: state.masteredCount,
  };
}

/** Deserialize auto-saved session state */
function deserializeState(data: Record<string, unknown>): LearningSessionState {
  const raw = data as Record<string, unknown>;
  const words = (raw.words as Record<string, unknown>[]).map((w) => ({
    ...w,
    createdAt: new Date(w.createdAt as string),
  })) as unknown as Word[];

  const progressMap = new Map<string, WordLearningProgress>();
  const entries = raw.progressEntries as [string, Record<string, unknown>][];
  for (const [key, val] of entries) {
    progressMap.set(key, {
      ...val,
      lastAttemptAt: val.lastAttemptAt ? new Date(val.lastAttemptAt as string) : null,
      createdAt: new Date(val.createdAt as string),
    } as unknown as WordLearningProgress);
  }

  const currentWordId = raw.currentWordId as string | null;
  const currentWord = currentWordId
    ? words.find((w) => w.id === currentWordId) ?? null
    : null;

  return {
    words,
    progressMap,
    currentWord,
    totalWords: raw.totalWords as number,
    masteredCount: raw.masteredCount as number,
  };
}

export function LearningScreen({
  profile,
  audioManager,
  onBack,
  onWordMastered,
}: LearningScreenProps) {
  const [sessionState, setSessionState] = useState<LearningSessionState | null>(null);
  const [resumePrompt, setResumePrompt] = useState<LearningSessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [displayKey, setDisplayKey] = useState(0);
  const [testOutMode, setTestOutMode] = useState(false);

  const audioBusy = useAudioBusy(audioManager);

  // Track the previous word so we know when a new stage starts
  const prevWordRef = useRef<string | null>(null);
  const prevStageRef = useRef<number | null>(null);
  const audioManagerRef = useRef(audioManager);
  useEffect(() => { audioManagerRef.current = audioManager; }, [audioManager]);

  // Load words and progress on mount
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      // Check for saved progress first
      const saved = await activityProgressRepo.get(profile.id, 'learning');
      if (cancelled) return;

      if (saved) {
        const restored = deserializeState(saved.state);
        if (restored.currentWord) {
          setResumePrompt(restored);
          setLoading(false);
          return;
        }
        await activityProgressRepo.clear(profile.id, 'learning');
      }

      // Load fresh data
      const freshState = await loadFreshState(profile.id);
      if (cancelled) return;

      setSessionState(freshState);
      setLoading(false);

      if (!freshState.currentWord) {
        setIsComplete(true);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-play say+spell when word or stage changes
  useEffect(() => {
    if (!sessionState?.currentWord || isComplete) return;

    const wordId = sessionState.currentWord.id;
    const progress = sessionState.progressMap.get(wordId);
    const stage = progress?.stage ?? 0;
    const successes = progress?.consecutiveSuccesses ?? 0;

    const isNewWord = prevWordRef.current !== wordId;
    const isNewStage = prevStageRef.current !== null && prevStageRef.current !== stage;

    if (isNewWord || (isNewStage && successes === 0)) {
      sayAndSpell(audioManagerRef.current, sessionState.currentWord.text);
    }

    prevWordRef.current = wordId;
    prevStageRef.current = stage;
  }, [sessionState?.currentWord?.id, sessionState?.progressMap, isComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save session state
  useEffect(() => {
    if (sessionState && !isComplete && sessionState.currentWord) {
      activityProgressRepo.save(
        profile.id,
        'learning',
        serializeState(sessionState),
      );
    }
  }, [sessionState, isComplete, profile.id]);

  const handleResume = useCallback(() => {
    if (resumePrompt) {
      setSessionState(resumePrompt);
      setResumePrompt(null);
    }
  }, [resumePrompt]);

  const handleStartFresh = useCallback(async () => {
    await activityProgressRepo.clear(profile.id, 'learning');
    const freshState = await loadFreshState(profile.id);
    setSessionState(freshState);
    setResumePrompt(null);
    if (!freshState.currentWord) {
      setIsComplete(true);
    }
  }, [profile.id]);

  const handleTestOut = useCallback(() => {
    setTestOutMode(true);
    setDisplayKey((prev) => prev + 1);
  }, []);

  const handleCancelTestOut = useCallback(() => {
    setTestOutMode(false);
    setDisplayKey((prev) => prev + 1);
  }, []);

  const handleWordComplete = useCallback(
    async (correct: boolean) => {
      if (!sessionState?.currentWord) return;

      const isTestOut = testOutMode;

      const wordId = sessionState.currentWord.id;
      const wordListId = sessionState.currentWord.listId;
      let progress = sessionState.progressMap.get(wordId);

      if (!progress) {
        progress = createInitialProgress(profile.id, wordId, wordListId);
      }

      const updated = processAttempt(progress, { correct, testOut: isTestOut });

      // Exit test-out mode after attempt
      if (isTestOut) {
        setTestOutMode(false);
      }

      // Save to DB
      await learningProgressRepo.save(updated);

      // Notify parent if word just became mastered
      if (updated.mastered && !progress.mastered) {
        onWordMastered?.(wordId);
      }

      // Update local state
      const newMap = new Map(sessionState.progressMap);
      newMap.set(wordId, updated);

      const newMastered = Array.from(newMap.values()).filter((p) => p.mastered).length;

      // Find next word
      const nextWord = findNextWord(sessionState.words, newMap);

      const newState: LearningSessionState = {
        ...sessionState,
        progressMap: newMap,
        currentWord: nextWord,
        masteredCount: newMastered,
      };

      setSessionState(newState);
      setDisplayKey((prev) => prev + 1);

      if (!nextWord) {
        setIsComplete(true);
        await activityProgressRepo.clear(profile.id, 'learning');
      }
    },
    [sessionState, profile.id, testOutMode, onWordMastered],
  );

  const handleHearIt = useCallback(() => {
    if (sessionState?.currentWord) {
      if (testOutMode) {
        sayWordOnly(audioManager, sessionState.currentWord.text);
      } else {
        sayAndSpell(audioManager, sessionState.currentWord.text);
      }
    }
  }, [sessionState, audioManager, testOutMode]);

  // Derive current word display state
  const wordDisplay = (() => {
    if (!sessionState?.currentWord) return null;

    const wordId = sessionState.currentWord.id;
    const progress = sessionState.progressMap.get(wordId);
    const stage = progress?.stage ?? 0;
    const successes = progress?.consecutiveSuccesses ?? 0;
    const inputMode = getInputMode(stage, successes);
    const hiddenCount = getHiddenCount(stage, sessionState.currentWord.text.length);
    const display = generateWordDisplay(sessionState.currentWord.text, hiddenCount);

    return { stage, successes, inputMode, display, hiddenCount };
  })();

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
    const progressPercent = resumePrompt.totalWords > 0
      ? Math.round((resumePrompt.masteredCount / resumePrompt.totalWords) * 100)
      : 0;

    return (
      <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-center p-6">
        <div className="max-w-sm md:max-w-xl w-full bg-sf-surface border border-sf-border rounded-2xl p-6 space-y-5">
          <h2 className="text-xl font-bold text-sf-heading text-center">
            Continue learning?
          </h2>
          <p className="text-sf-muted text-center text-sm">
            You have a learning session in progress — {resumePrompt.masteredCount} of{' '}
            {resumePrompt.totalWords} words mastered ({progressPercent}%).
          </p>
          <div className="w-full bg-sf-track rounded-full h-2">
            <div
              className="bg-sf-track-fill h-2 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleResume}
              className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
            >
              Continue
            </button>
            <button
              onClick={handleStartFresh}
              className="w-full bg-sf-surface border border-sf-border hover:bg-sf-surface-hover text-sf-heading font-medium py-3 px-6 rounded-xl transition-colors"
            >
              Start Fresh
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

  // Completion screen
  if (isComplete) {
    return (
      <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-center p-6">
        <div className="max-w-sm md:max-w-xl w-full text-center space-y-6">
          <div className="w-24 h-24 mx-auto rounded-full bg-green-100 border-4 border-green-500 flex items-center justify-center">
            <span className="text-4xl">&#10003;</span>
          </div>
          <h2 className="text-2xl font-bold text-sf-heading">All Words Mastered!</h2>
          <p className="text-sf-muted">
            You have learned all {sessionState?.totalWords ?? 0} words across your active lists.
          </p>
          <button
            onClick={onBack}
            className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (!sessionState || !sessionState.currentWord || !wordDisplay) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-sf-bg">
        <p className="text-sf-text text-lg">No words to learn!</p>
        <button onClick={onBack} className="ml-4 text-sf-muted underline">
          Go Back
        </button>
      </div>
    );
  }

  const completionPercent = sessionState.totalWords > 0
    ? Math.round((sessionState.masteredCount / sessionState.totalWords) * 100)
    : 0;

  const stageLabels = ['Full Word', '1 Hidden', '2 Hidden', 'Audio Only'];

  return (
    <div className="min-h-screen bg-sf-bg p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="text-sf-muted hover:text-sf-secondary font-medium"
          aria-label="Go back"
        >
          Back
        </button>
        <div className="text-sm text-sf-muted">
          {sessionState.masteredCount} / {sessionState.totalWords} mastered
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-sf-track rounded-full h-2 mb-6">
        <div
          className="bg-sf-track-fill h-2 rounded-full transition-all duration-300"
          style={{ width: `${completionPercent}%` }}
        />
      </div>

      {/* Stage indicator */}
      <div className="text-center mb-2">
        {testOutMode ? (
          <span className="text-xs text-sf-primary bg-sf-surface border border-sf-primary rounded-full px-3 py-1 font-medium">
            Test Out — Spell the word to master it
          </span>
        ) : (
          <span className="text-xs text-sf-muted bg-sf-surface border border-sf-border rounded-full px-3 py-1">
            Stage {wordDisplay.stage + 1}: {stageLabels[wordDisplay.stage]} — Rep {wordDisplay.successes + 1}/3
          </span>
        )}
      </div>

      {/* Current word content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        {/* Word display — hidden entirely during test-out */}
        {!testOutMode && wordDisplay.hiddenCount < sessionState.currentWord.text.length && (
          <div className="text-center">
            <p className="text-3xl font-bold text-sf-heading tracking-wider" aria-label="Word to learn">
              {wordDisplay.display.display.split('').map((char: string, i: number) => (
                <span
                  key={i}
                  className={char === '_' ? 'text-sf-muted' : 'text-sf-heading'}
                >
                  {char === '_' ? '\u2009_\u2009' : char}
                </span>
              ))}
            </p>
          </div>
        )}

        {/* Audio only indicator for stage 3 or test-out */}
        {(testOutMode || wordDisplay.hiddenCount >= sessionState.currentWord.text.length) && (
          <div className="text-center">
            <p className="text-sf-muted text-sm mb-2">Listen and spell:</p>
          </div>
        )}

        {/* Hear it button */}
        <button
          onClick={handleHearIt}
          disabled={audioBusy}
          className={`text-lg font-bold transition-colors bg-sf-surface border border-sf-border rounded-xl px-6 py-3 ${
            audioBusy
              ? 'opacity-50 cursor-not-allowed text-sf-muted'
              : 'text-sf-heading hover:text-sf-text'
          }`}
          aria-label={`Hear the word`}
        >
          Hear it
        </button>

        {/* Input component — test-out always uses keyboard */}
        {testOutMode ? (
          <KeyboardInput
            key={`testout-${sessionState.currentWord.id}-${displayKey}`}
            word={sessionState.currentWord.text}
            onComplete={handleWordComplete}
            tapTargetSize={profile.settings.tapTargetSize}
          />
        ) : wordDisplay.inputMode === 'scrambled' ? (
          <LetterBank
            key={`${sessionState.currentWord.id}-${displayKey}`}
            word={sessionState.currentWord.text}
            onComplete={handleWordComplete}
            scaffolding={null}
            tapTargetSize={profile.settings.tapTargetSize}
          />
        ) : (
          <KeyboardInput
            key={`${sessionState.currentWord.id}-${displayKey}`}
            word={sessionState.currentWord.text}
            onComplete={handleWordComplete}
            tapTargetSize={profile.settings.tapTargetSize}
          />
        )}

        {/* Test Out / Cancel button */}
        {testOutMode ? (
          <button
            onClick={handleCancelTestOut}
            className="text-sf-muted hover:text-sf-secondary text-sm underline"
          >
            Cancel test out
          </button>
        ) : (
          <button
            onClick={handleTestOut}
            className="text-sf-secondary hover:text-sf-secondary-hover text-sm font-medium underline"
            aria-label="Test out of this word"
          >
            I already know this word
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Data Loading ───────────────────────────────────────────

async function loadFreshState(profileId: string): Promise<LearningSessionState> {
  // Fetch all active word lists
  const activeLists = await wordListRepo.getActive(profileId);

  // Fetch words for all active lists
  const wordArrays = await Promise.all(
    activeLists.map((list) => wordRepo.getByListId(list.id)),
  );
  const allWords = wordArrays.flat();

  // Sort shortest-to-longest
  const sortedWords = sortWordsForLearning(allWords);

  // Load all learning progress
  const progressList = await learningProgressRepo.getByProfileId(profileId);
  const progressMap = new Map<string, WordLearningProgress>();
  for (const p of progressList) {
    progressMap.set(p.wordId, p);
  }

  const masteredCount = progressList.filter((p) => p.mastered).length;
  const currentWord = findNextWord(sortedWords, progressMap);

  return {
    words: sortedWords,
    progressMap,
    currentWord,
    totalWords: sortedWords.length,
    masteredCount,
  };
}
