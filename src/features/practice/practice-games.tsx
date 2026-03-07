// src/features/practice/practice-games.tsx — Hub screen for selecting practice game modes

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Word, WordList, SessionLog, Profile, ActivityType, CoinBalance } from '../../contracts/types';
import { WordSearch, type WordSearchSavedState } from './word-search';
import type { WordSearchDifficulty } from './word-search-difficulty';
import { SpellingQuiz, type QuizResults, type QuizSavedState } from './spelling-quiz';
import { activityProgressRepo } from '../../data/repositories/activity-progress-repo';
import { learningProgressRepo } from '../../data/repositories/learning-progress-repo';
import { statsRepo } from '../../data/repositories/stats-repo';

type GameMode = 'select' | 'word-search-difficulty' | 'word-search' | 'quiz';

interface GameSavedState {
  mode: GameMode;
  difficulty: WordSearchDifficulty;
  wordSearch?: WordSearchSavedState;
  quiz?: QuizSavedState;
}

interface PracticeGamesProps {
  profile: Profile;
  activeList: WordList | null;
  allWords: Word[];
  coinBalance: CoinBalance | null;
  allMastered: boolean;
  onSpendCoin: () => Promise<boolean>;
  onSessionEnd: (log: SessionLog) => void;
  onBack: () => void;
  onSpeak?: (word: string) => void;
}

