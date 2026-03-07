// src/features/practice/quiz-screen.tsx — Standalone spelling quiz screen (not a game)

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Profile, WordList, Word, SessionLog, ActivityType } from '../../contracts/types';
import { SpellingQuiz, type QuizResults, type QuizSavedState } from './spelling-quiz';
import { activityProgressRepo } from '../../data/repositories/activity-progress-repo';
import { learningProgressRepo } from '../../data/repositories/learning-progress-repo';
import { statsRepo } from '../../data/repositories/stats-repo';

interface QuizScreenProps {
  profile: Profile;
  activeList: WordList | null;
  allWords: Word[];
  onSessionEnd: (log: SessionLog) => void;
  onBack: () => void;
  onSpeak?: (word: string) => void;
}

interface QuizScreenSavedState {
  quiz: QuizSavedState;
}

export function QuizScreen({
  profile,
  activeList,
  allWords,
  onSessionEnd,
  onBack,
  onSpeak,
}: QuizScreenProps) {
  const [masteredWordIds, setMasteredWordIds] = useState<Set<string> | null>(null);
  const [quizSaved, setQuizSaved] = useState<QuizSavedState | undefined>();
  const [resumePrompt, setResumePrompt] = useState<QuizScreenSavedState | null>(null);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);

  // Load mastered word IDs on mount
  useEffect(() => {
    let cancelled = false;
    async function loadMastered() {
      const [learningMastered, allStats] = await Promise.all([
        learningProgressRepo.getMastered(profile.id),
        statsRepo.getByProfileId(profile.id),
      ]);
      if (!cancelled) {
        const ids = new Set(learningMastered.map((p) => p.wordId));
        for (const stat of allStats) {
          if (stat.currentBucket === 'mastered' || stat.currentBucket === 'review') {
            ids.add(stat.wordId);
          }
        }
        setMasteredWordIds(ids);
      }
    }
    loadMastered();
    return () => { cancelled = true; };
  }, [profile.id]);

  // Get mastered words for the quiz
  const wordTexts = useMemo(() => {
    if (!masteredWordIds) return [];
    const mastered = allWords.filter((w) => masteredWordIds.has(w.id));
    if (activeList) {
      const fromActive = mastered.filter((w) => w.listId === activeList.id);
      const fromOther = mastered.filter((w) => w.listId !== activeList.id);
      return [...fromActive, ...fromOther].map((w) => w.text).slice(0, 12);
    }
    return mastered.map((w) => w.text).slice(0, 12);
  }, [activeList, allWords, masteredWordIds]);

  // Check for saved progress on mount
  useEffect(() => {
    let cancelled = false;
    async function checkSaved() {
      const saved = await activityProgressRepo.get(profile.id, 'quiz' as ActivityType);
      if (cancelled) return;
      if (saved) {
        const state = saved.state as unknown as QuizScreenSavedState;
        if (state.quiz && state.quiz.currentIndex < state.quiz.questions.length) {
          setResumePrompt(state);
          return;
        }
      }
      setStarted(true);
    }
    checkSaved();
    return () => { cancelled = true; };
  }, [profile.id]);

  const handleContinueSaved = useCallback(() => {
    if (!resumePrompt) return;
    setQuizSaved(resumePrompt.quiz);
    setResumePrompt(null);
    setStarted(true);
  }, [resumePrompt]);

  const handleResetSaved = useCallback(() => {
    activityProgressRepo.clear(profile.id, 'quiz' as ActivityType);
    setResumePrompt(null);
    setStarted(true);
  }, [profile.id]);

  const handleQuizProgress = useCallback(
    (qzState: QuizSavedState) => {
      const state: QuizScreenSavedState = { quiz: qzState };
      activityProgressRepo.save(profile.id, 'quiz' as ActivityType, state as unknown as Record<string, unknown>);
    },
    [profile.id],
  );

  const handleQuizComplete = useCallback(
    (results: QuizResults) => {
      setDone(true);
      const log: SessionLog = {
        id: crypto.randomUUID?.() ?? `qz-${Date.now()}`,
        profileId: profile.id,
        startedAt: new Date(),
        endedAt: new Date(),
        wordsAttempted: results.totalQuestions,
        wordsCorrect: results.correctAnswers,
        engagementScore: results.correctAnswers / Math.max(results.totalQuestions, 1),
        endReason: 'completed',
        rewardEarned: null,
      };
      onSessionEnd(log);
      activityProgressRepo.clear(profile.id, 'quiz' as ActivityType);
    },
    [profile.id, onSessionEnd],
  );

  // Loading state
  if (masteredWordIds === null) {
    return (
      <div className="min-h-screen bg-sf-bg flex items-center justify-center">
        <p className="text-sf-text text-lg">Loading...</p>
      </div>
    );
  }

  // No words available
  if (wordTexts.length === 0) {
    return (
      <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <p className="text-sf-heading text-lg font-bold">No words ready for the quiz yet!</p>
          <p className="text-sf-muted text-sm">
            Learn your spelling words first. As you master words in learning mode, they&apos;ll become available here for quizzes.
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

  // Resume prompt
  if (resumePrompt) {
    const progressDetail = resumePrompt.quiz
      ? `${resumePrompt.quiz.currentIndex} of ${resumePrompt.quiz.questions.length} questions answered`
      : '';

    return (
      <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-center p-6">
        <div className="max-w-sm w-full bg-sf-surface border border-sf-border rounded-2xl p-6 space-y-5">
          <h2 className="text-xl font-bold text-sf-heading text-center">
            Continue your quiz?
          </h2>
          <p className="text-sf-muted text-center text-sm">
            You have a <span className="font-medium text-sf-heading">Spelling Quiz</span> in progress
            {progressDetail ? ` — ${progressDetail}` : ''}.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleContinueSaved}
              className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
            >
              Continue
            </button>
            <button
              onClick={handleResetSaved}
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

  // Quiz view
  return (
    <div className="min-h-screen bg-sf-bg p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="text-sf-muted hover:text-sf-secondary font-medium"
          >
            Back
          </button>
          <h1 className="text-xl font-bold text-sf-heading">Spelling Quiz</h1>
          <div className="w-12" />
        </div>

        {started && !done && (
          <SpellingQuiz
            words={wordTexts}
            onComplete={handleQuizComplete}
            onSpeak={onSpeak}
            tapTargetSize={profile.settings.tapTargetSize}
            savedState={quizSaved}
            onProgress={handleQuizProgress}
          />
        )}

        {done && (
          <div className="flex gap-3 w-full max-w-md mx-auto mt-4">
            <button
              onClick={() => {
                setDone(false);
                setQuizSaved(undefined);
                setStarted(true);
              }}
              className="flex-1 bg-sf-surface border border-sf-border hover:bg-sf-surface-hover text-sf-heading font-bold py-3 px-6 rounded-xl transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={onBack}
              className="flex-1 bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
