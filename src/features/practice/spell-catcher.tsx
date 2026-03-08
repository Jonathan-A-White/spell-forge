// src/features/practice/spell-catcher.tsx — Treasure Dive letter-catching spelling game

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { shuffle } from '../../core/shuffle';
import {
  createLetterBatch,
  checkCatch,
  calcWordScore,
  calcDepthLevel,
  calcStartingLives,
  calcCatcherStars,
  calcMaxPossibleScore,
  type FallingLetter,
} from './spell-catcher-logic';

// ─── Types ───────────────────────────────────────────────────

export interface SpellCatcherResults {
  totalWords: number;
  wordsCompleted: number;
  totalScore: number;
  maxPossibleScore: number;
}

export interface SpellCatcherSavedState {
  words: string[];
  currentWordIndex: number;
  wordsCompleted: number;
  totalScore: number;
  nextLetterIndex: number;
  lives: number;
}

interface SpellCatcherProps {
  words: string[];
  onComplete: (results: SpellCatcherResults) => void;
  onSpeak?: (word: string) => void;
  tapTargetSize: number;
  savedState?: SpellCatcherSavedState;
  onProgress?: (state: SpellCatcherSavedState) => void;
}

const GRID_COLUMNS = 5;
const GRID_ROWS = 6;
const TICK_MS = 800;

// ─── Component ───────────────────────────────────────────────

