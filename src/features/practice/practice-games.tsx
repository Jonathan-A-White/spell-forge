// src/features/practice/practice-games.tsx — Hub screen for selecting practice game modes

import { useState, useMemo, useCallback } from 'react';
import type { Word, WordList, SessionLog, Profile } from '../../contracts/types';
import { WordSearch } from './word-search';
import type { WordSearchDifficulty } from './word-search-difficulty';
import { Crossword } from './crossword';
import { SpellingQuiz, type QuizResults } from './spelling-quiz';

type GameMode = 'select' | 'word-search-difficulty' | 'word-search' | 'crossword' | 'quiz';

interface PracticeGamesProps {
  profile: Profile;
  activeList: WordList | null;
  allWords: Word[];
  onSessionEnd: (log: SessionLog) => void;
  onBack: () => void;
  onSpeak?: (word: string) => void;
}

export function PracticeGames({
  profile,
  activeList,
  allWords,
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

  // Get words for the active list, or all words if no active list
  const gameWords = useMemo(() => {
    if (activeList) {
      return allWords.filter((w) => w.listId === activeList.id);
    }
    return allWords;
  }, [activeList, allWords]);

  const wordTexts = useMemo(() => {
    const texts = gameWords.map((w) => w.text);
    // For word search and crossword, limit to a reasonable number
    return texts.slice(0, 12);
  }, [gameWords]);

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
    },
    [profile.id, onSessionEnd],
  );

  const handleCrosswordComplete = useCallback(
    (correct: number, total: number) => {
      const percentage = Math.round((correct / total) * 100);
      setGameResult({ correct, total, percentage });

      const log: SessionLog = {
        id: crypto.randomUUID?.() ?? `cw-${Date.now()}`,
        profileId: profile.id,
        startedAt: new Date(),
        endedAt: new Date(),
        wordsAttempted: total,
        wordsCorrect: correct,
        engagementScore: correct / Math.max(total, 1),
        endReason: 'completed',
        rewardEarned: null,
      };
      onSessionEnd(log);
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
    },
    [profile.id, onSessionEnd],
  );

  if (wordTexts.length === 0) {
    return (
      <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-center p-4">
        <p className="text-sf-text text-lg mb-4">No words to play with yet!</p>
        <p className="text-sf-muted text-sm mb-6">Add some spelling words first, then come back to play.</p>
        <button
          onClick={onBack}
          className="text-sf-muted hover:text-sf-secondary underline"
        >
          Go Back
        </button>
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
              onClick={() => setMode('word-search-difficulty')}
            />
            <GameCard
              title="Crossword Puzzle"
              description="Fill in the crossword using clues about your words"
              icon={<CrosswordIcon />}
              accent="from-purple-500/20 to-violet-500/10"
              iconColor="text-purple-500"
              onClick={() => setMode('crossword')}
            />
            <GameCard
              title="Spelling Quiz"
              description="Test yourself! Score 85% or higher to pass"
              icon={<QuizIcon />}
              accent="from-orange-500/20 to-amber-500/10"
              iconColor="text-orange-500"
              onClick={() => setMode('quiz')}
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
              setMode('select');
              setGameResult(null);
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
          />
        )}

        {mode === 'crossword' && !gameResult && (
          <Crossword
            words={wordTexts}
            onComplete={handleCrosswordComplete}
            tapTargetSize={profile.settings.tapTargetSize}
          />
        )}

        {mode === 'quiz' && !gameResult && (
          <SpellingQuiz
            words={wordTexts}
            onComplete={handleQuizComplete}
            onSpeak={onSpeak}
            tapTargetSize={profile.settings.tapTargetSize}
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

function CrosswordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
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