export function PracticeGames({
  profile,
  activeList,
  allWords,
  coinBalance,
  allMastered,
  onSpendCoin,
  onSessionEnd,
  onBack,
  onSpeak,
}: PracticeGamesProps) {
  const [mode, setMode] = useState<GameMode>('select');
  const [wordSearchDifficulty, setWordSearchDifficulty] = useState<WordSearchDifficulty>('medium');
  const [gameResult, setGameResult] = useState<{
    correct: number;
    total: number;
    percentage: number;
    passed?: boolean;
  } | null>(null);
  const [resumePrompt, setResumePrompt] = useState<GameSavedState | null>(null);
  const [pendingGameMode, setPendingGameMode] = useState<GameMode | null>(null);
  const [wordSearchSaved, setWordSearchSaved] = useState<WordSearchSavedState | undefined>();
  const [quizSaved, setQuizSaved] = useState<QuizSavedState | undefined>();
  const loading = false;
  const [masteredWordIds, setMasteredWordIds] = useState<Set<string> | null>(null);
  const [coinGateVisible, setCoinGateVisible] = useState(false);
  const [pendingCoinGameMode, setPendingCoinGameMode] = useState<GameMode | null>(null);
  const coins = coinBalance?.coins ?? 0;

  // Load mastered word IDs on mount — combine both learning progress and spaced-rep buckets
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

  // Get mastered words for games — use all mastered words across all lists
  // so games always have enough words to be fun, even when the active list
  // has very few mastered words.
  const gameWords = useMemo(() => {
    if (!masteredWordIds) return [];
    const mastered = allWords.filter((w) => masteredWordIds.has(w.id));
    // Prioritise the active list's words first, then fill with others
    if (activeList) {
      const fromActive = mastered.filter((w) => w.listId === activeList.id);
      const fromOther = mastered.filter((w) => w.listId !== activeList.id);
      return [...fromActive, ...fromOther];
    }
    return mastered;
  }, [activeList, allWords, masteredWordIds]);

  const wordTexts = useMemo(() => {
    const texts = gameWords.map((w) => w.text);
    // For word search, limit to a reasonable number
    return texts.slice(0, 12);
  }, [gameWords]);

  // When a game mode is selected, check for saved progress for that game
  useEffect(() => {
    if (!pendingGameMode) return;
    const targetMode = pendingGameMode;
    let cancelled = false;

    async function checkSavedForGame() {
      const activityType: ActivityType = targetMode === 'word-search-difficulty' ? 'word-search' : 'quiz';
      const saved = await activityProgressRepo.get(profile.id, activityType);

      if (cancelled) return;

      if (saved) {
        const state = saved.state as unknown as GameSavedState;
        const hasValidProgress =
          (activityType === 'word-search' && state.mode === 'word-search' && state.wordSearch) ||
          (activityType === 'quiz' && state.mode === 'quiz' && state.quiz && state.quiz.currentIndex < state.quiz.questions.length);

        if (hasValidProgress) {
          setResumePrompt(state);
          return;
        }
      }

      // No saved progress — go directly to the game
      setMode(targetMode);
      setPendingGameMode(null);
    }

    checkSavedForGame();
    return () => { cancelled = true; };
  }, [pendingGameMode, profile.id]);

  const handleContinueSaved = useCallback(() => {
    if (!resumePrompt) return;
    setMode(resumePrompt.mode);
    setWordSearchDifficulty(resumePrompt.difficulty);
    if (resumePrompt.wordSearch) setWordSearchSaved(resumePrompt.wordSearch);
    if (resumePrompt.quiz) setQuizSaved(resumePrompt.quiz);
    setResumePrompt(null);
    setPendingGameMode(null);
  }, [resumePrompt]);

  const handleResetSaved = useCallback(() => {
    const activityType: ActivityType = pendingGameMode === 'word-search-difficulty' ? 'word-search' : 'quiz';
    activityProgressRepo.clear(profile.id, activityType);
    setResumePrompt(null);
    if (pendingGameMode) {
      setMode(pendingGameMode);
      setPendingGameMode(null);
    }
  }, [profile.id, pendingGameMode]);

  // Coin-gated game start: free if all mastered, otherwise costs 1 coin
  const handleStartGame = useCallback((targetMode: GameMode) => {
    if (allMastered) {
      // All words mastered — free unlimited play
      setPendingGameMode(targetMode);
      return;
    }
    if (coins > 0) {
      // Has coins — show spend confirmation
      setPendingCoinGameMode(targetMode);
      setCoinGateVisible(true);
      return;
    }
    // No coins, not all mastered — show gate
    setCoinGateVisible(true);
    setPendingCoinGameMode(null);
  }, [allMastered, coins]);

  const handleConfirmSpendCoin = useCallback(async () => {
    if (!pendingCoinGameMode) return;
    const success = await onSpendCoin();
    if (success) {
      setCoinGateVisible(false);
      setPendingGameMode(pendingCoinGameMode);
      setPendingCoinGameMode(null);
    }
  }, [pendingCoinGameMode, onSpendCoin]);

  const saveGameState = useCallback(
    (activityType: ActivityType, gameMode: GameMode, extra: Partial<GameSavedState>) => {
      const state: GameSavedState = {
        mode: gameMode,
        difficulty: wordSearchDifficulty,
        ...extra,
      };
      activityProgressRepo.save(profile.id, activityType, state as unknown as Record<string, unknown>);
    },
    [profile.id, wordSearchDifficulty],
  );

  const handleWordSearchProgress = useCallback(
    (wsState: WordSearchSavedState) => {
      saveGameState('word-search', 'word-search', { wordSearch: wsState });
    },
    [saveGameState],
  );

  const handleQuizProgress = useCallback(
    (qzState: QuizSavedState) => {
      saveGameState('quiz', 'quiz', { quiz: qzState });
    },
    [saveGameState],
  );

  const handleWordSearchComplete = useCallback(
    (found: number, total: number) => {
      const percentage = Math.round((found / total) * 100);
      setGameResult({ correct: found, total, percentage });

      const log: SessionLog = {
        id: crypto.randomUUID?.() ?? `ws-${Date.now()}`,
        profileId: profile.id,
        startedAt: new Date(),
        endedAt: new Date(),
        wordsAttempted: total,
        wordsCorrect: found,
        engagementScore: found / Math.max(total, 1),
        endReason: 'completed',
        rewardEarned: null,
      };
      onSessionEnd(log);
      // Clear saved progress on completion
      activityProgressRepo.clear(profile.id, 'word-search');
    },
    [profile.id, onSessionEnd],
  );

  const handleQuizComplete = useCallback(
    (results: QuizResults) => {
      setGameResult({
        correct: results.correctAnswers,
        total: results.totalQuestions,
        percentage: results.percentage,
        passed: results.passed,
      });

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
      // Clear saved progress on completion
      activityProgressRepo.clear(profile.id, 'quiz');
    },
    [profile.id, onSessionEnd],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-sf-bg flex items-center justify-center">
        <p className="text-sf-text text-lg">Loading...</p>
      </div>
    );
  }

  if (wordTexts.length === 0) {
    return (
      <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <p className="text-sf-heading text-lg font-bold">No words ready for games yet!</p>
          <p className="text-sf-muted text-sm">
            Learn your spelling words first. As you master words in learning mode, they&apos;ll become available here for games.
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
    const gameLabel = resumePrompt.mode === 'word-search' ? 'Word Search' : 'Spelling Quiz';
    const progressDetail = resumePrompt.mode === 'word-search' && resumePrompt.wordSearch
      ? `${resumePrompt.wordSearch.foundWords.length} of ${resumePrompt.wordSearch.placed.length} words found`
      : resumePrompt.mode === 'quiz' && resumePrompt.quiz
        ? `${resumePrompt.quiz.currentIndex} of ${resumePrompt.quiz.questions.length} questions answered`
        : '';

    return (
      <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-center p-6">
        <div className="max-w-sm w-full bg-sf-surface border border-sf-border rounded-2xl p-6 space-y-5">
          <h2 className="text-xl font-bold text-sf-heading text-center">
            Continue your game?
          </h2>
          <p className="text-sf-muted text-center text-sm">
            You have a <span className="font-medium text-sf-heading">{gameLabel}</span> in progress
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
              onClick={() => { setResumePrompt(null); setPendingGameMode(null); }}
              className="text-sf-muted hover:text-sf-secondary text-sm underline"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Coin gate overlay
  if (coinGateVisible) {
    return (
      <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-center p-6">
        <div className="max-w-sm w-full bg-sf-surface border border-sf-border rounded-2xl p-6 space-y-5">
          {pendingCoinGameMode ? (
            <>
              <h2 className="text-xl font-bold text-sf-heading text-center">
                Spend 1 Coin to Play?
              </h2>
              <p className="text-sf-muted text-center text-sm">
                You have <span className="font-bold text-yellow-500">{coins}</span> coin{coins !== 1 ? 's' : ''}.
                Playing a game costs 1 coin while you still have new words to learn.
              </p>
              <p className="text-sf-faint text-center text-xs">
                Master more words to earn coins! Once all words are mastered, games are free.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleConfirmSpendCoin}
                  className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
                >
                  Spend 1 Coin &amp; Play
                </button>
                <button
                  onClick={() => { setCoinGateVisible(false); setPendingCoinGameMode(null); }}
                  className="text-sf-muted hover:text-sf-secondary text-sm underline"
                >
                  Go Back
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-sf-heading text-center">
                No Coins!
              </h2>
              <p className="text-sf-muted text-center text-sm">
                You need coins to play games. Master your spelling words to earn coins — each word you master gives you 1 coin!
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => { setCoinGateVisible(false); onBack(); }}
                  className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
                >
                  Go Learn Words
                </button>
                <button
                  onClick={() => setCoinGateVisible(false)}
                  className="text-sf-muted hover:text-sf-secondary text-sm underline"
                >
                  Go Back
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Game mode selection screen
  if (mode === 'select') {
    return (
      <div className="min-h-screen bg-sf-bg p-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={onBack}
              className="text-sf-muted hover:text-sf-secondary font-medium"
            >
              Back
            </button>
            <h1 className="text-xl font-bold text-sf-heading">Practice Games</h1>
            <div className="w-12" />
          </div>

          <div className="flex justify-center gap-3 mb-4">
            {allMastered ? (
              <span className="inline-flex items-center gap-1.5 bg-green-500/10 text-green-500 rounded-full px-3 py-1.5 text-sm font-medium">
                ✨ Free Play — All Words Mastered!
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 bg-yellow-500/10 text-yellow-500 rounded-full px-3 py-1.5 text-sm font-medium">
                🪙 {coins} Coin{coins !== 1 ? 's' : ''} — 1 per game
              </span>
            )}
          </div>

          <p className="text-sf-muted text-center mb-6">
            Choose a game to practice your {wordTexts.length} word{wordTexts.length !== 1 ? 's' : ''}
            {activeList ? ` from "${activeList.name}"` : ''}
          </p>

          <div className="space-y-3">
            <GameCard
              title="Word Search"
              description="Find your spelling words hidden in a grid of letters"
              icon={<SearchGridIcon />}
              accent="from-blue-500/20 to-cyan-500/10"
              iconColor="text-blue-500"
              onClick={() => handleStartGame('word-search-difficulty')}
            />
            <GameCard
              title="Spelling Quiz"
              description="Test yourself! Score 85% or higher to pass"
              icon={<QuizIcon />}
              accent="from-orange-500/20 to-amber-500/10"
              iconColor="text-orange-500"
              onClick={() => handleStartGame('quiz')}
            />
          </div>
        </div>
      </div>
    );
  }

  // Difficulty picker for Word Search
  if (mode === 'word-search-difficulty') {
    return (
      <div className="min-h-screen bg-sf-bg p-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setMode('select')}
              className="text-sf-muted hover:text-sf-secondary font-medium"
            >
              Back
            </button>
            <h1 className="text-xl font-bold text-sf-heading">Word Search</h1>
            <div className="w-12" />
          </div>

          <p className="text-sf-muted text-center mb-6">Choose a difficulty level</p>

          <div className="space-y-3">
            <DifficultyCard
              level="easy"
              title="Easy"
              description="Fewer words, horizontal & vertical only, smaller grid"
              color="text-green-500"
              bgAccent="from-green-500/20 to-emerald-500/10"
              selected={wordSearchDifficulty === 'easy'}
              onClick={() => setWordSearchDifficulty('easy')}
            />
            <DifficultyCard
              level="medium"
              title="Medium"
              description="More words with diagonal directions added"
              color="text-yellow-500"
              bgAccent="from-yellow-500/20 to-amber-500/10"
              selected={wordSearchDifficulty === 'medium'}
              onClick={() => setWordSearchDifficulty('medium')}
            />
            <DifficultyCard
              level="hard"
              title="Hard"
              description="All words, all directions including backwards, larger grid"
              color="text-red-500"
              bgAccent="from-red-500/20 to-rose-500/10"
              selected={wordSearchDifficulty === 'hard'}
              onClick={() => setWordSearchDifficulty('hard')}
            />
          </div>

          <button
            onClick={() => setMode('word-search')}
            className="w-full mt-6 bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
          >
            Start Game
          </button>
        </div>
      </div>
    );
  }

  // Active game view
  return (
    <div className="min-h-screen bg-sf-bg p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {
              setGameResult(null);
              setWordSearchSaved(undefined);
              setQuizSaved(undefined);
              setMode('select');
            }}
            className="text-sf-muted hover:text-sf-secondary font-medium"
          >
            Back to Games
          </button>
        </div>

        {mode === 'word-search' && !gameResult && (
          <WordSearch
            words={wordTexts}
            difficulty={wordSearchDifficulty}
            onComplete={handleWordSearchComplete}
            tapTargetSize={profile.settings.tapTargetSize}
            savedState={wordSearchSaved}
            onProgress={handleWordSearchProgress}
          />
        )}

        {mode === 'quiz' && !gameResult && (
          <SpellingQuiz
            words={wordTexts}
            onComplete={handleQuizComplete}
            onSpeak={onSpeak}
            tapTargetSize={profile.settings.tapTargetSize}
            savedState={quizSaved}
            onProgress={handleQuizProgress}
          />
        )}

        {gameResult && mode !== 'quiz' && (
          <div className="flex flex-col items-center gap-6 p-6 max-w-md mx-auto">
            <h2 className="text-2xl font-bold text-sf-heading">Game Complete!</h2>

            <div className={`w-32 h-32 rounded-full flex items-center justify-center border-4 ${
              gameResult.percentage >= 85
                ? 'border-green-500 bg-green-50'
                : 'border-orange-400 bg-orange-50'
            }`}>
              <span className={`text-3xl font-bold ${
                gameResult.percentage >= 85 ? 'text-green-700' : 'text-orange-600'
              }`}>
                {gameResult.percentage}%
              </span>
            </div>

            <p className="text-sf-text">
              {gameResult.correct} out of {gameResult.total} words
            </p>

            <div className="flex gap-3 w-full">
              <button
                onClick={() => {
                  setGameResult(null);
                  setWordSearchSaved(undefined);
                  setMode('select');
                }}
                className="flex-1 bg-sf-surface border border-sf-border hover:bg-sf-surface-hover text-sf-heading font-bold py-3 px-6 rounded-xl transition-colors"
              >
                Play Again
              </button>
              <button
                onClick={onBack}
                className="flex-1 bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {gameResult && mode === 'quiz' && (
          <div className="flex gap-3 w-full max-w-md mx-auto mt-4">
            <button
              onClick={() => {
                setGameResult(null);
                setQuizSaved(undefined);
                setMode('select');
              }}
              className="flex-1 bg-sf-surface border border-sf-border hover:bg-sf-surface-hover text-sf-heading font-bold py-3 px-6 rounded-xl transition-colors"
            >
              Play Again
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

// ─── Sub-components ──────────────────────────────────────────

interface GameCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  iconColor: string;
  onClick: () => void;
}

function GameCard({ title, description, icon, onClick, accent, iconColor }: GameCardProps) {
  return (
    <button
      onClick={onClick}
      className="group w-full relative overflow-hidden rounded-xl bg-sf-surface border border-sf-border p-5 text-left hover:border-sf-border-strong hover:shadow-md transition-all active:scale-[0.98]"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-0 group-hover:opacity-100 transition-opacity`} />
      <div className="relative flex items-center gap-4">
        <div className={`${iconColor} flex-shrink-0`}>{icon}</div>
        <div>
          <p className="font-bold text-sf-heading">{title}</p>
          <p className="text-sf-muted text-sm mt-0.5">{description}</p>
        </div>
        <div className="ml-auto text-sf-muted group-hover:text-sf-heading text-xl transition-colors">
          →
        </div>
      </div>
    </button>
  );
}

// ─── Difficulty Card ─────────────────────────────────────────

interface DifficultyCardProps {
  level: string;
  title: string;
  description: string;
  color: string;
  bgAccent: string;
  selected: boolean;
  onClick: () => void;
}

function DifficultyCard({ title, description, color, bgAccent, selected, onClick }: DifficultyCardProps) {
  return (
    <button
      onClick={onClick}
      className={`group w-full relative overflow-hidden rounded-xl bg-sf-surface border-2 p-5 text-left transition-all active:scale-[0.98] ${
        selected
          ? 'border-sf-primary shadow-md'
          : 'border-sf-border hover:border-sf-border-strong hover:shadow-md'
      }`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${bgAccent} ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`} />
      <div className="relative flex items-center gap-4">
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          selected ? 'border-sf-primary' : 'border-sf-border'
        }`}>
          {selected && <div className="w-2.5 h-2.5 rounded-full bg-sf-primary" />}
        </div>
        <div>
          <p className={`font-bold ${color}`}>{title}</p>
          <p className="text-sf-muted text-sm mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  );
}

// ─── SVG Icons ───────────────────────────────────────────────

function SearchGridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function QuizIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
