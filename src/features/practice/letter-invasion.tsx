// src/features/practice/letter-invasion.tsx — Arcade-style letter shooting spelling game

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { shuffle } from '../../core/shuffle';
import {
  createWaveConfig,
  spawnInvader,
  checkShot,
  calcWaveScore,
  calcStartingShield,
  calcInvasionStars,
  calcMaxPossibleScore,
  type Invader,
} from './letter-invasion-logic';

// ─── Types ───────────────────────────────────────────────────

export interface LetterInvasionResults {
  totalWords: number;
  wavesCleared: number;
  totalScore: number;
  maxPossibleScore: number;
}

export interface LetterInvasionSavedState {
  words: string[];
  currentWaveIndex: number;
  wavesCleared: number;
  totalScore: number;
  nextLetterIndex: number;
  shield: number;
}

interface LetterInvasionProps {
  words: string[];
  onComplete: (results: LetterInvasionResults) => void;
  onSpeak?: (word: string) => void;
  tapTargetSize: number;
  savedState?: LetterInvasionSavedState;
  onProgress?: (state: LetterInvasionSavedState) => void;
}

const GRID_COLUMNS = 5;
const GRID_ROWS = 7;
const TICK_MS = 700;

// ─── Component ───────────────────────────────────────────────

export function LetterInvasion({
  words,
  onComplete,
  onSpeak,
  tapTargetSize,
  savedState,
  onProgress,
}: LetterInvasionProps) {
  const gameWords = useMemo(() => {
    if (savedState) return savedState.words;
    return shuffle(words).slice(0, 10);
  }, [words, savedState]);

  const [currentWaveIndex, setCurrentWaveIndex] = useState(savedState?.currentWaveIndex ?? 0);
  const [wavesCleared, setWavesCleared] = useState(savedState?.wavesCleared ?? 0);
  const [totalScore, setTotalScore] = useState(savedState?.totalScore ?? 0);
  const [nextLetterIndex, setNextLetterIndex] = useState(savedState?.nextLetterIndex ?? 0);
  const [shield, setShield] = useState(
    savedState?.shield ?? calcStartingShield(gameWords[0]?.length ?? 3),
  );
  const [invaders, setInvaders] = useState<Invader[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'hit' | 'miss'; letter: string } | null>(null);
  const [gameStarted, setGameStarted] = useState(!!savedState);
  const [waveComplete, setWaveComplete] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  const currentWord = gameWords[currentWaveIndex] ?? '';

  const invaderCounterRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onProgressRef = useRef(onProgress);
  const spawnsSinceTargetRef = useRef(0);
  const nextLetterIndexRef = useRef(nextLetterIndex);
  const currentWordRef = useRef(currentWord);

  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => { nextLetterIndexRef.current = nextLetterIndex; }, [nextLetterIndex]);
  useEffect(() => { currentWordRef.current = currentWord; }, [currentWord]);
  const maxShield = calcStartingShield(currentWord.length);
  const isFinished = currentWaveIndex >= gameWords.length || gameOver;
  const waveConfig = useMemo(
    () => createWaveConfig(currentWord, currentWaveIndex, GRID_COLUMNS),
    [currentWord, currentWaveIndex],
  );

  // Save progress
  useEffect(() => {
    if (gameStarted && !isFinished) {
      onProgressRef.current?.({
        words: gameWords,
        currentWaveIndex,
        wavesCleared,
        totalScore,
        nextLetterIndex,
        shield,
      });
    }
  }, [gameStarted, isFinished, gameWords, currentWaveIndex, wavesCleared, totalScore, nextLetterIndex, shield]);

  // Spawn invaders
  useEffect(() => {
    if (!gameStarted || isFinished || waveComplete) return;

    const spawn = () => {
      const id = invaderCounterRef.current++;
      // Force a target letter every 3rd spawn to guarantee the player gets enough chances
      const forceTarget = spawnsSinceTargetRef.current >= 2;
      const invader = spawnInvader(waveConfig, nextLetterIndex, id, forceTarget);
      const targetLetter = currentWordRef.current[nextLetterIndexRef.current]?.toLowerCase();
      if (invader.letter.toLowerCase() === targetLetter) {
        spawnsSinceTargetRef.current = 0;
      } else {
        spawnsSinceTargetRef.current++;
      }
      setInvaders((prev) => [...prev, invader]);
    };

    spawn();
    spawnRef.current = setInterval(spawn, TICK_MS * waveConfig.spawnIntervalTicks);
    return () => {
      if (spawnRef.current) clearInterval(spawnRef.current);
    };
  }, [gameStarted, isFinished, waveComplete, waveConfig, nextLetterIndex]);

  // Tick: advance invaders downward, check for breaches
  useEffect(() => {
    if (!gameStarted || isFinished || waveComplete) return;

    tickRef.current = setInterval(() => {
      setInvaders((prev) => {
        const advanced = prev.map((inv) => ({ ...inv, row: inv.row + inv.speed }));
        // Check if any invader reached the bottom
        const breached = advanced.filter((inv) => inv.row >= GRID_ROWS);
        // Only penalize for target letter breaches — distractors pass harmlessly
        const targetLetter = currentWordRef.current[nextLetterIndexRef.current]?.toLowerCase();
        const targetBreaches = breached.filter(
          (inv) => inv.letter.toLowerCase() === targetLetter,
        );
        if (targetBreaches.length > 0) {
          setShield((s) => {
            const newShield = s - targetBreaches.length;
            if (newShield <= 0) {
              setGameOver(true);
            }
            return Math.max(newShield, 0);
          });
        }
        return advanced.filter((inv) => inv.row < GRID_ROWS);
      });
    }, TICK_MS);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [gameStarted, isFinished, waveComplete]);

  const handleShootInvader = useCallback(
    (invader: Invader) => {
      if (waveComplete || isFinished) return;

      const result = checkShot(invader.letter, currentWord, nextLetterIndex);

      // Remove shot invader
      setInvaders((prev) => prev.filter((inv) => inv.id !== invader.id));

      if (result.correct) {
        setFeedback({ type: 'hit', letter: invader.letter });
        const newIndex = nextLetterIndex + 1;
        setNextLetterIndex(newIndex);

        // Check if wave (word) is complete
        if (newIndex >= currentWord.length) {
          const score = calcWaveScore(currentWord.length, shield, maxShield);
          setTotalScore((prev) => prev + score);
          setWavesCleared((prev) => prev + 1);
          setWaveComplete(true);
          setInvaders([]);
        }
      } else {
        setFeedback({ type: 'miss', letter: invader.letter });
        setShield((s) => {
          const newShield = s - 1;
          if (newShield <= 0) {
            setWaveComplete(true);
            setInvaders([]);
          }
          return Math.max(newShield, 0);
        });
      }

      setTimeout(() => setFeedback(null), 500);
    },
    [waveComplete, isFinished, currentWord, nextLetterIndex, shield, maxShield],
  );

  const handleNextWave = useCallback(() => {
    const nextIdx = currentWaveIndex + 1;
    if (nextIdx >= gameWords.length) {
      setGameOver(true);
      return;
    }
    setCurrentWaveIndex(nextIdx);
    setNextLetterIndex(0);
    setShield(calcStartingShield(gameWords[nextIdx].length));
    setWaveComplete(false);
    setInvaders([]);
    setFeedback(null);
    spawnsSinceTargetRef.current = 0;
  }, [currentWaveIndex, gameWords]);

  const handleFinish = useCallback(() => {
    const maxScore = calcMaxPossibleScore(gameWords);
    onComplete({
      totalWords: gameWords.length,
      wavesCleared,
      totalScore,
      maxPossibleScore: maxScore,
    });
  }, [gameWords, wavesCleared, totalScore, onComplete]);

  const buttonSize = `${tapTargetSize}px`;

  // ─── Start screen ──────────────────────────────────────────

  if (!gameStarted) {
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-sf-heading">Letter Invasion</h2>

        <div className="w-full bg-sf-surface border border-sf-border rounded-2xl p-6 text-center space-y-4">
          <InvaderIcon className="w-16 h-16 mx-auto text-green-500" />

          <p className="text-sf-text font-medium">
            Alien letters are invading! Shoot the right ones to spell each word!
          </p>

          <div className="text-sf-muted text-sm space-y-1">
            <p>Tap the correct letter to blast it</p>
            <p>Wrong shots and breaches drain your shield</p>
            <p>Clear all waves to defend the base!</p>
          </div>

          <div className="flex justify-center gap-6 pt-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-sf-heading">{gameWords.length}</p>
              <p className="text-xs text-sf-muted">Waves</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setGameStarted(true)}
          className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-xl transition-colors text-lg"
          style={{ minHeight: buttonSize }}
        >
          Defend the Base!
        </button>
      </div>
    );
  }

  // ─── Results screen ────────────────────────────────────────

  if (isFinished) {
    const maxScore = calcMaxPossibleScore(gameWords);
    const stars = calcInvasionStars(wavesCleared, gameWords.length, totalScore, maxScore);
    const percentage = Math.round((wavesCleared / gameWords.length) * 100);

    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-sf-heading">
          {wavesCleared === gameWords.length ? 'Base Defended!' : 'Base Overrun!'}
        </h2>

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
          <p className="text-4xl font-bold text-green-500">{totalScore}</p>
          <p className="text-sf-muted text-sm">points</p>

          <div className="flex justify-center gap-8 pt-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-sf-heading">{percentage}%</p>
              <p className="text-xs text-sf-muted">Waves Cleared</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-sf-heading">
                {wavesCleared}/{gameWords.length}
              </p>
              <p className="text-xs text-sf-muted">Complete</p>
            </div>
          </div>
        </div>

        {/* Word results */}
        <div className="w-full space-y-2">
          <h3 className="font-bold text-sf-heading text-sm">Battle Log:</h3>
          {gameWords.map((word, i) => (
            <div
              key={i}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                i < wavesCleared
                  ? 'bg-green-50 border-green-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {i < wavesCleared ? '\u2713' : '\u2717'}
                </span>
                <span className={`font-medium ${
                  i < wavesCleared ? 'text-green-800' : 'text-gray-500'
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

  // ─── Wave complete interstitial ────────────────────────────

  if (waveComplete) {
    const wasSuccess = nextLetterIndex >= currentWord.length;
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-sf-heading">
          {wasSuccess ? 'Wave Cleared!' : 'Wave Lost!'}
        </h2>

        <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 ${
          wasSuccess ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'
        }`}>
          <span className="text-4xl">{wasSuccess ? '🛡️' : '💥'}</span>
        </div>

        <p className="text-sf-heading text-xl font-bold tracking-wider">
          {currentWord.split('').map((ch, i) => (
            <span
              key={i}
              className={
                i < nextLetterIndex
                  ? 'text-green-500'
                  : 'text-gray-300'
              }
            >
              {ch}
            </span>
          ))}
        </p>

        {wasSuccess && (
          <p className="text-green-500 font-medium">
            +{calcWaveScore(currentWord.length, shield, maxShield)} points!
          </p>
        )}

        <button
          onClick={handleNextWave}
          className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-xl transition-colors"
          style={{ minHeight: buttonSize }}
        >
          {currentWaveIndex + 1 < gameWords.length ? 'Next Wave' : 'See Results'}
        </button>
      </div>
    );
  }

  // ─── Active game ───────────────────────────────────────────

  const revealedLetters = currentWord.slice(0, nextLetterIndex).split('');
  const remainingSlots = currentWord.length - nextLetterIndex;

  return (
    <div className="flex flex-col items-center gap-3 p-4 max-w-md mx-auto w-full">
      {/* Header */}
      <div className="w-full flex items-center justify-between">
        <span className="text-sm font-medium text-sf-muted">
          Wave {currentWaveIndex + 1}/{gameWords.length}
        </span>
        <div className="flex items-center gap-1">
          {Array.from({ length: maxShield }, (_, i) => (
            <span
              key={i}
              className={`text-lg ${i < shield ? 'text-green-400' : 'text-gray-300'}`}
            >
              🛡️
            </span>
          ))}
        </div>
        <span className="text-sm font-bold text-green-500">{totalScore} pts</span>
      </div>

      {/* Target word display */}
      <div className="w-full bg-sf-surface border border-sf-border rounded-xl p-3">
        <div className="flex items-center justify-center gap-1">
          {onSpeak && (
            <button
              onClick={() => onSpeak(currentWord)}
              className="mr-2 text-sf-muted hover:text-green-500 transition-colors"
              aria-label="Hear the word"
            >
              🔊
            </button>
          )}
          {revealedLetters.map((ch, i) => (
            <span key={i} className="w-8 h-10 flex items-center justify-center bg-green-100 border border-green-300 rounded font-bold text-green-700 text-lg">
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
          Shoot the letter: <span className="font-bold text-green-500 text-sm">{currentWord[nextLetterIndex]?.toUpperCase()}</span>
        </p>
      </div>

      {/* Wave progress bar */}
      <div className="w-full flex items-center gap-2">
        <span className="text-xs text-sf-muted">Wave {currentWaveIndex + 1}</span>
        <div className="flex-1 h-1.5 bg-sf-border rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.round((nextLetterIndex / currentWord.length) * 100)}%` }}
          />
        </div>
      </div>

      {/* Invasion grid */}
      <div
        className="w-full relative rounded-xl overflow-hidden border border-sf-border"
        style={{
          height: `${GRID_ROWS * 52}px`,
          background: `linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(34,197,94,0.08) 60%, rgba(34,197,94,0.15) 100%)`,
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

        {/* Defense line */}
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-green-300/50"
          style={{ top: `${((GRID_ROWS - 1) / GRID_ROWS) * 100}%` }}
        />

        {/* Invaders */}
        {invaders.map((inv) => {
          const colWidth = 100 / GRID_COLUMNS;
          const leftPct = inv.column * colWidth + colWidth / 2;
          const topPx = inv.row * 52;

          return (
            <button
              key={inv.id}
              onClick={() => handleShootInvader(inv)}
              className={`absolute w-11 h-11 -ml-5.5 rounded-lg font-bold text-lg flex items-center justify-center transition-all active:scale-75 ${
                inv.isTarget
                  ? 'bg-green-100 border-2 border-green-400 text-green-700 hover:bg-green-200 shadow-md shadow-green-200/50'
                  : 'bg-sf-surface border-2 border-sf-border text-sf-heading hover:bg-red-50 hover:border-red-300 shadow'
              }`}
              style={{
                left: `${leftPct}%`,
                top: `${topPx}px`,
                minWidth: `${Math.max(44, tapTargetSize)}px`,
                minHeight: `${Math.max(44, tapTargetSize)}px`,
              }}
            >
              {inv.letter.toUpperCase()}
            </button>
          );
        })}

        {/* Feedback flash */}
        {feedback && (
          <div className={`absolute inset-0 flex items-center justify-center pointer-events-none ${
            feedback.type === 'hit'
              ? 'bg-green-400/20'
              : 'bg-red-400/20'
          }`}>
            <span className={`text-5xl font-bold ${
              feedback.type === 'hit' ? 'text-green-500' : 'text-red-500'
            }`}>
              {feedback.type === 'hit' ? '\u2713' : '\u2717'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SVG Icons ───────────────────────────────────────────────

export function InvaderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <rect x="6" y="4" width="12" height="10" rx="2" />
      <circle cx="9" cy="9" r="1.5" fill="currentColor" />
      <circle cx="15" cy="9" r="1.5" fill="currentColor" />
      <path d="M4 14l2-2M20 14l-2-2" strokeLinecap="round" />
      <path d="M8 14v4M16 14v4" strokeLinecap="round" />
      <path d="M6 18h4M14 18h4" strokeLinecap="round" />
      <path d="M10 11h4" strokeLinecap="round" />
    </svg>
  );
}