export function SpellCatcher({
  words,
  onComplete,
  onSpeak,
  tapTargetSize,
  savedState,
  onProgress,
}: SpellCatcherProps) {
  const gameWords = useMemo(() => {
    if (savedState) return savedState.words;
    return shuffle(words).slice(0, 10);
  }, [words, savedState]);

  const [currentWordIndex, setCurrentWordIndex] = useState(savedState?.currentWordIndex ?? 0);
  const [wordsCompleted, setWordsCompleted] = useState(savedState?.wordsCompleted ?? 0);
  const [totalScore, setTotalScore] = useState(savedState?.totalScore ?? 0);
  const [nextLetterIndex, setNextLetterIndex] = useState(savedState?.nextLetterIndex ?? 0);
  const [lives, setLives] = useState(
    savedState?.lives ?? calcStartingLives(gameWords[0]?.length ?? 3),
  );
  const [fallingLetters, setFallingLetters] = useState<FallingLetter[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'correct' | 'wrong'; letter: string } | null>(null);
  const [gameStarted, setGameStarted] = useState(!!savedState);
  const [wordComplete, setWordComplete] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const batchCounterRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onProgressRef = useRef(onProgress);
  const onSpeakRef = useRef(onSpeak);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    onSpeakRef.current = onSpeak;
  }, [onSpeak]);

  const currentWord = gameWords[currentWordIndex] ?? '';
  const maxLives = calcStartingLives(currentWord.length);
  const isFinished = currentWordIndex >= gameWords.length || gameOver;
  const depthLevel = calcDepthLevel(wordsCompleted, gameWords.length);

  // Auto-speak the current word when a new word starts
  useEffect(() => {
    if (gameStarted && !isFinished && !wordComplete) {
      onSpeakRef.current?.(currentWord);
    }
  }, [gameStarted, currentWordIndex, isFinished, wordComplete, currentWord]);

  // Save progress
  useEffect(() => {
    if (gameStarted && !isFinished) {
      onProgressRef.current?.({
        words: gameWords,
        currentWordIndex,
        wordsCompleted,
        totalScore,
        nextLetterIndex,
        lives,
      });
    }
  }, [gameStarted, isFinished, gameWords, currentWordIndex, wordsCompleted, totalScore, nextLetterIndex, lives]);

  // Spawn new letter batches
  useEffect(() => {
    if (!gameStarted || isFinished || wordComplete) return;

    const spawnBatch = () => {
      const id = batchCounterRef.current++;
      const batch = createLetterBatch(currentWord, nextLetterIndex, GRID_COLUMNS, id);
      setFallingLetters((fl) => [...fl, ...batch]);
    };

    // Initial spawn
    spawnBatch();

    batchRef.current = setInterval(spawnBatch, TICK_MS * 3);
    return () => {
      if (batchRef.current) clearInterval(batchRef.current);
    };
  }, [gameStarted, isFinished, wordComplete, currentWord, nextLetterIndex]);

  // Tick: advance falling letters downward; lose a life if a target letter falls off
  useEffect(() => {
    if (!gameStarted || isFinished || wordComplete) return;

    tickRef.current = setInterval(() => {
      setFallingLetters((prev) => {
        const advanced = prev.map((fl) => ({ ...fl, row: fl.row + fl.speed }));
        const escaped = advanced.filter((fl) => fl.row >= GRID_ROWS + 1);
        const remaining = advanced.filter((fl) => fl.row < GRID_ROWS + 1);

        // If any target letter fell off the screen, lose a life
        const targetEscaped = escaped.some((fl) => fl.isTarget);
        if (targetEscaped) {
          setLives((prev) => {
            const newLives = prev - 1;
            if (newLives <= 0) {
              setWordComplete(true);
              setFallingLetters([]);
            }
            return newLives;
          });
        }

        return remaining;
      });
    }, TICK_MS);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [gameStarted, isFinished, wordComplete]);

  const handleCatchLetter = useCallback(
    (letter: FallingLetter) => {
      if (wordComplete || isFinished) return;

      const result = checkCatch(letter.letter, currentWord, nextLetterIndex);

      // Remove the caught letter from the grid
      setFallingLetters((prev) => prev.filter((fl) => fl.id !== letter.id));

      if (result.correct) {
        setFeedback({ type: 'correct', letter: letter.letter });
        const newIndex = nextLetterIndex + 1;
        setNextLetterIndex(newIndex);

        // Check if word is complete
        if (newIndex >= currentWord.length) {
          const score = calcWordScore(lives, maxLives, currentWord.length);
          setTotalScore((prev) => prev + score);
          setWordsCompleted((prev) => prev + 1);
          setWordComplete(true);
          setFallingLetters([]);
        }
      } else {
        setFeedback({ type: 'wrong', letter: letter.letter });
        const newLives = lives - 1;
        setLives(newLives);

        if (newLives <= 0) {
          // Out of lives for this word — skip to next
          setWordComplete(true);
          setFallingLetters([]);
        }
      }

      // Clear feedback after a moment
      setTimeout(() => setFeedback(null), 500);
    },
    [wordComplete, isFinished, currentWord, nextLetterIndex, lives, maxLives],
  );

  const handleNextWord = useCallback(() => {
    const nextIdx = currentWordIndex + 1;
    if (nextIdx >= gameWords.length) {
      setGameOver(true);
      return;
    }
    setCurrentWordIndex(nextIdx);
    setNextLetterIndex(0);
    setLives(calcStartingLives(gameWords[nextIdx].length));
    setWordComplete(false);
    setFallingLetters([]);
    setFeedback(null);
  }, [currentWordIndex, gameWords]);

  const handleFinish = useCallback(() => {
    const maxScore = calcMaxPossibleScore(gameWords);
    onComplete({
      totalWords: gameWords.length,
      wordsCompleted,
      totalScore,
      maxPossibleScore: maxScore,
    });
  }, [gameWords, wordsCompleted, totalScore, onComplete]);

  const buttonSize = `${tapTargetSize}px`;

  // ─── Start screen ──────────────────────────────────────────

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-sf-heading">Spell Catcher</h2>

        <div className="w-full bg-sf-surface border border-sf-border rounded-2xl p-6 text-center space-y-4">
          <TreasureIcon className="w-16 h-16 mx-auto text-cyan-500" />

          <p className="text-sf-text font-medium">
            Dive deep and catch the right letters to spell each word!
          </p>

          <div className="text-sf-muted text-sm space-y-1">
            <p>Tap the correct falling letter in order</p>
            <p>Wrong letters cost a life</p>
            <p>Complete words to find treasure!</p>
          </div>

          <div className="flex justify-center gap-6 pt-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-sf-heading">{gameWords.length}</p>
              <p className="text-xs text-sf-muted">Words</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setGameStarted(true)}
          className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-4 px-6 rounded-xl transition-colors text-lg"
          style={{ minHeight: buttonSize }}
        >
          Start Dive!
        </button>
      </div>
    );
  }

  // ─── Results screen ────────────────────────────────────────

  if (isFinished) {
    const maxScore = calcMaxPossibleScore(gameWords);
    const stars = calcCatcherStars(wordsCompleted, gameWords.length, totalScore, maxScore);
    const percentage = Math.round((wordsCompleted / gameWords.length) * 100);

    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-sf-heading">Dive Complete!</h2>

        {/* Stars */}
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className={`text-4xl ${i <= stars ? 'text-yellow-400' : 'text-gray-300'}`}
            >
              ★
            </span>
          ))}
        </div>

        <div className="w-full bg-sf-surface border border-sf-border rounded-2xl p-6 text-center space-y-3">
          <p className="text-4xl font-bold text-cyan-500">{totalScore}</p>
          <p className="text-sf-muted text-sm">points</p>

          <div className="flex justify-center gap-8 pt-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-sf-heading">{percentage}%</p>
              <p className="text-xs text-sf-muted">Words Caught</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-sf-heading">
                {wordsCompleted}/{gameWords.length}
              </p>
              <p className="text-xs text-sf-muted">Complete</p>
            </div>
          </div>

          <div className="text-center pt-2">
            <p className="text-sf-muted text-xs">
              Depth reached: Level {depthLevel}
            </p>
          </div>
        </div>

        {/* Word results */}
        <div className="w-full space-y-2">
          <h3 className="font-bold text-sf-heading text-sm">Treasure Log:</h3>
          {gameWords.map((word, i) => (
            <div
              key={i}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                i < wordsCompleted
                  ? 'bg-cyan-50 border-cyan-200'
                  : i === currentWordIndex && !gameOver
                    ? 'bg-orange-50 border-orange-200'
                    : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {i < wordsCompleted ? '\u2713' : i === currentWordIndex && !gameOver ? '\u2717' : '\u2014'}
                </span>
                <span className={`font-medium ${
                  i < wordsCompleted ? 'text-cyan-800' : 'text-gray-500'
                }`}>
                  {word}
                </span>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleFinish}
          className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
          style={{ minHeight: buttonSize }}
        >
          Done
        </button>
      </div>
    );
  }

  // ─── Word complete interstitial ────────────────────────────

  if (wordComplete) {
    const wasSuccess = nextLetterIndex >= currentWord.length;
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-sf-heading">
          {wasSuccess ? 'Treasure Found!' : 'Word Missed!'}
        </h2>

        <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 ${
          wasSuccess ? 'border-cyan-400 bg-cyan-50' : 'border-orange-400 bg-orange-50'
        }`}>
          <span className="text-4xl">{wasSuccess ? '💎' : '🫧'}</span>
        </div>

        <p className="text-sf-heading text-xl font-bold tracking-wider">
          {currentWord.split('').map((ch, i) => (
            <span
              key={i}
              className={
                i < nextLetterIndex
                  ? 'text-cyan-500'
                  : 'text-gray-300'
              }
            >
              {ch}
            </span>
          ))}
        </p>

        {wasSuccess && (
          <p className="text-cyan-500 font-medium">
            +{calcWordScore(lives, maxLives, currentWord.length)} points!
          </p>
        )}

        <button
          onClick={handleNextWord}
          className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-6 rounded-xl transition-colors"
          style={{ minHeight: buttonSize }}
        >
          {currentWordIndex + 1 < gameWords.length ? 'Next Word' : 'See Results'}
        </button>
      </div>
    );
  }

  // ─── Active game ───────────────────────────────────────────

  // Build revealed letters so far
  const revealedLetters = currentWord.slice(0, nextLetterIndex).split('');
  const remainingSlots = currentWord.length - nextLetterIndex;

  return (
    <div className="flex flex-col items-center gap-3 p-4 max-w-md mx-auto w-full">
      {/* Header */}
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-sf-muted">
            Word {currentWordIndex + 1}/{gameWords.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: maxLives }, (_, i) => (
            <span
              key={i}
              className={`text-lg ${i < lives ? 'text-red-400' : 'text-gray-300'}`}
            >
              ♥
            </span>
          ))}
        </div>
        <div className="text-right">
          <span className="text-sm font-bold text-cyan-500">{totalScore} pts</span>
        </div>
      </div>

      {/* Target word display */}
      <div className="w-full bg-sf-surface border border-sf-border rounded-xl p-3">
        <div className="flex items-center justify-center gap-1">
          {onSpeak && (
            <button
              onClick={() => onSpeak(currentWord)}
              className="mr-2 text-sf-muted hover:text-cyan-500 transition-colors"
              aria-label="Hear the word"
            >
              🔊
            </button>
          )}
          {revealedLetters.map((ch, i) => (
            <span key={i} className="w-8 h-10 flex items-center justify-center bg-cyan-100 border border-cyan-300 rounded font-bold text-cyan-700 text-lg">
              {ch}
            </span>
          ))}
          {Array.from({ length: remainingSlots }, (_, i) => (
            <span key={`blank-${i}`} className="w-8 h-10 flex items-center justify-center bg-sf-surface border-2 border-dashed border-sf-border rounded text-lg text-sf-muted">
              ?
            </span>
          ))}
        </div>
        <p className="text-center text-xs text-sf-muted mt-2">
          Catch the letter: <span className="font-bold text-cyan-500 text-sm">{currentWord[nextLetterIndex]?.toUpperCase()}</span>
        </p>
      </div>

      {/* Depth indicator */}
      <div className="w-full flex items-center gap-2">
        <span className="text-xs text-sf-muted">Depth {depthLevel}</span>
        <div className="flex-1 h-1.5 bg-sf-border rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.round((wordsCompleted / gameWords.length) * 100)}%` }}
          />
        </div>
      </div>

      {/* Falling letters grid */}
      <div
        className="w-full relative rounded-xl overflow-hidden border border-sf-border"
        style={{
          height: `${GRID_ROWS * 56}px`,
          background: `linear-gradient(180deg, rgba(6,182,212,0.05) 0%, rgba(6,182,212,0.15) 50%, rgba(30,64,175,0.2) 100%)`,
        }}
      >
        {/* Column guides */}
        {Array.from({ length: GRID_COLUMNS }, (_, col) => (
          <div
            key={`col-${col}`}
            className="absolute top-0 bottom-0 border-r border-sf-border/20"
            style={{ left: `${((col + 1) / GRID_COLUMNS) * 100}%` }}
          />
        ))}

        {/* Falling letters */}
        {fallingLetters.map((fl) => {
          const colWidth = 100 / GRID_COLUMNS;
          const leftPct = fl.column * colWidth + colWidth / 2;
          const topPx = fl.row * 56;

          return (
            <button
              key={fl.id}
              onClick={() => handleCatchLetter(fl)}
              className={`absolute w-12 h-12 -ml-6 rounded-xl font-bold text-xl flex items-center justify-center transition-all active:scale-90 ${
                fl.isTarget
                  ? 'bg-cyan-100 border-2 border-cyan-400 text-cyan-700 hover:bg-cyan-200 shadow-md'
                  : 'bg-sf-surface border-2 border-sf-border text-sf-heading hover:bg-sf-surface-hover shadow'
              }`}
              style={{
                left: `${leftPct}%`,
                top: `${topPx}px`,
                minWidth: `${Math.max(48, tapTargetSize)}px`,
                minHeight: `${Math.max(48, tapTargetSize)}px`,
              }}
            >
              {fl.letter.toUpperCase()}
            </button>
          );
        })}

        {/* Feedback flash */}
        {feedback && (
          <div className={`absolute inset-0 flex items-center justify-center pointer-events-none ${
            feedback.type === 'correct'
              ? 'bg-cyan-400/20'
              : 'bg-red-400/20'
          }`}>
            <span className={`text-5xl font-bold ${
              feedback.type === 'correct' ? 'text-cyan-500' : 'text-red-500'
            }`}>
              {feedback.type === 'correct' ? '\u2713' : '\u2717'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SVG Icons ───────────────────────────────────────────────

function TreasureIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path d="M2 12h20v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8Z" strokeLinejoin="round" />
      <path d="M2 12l2-6h16l2 6" strokeLinejoin="round" />
      <path d="M12 12v10" />
      <circle cx="12" cy="9" r="2" />
    </svg>
  );
}
