// src/features/practice/word-relay-race.tsx — Timed spelling relay race game

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { shuffle } from '../../core/shuffle';
import { calcRunnerPosition, formatTime, calcStumbleDelay, calcStarRating } from './relay-race-logic';

// ─── Types ───────────────────────────────────────────────────

export interface RelayRaceResults {
  totalWords: number;
  wordsCorrect: number;
  totalTimeMs: number;
  bestTimeMs: number | null;
  isNewBest: boolean;
  wordTimes: WordTime[];
}

interface WordTime {
  word: string;
  correct: boolean;
  timeMs: number;
  stumbled: boolean;
}

export interface RelayRaceSavedState {
  words: string[];
  currentIndex: number;
  wordTimes: WordTime[];
  elapsedMs: number;
  bestTimeMs: number | null;
}

interface WordRelayRaceProps {
  words: string[];
  onComplete: (results: RelayRaceResults) => void;
  onSpeak?: (word: string) => void;
  tapTargetSize: number;
  savedState?: RelayRaceSavedState;
  onProgress?: (state: RelayRaceSavedState) => void;
}

// ─── Component ───────────────────────────────────────────────

export function WordRelayRace({
  words,
  onComplete,
  onSpeak,
  tapTargetSize,
  savedState,
  onProgress,
}: WordRelayRaceProps) {
  const raceWords = useMemo(() => {
    if (savedState) return savedState.words;
    return shuffle(words);
  }, [words, savedState]);

  const [currentIndex, setCurrentIndex] = useState(savedState?.currentIndex ?? 0);
  const [wordTimes, setWordTimes] = useState<WordTime[]>(savedState?.wordTimes ?? []);
  const bestTimeMs = savedState?.bestTimeMs ?? null;
  const [inputValue, setInputValue] = useState('');
  const [stumbling, setStumbling] = useState(false);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [raceStarted, setRaceStarted] = useState(!!savedState);
  const [raceStartTime, setRaceStartTime] = useState<number | null>(
    savedState ? Date.now() - (savedState.elapsedMs ?? 0) : null,
  );
  const [wordStartTime, setWordStartTime] = useState<number | null>(
    savedState ? Date.now() : null,
  );
  const [elapsedMs, setElapsedMs] = useState(savedState?.elapsedMs ?? 0);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const onProgressRef = useRef(onProgress);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  // Save progress when wordTimes change
  useEffect(() => {
    if (wordTimes.length > 0) {
      onProgressRef.current?.({
        words: raceWords,
        currentIndex,
        wordTimes,
        elapsedMs,
        bestTimeMs,
      });
    }
  }, [wordTimes, currentIndex, raceWords, elapsedMs, bestTimeMs]);

  // Timer tick
  useEffect(() => {
    if (!raceStarted || raceStartTime === null) return;

    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - raceStartTime);
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [raceStarted, raceStartTime]);

  const isFinished = currentIndex >= raceWords.length && raceStarted;

  const currentWord = raceWords[currentIndex] ?? null;
  const runnerPos = calcRunnerPosition(currentIndex, raceWords.length);

  // Countdown then start
  const handleStartRace = useCallback(() => {
    setCountdownValue(3);
    let count = 3;
    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdownValue(count);
      } else {
        clearInterval(interval);
        setCountdownValue(null);
        setRaceStarted(true);
        const now = Date.now();
        setRaceStartTime(now);
        setWordStartTime(now);
        // Focus the input after countdown
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }, 700);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!currentWord || stumbling || !wordStartTime) return;

    const answer = inputValue.trim().toLowerCase();
    if (!answer) return;

    const correct = answer === currentWord.toLowerCase();
    const timeMs = Date.now() - wordStartTime;

    const wordTime: WordTime = {
      word: currentWord,
      correct,
      timeMs,
      stumbled: !correct,
    };

    setLastCorrect(correct);

    if (correct) {
      // Advance immediately
      const newTimes = [...wordTimes, wordTime];
      setWordTimes(newTimes);
      setCurrentIndex((prev) => prev + 1);
      setInputValue('');
      setWordStartTime(Date.now());
      setLastCorrect(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      // Stumble — brief delay, then let them try again
      setStumbling(true);
      const delay = calcStumbleDelay(currentWord.length);

      const newTimes = [...wordTimes, wordTime];
      setWordTimes(newTimes);

      setTimeout(() => {
        setStumbling(false);
        setInputValue('');
        setLastCorrect(null);
        setCurrentIndex((prev) => prev + 1);
        setWordStartTime(Date.now());
        setTimeout(() => inputRef.current?.focus(), 50);
      }, delay);
    }
  }, [currentWord, inputValue, stumbling, wordStartTime, wordTimes]);

  // Finish handler
  const handleFinish = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const totalTimeMs = raceStartTime ? Date.now() - raceStartTime : elapsedMs;
    const wordsCorrect = wordTimes.filter((wt) => wt.correct).length;
    const isNewBest = bestTimeMs === null || totalTimeMs < bestTimeMs;

    const results: RelayRaceResults = {
      totalWords: raceWords.length,
      wordsCorrect,
      totalTimeMs,
      bestTimeMs,
      isNewBest: wordsCorrect === raceWords.length && isNewBest,
      wordTimes,
    };

    onComplete(results);
  }, [raceStartTime, elapsedMs, wordTimes, bestTimeMs, raceWords.length, onComplete]);

  // Auto-finish when race completes
  useEffect(() => {
    if (isFinished && timerRef.current) {
      clearInterval(timerRef.current);
      if (raceStartTime) {
        setElapsedMs(Date.now() - raceStartTime);
      }
    }
  }, [isFinished, raceStartTime]);

  const buttonSize = `${tapTargetSize}px`;

  // ─── Pre-race start screen ─────────────────────────────────

  if (!raceStarted && countdownValue === null) {
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-sf-heading">Word Relay Race</h2>

        <div className="w-full bg-sf-surface border border-sf-border rounded-2xl p-6 text-center space-y-4">
          <RunnerIcon className="w-16 h-16 mx-auto text-emerald-500" />

          <p className="text-sf-text font-medium">
            Spell each word as fast as you can to race to the finish!
          </p>

          <div className="text-sf-muted text-sm space-y-1">
            <p>Correct spelling = full speed ahead</p>
            <p>Wrong spelling = stumble and lose time</p>
            <p>Beat your best time for bonus stars!</p>
          </div>

          <div className="flex justify-center gap-6 pt-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-sf-heading">{raceWords.length}</p>
              <p className="text-xs text-sf-muted">Words</p>
            </div>
            {bestTimeMs !== null && (
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-500">{formatTime(bestTimeMs)}</p>
                <p className="text-xs text-sf-muted">Best Time</p>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleStartRace}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 px-6 rounded-xl transition-colors text-lg"
          style={{ minHeight: buttonSize }}
        >
          Start Race!
        </button>
      </div>
    );
  }

  // ─── Countdown ─────────────────────────────────────────────

  if (countdownValue !== null) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-6 min-h-[60vh]">
        <p className="text-sf-muted text-lg font-medium">Get ready...</p>
        <div className="w-32 h-32 rounded-full bg-emerald-500 flex items-center justify-center animate-pulse">
          <span className="text-6xl font-bold text-white">{countdownValue}</span>
        </div>
      </div>
    );
  }

  // ─── Results screen ────────────────────────────────────────

  if (isFinished) {
    const wordsCorrect = wordTimes.filter((wt) => wt.correct).length;
    const totalTimeMs = elapsedMs;
    const isNewBest = wordsCorrect === raceWords.length && (bestTimeMs === null || totalTimeMs < bestTimeMs);
    const stars = calcStarRating(wordsCorrect, raceWords.length, isNewBest);
    const accuracy = Math.round((wordsCorrect / raceWords.length) * 100);

    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-sf-heading">Race Complete!</h2>

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

        {/* Time display */}
        <div className="w-full bg-sf-surface border border-sf-border rounded-2xl p-6 text-center space-y-3">
          <p className="text-4xl font-bold text-sf-heading">{formatTime(totalTimeMs)}</p>

          {isNewBest && (
            <p className="text-emerald-500 font-bold text-lg">New Personal Best!</p>
          )}

          {bestTimeMs !== null && !isNewBest && (
            <p className="text-sf-muted text-sm">
              Best time: {formatTime(bestTimeMs)}
            </p>
          )}

          <div className="flex justify-center gap-8 pt-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-sf-heading">{accuracy}%</p>
              <p className="text-xs text-sf-muted">Accuracy</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-sf-heading">
                {wordsCorrect}/{raceWords.length}
              </p>
              <p className="text-xs text-sf-muted">Correct</p>
            </div>
          </div>
        </div>

        {/* Word breakdown */}
        <div className="w-full space-y-2">
          <h3 className="font-bold text-sf-heading text-sm">Race Breakdown:</h3>
          {wordTimes.map((wt, i) => (
            <div
              key={i}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                wt.correct
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{wt.correct ? '\u2713' : '\u2717'}</span>
                <span className={`font-medium ${wt.correct ? 'text-green-800' : 'text-red-800'}`}>
                  {wt.word}
                </span>
              </div>
              <span className="text-sf-muted text-sm">{formatTime(wt.timeMs)}</span>
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

  // ─── Active race ───────────────────────────────────────────

  return (
    <div className="flex flex-col items-center gap-4 p-6 max-w-md mx-auto w-full">
      {/* Header with timer */}
      <div className="w-full flex items-center justify-between">
        <h2 className="text-lg font-bold text-sf-heading">Word Relay Race</h2>
        <div className="text-right">
          <p className="text-2xl font-mono font-bold text-sf-heading">{formatTime(elapsedMs)}</p>
          {bestTimeMs !== null && (
            <p className="text-xs text-sf-muted">Best: {formatTime(bestTimeMs)}</p>
          )}
        </div>
      </div>

      {/* Track visualization */}
      <div className="w-full relative">
        {/* Track background */}
        <div className="w-full h-10 bg-sf-surface border border-sf-border rounded-full relative overflow-hidden">
          {/* Track segments */}
          <div className="absolute inset-0 flex">
            {raceWords.map((_, i) => (
              <div
                key={i}
                className={`flex-1 border-r border-sf-border last:border-r-0 ${
                  i < currentIndex ? 'bg-emerald-100' : ''
                }`}
              />
            ))}
          </div>

          {/* Runner */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 transition-all duration-300 ${
              stumbling ? 'animate-bounce' : ''
            }`}
            style={{ left: `calc(${Math.min(runnerPos, 95)}% - 12px)` }}
          >
            <span className="text-2xl" role="img" aria-label="runner">
              {stumbling ? '😵' : '🏃'}
            </span>
          </div>

          {/* Finish flag */}
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <span className="text-xl" role="img" aria-label="finish">🏁</span>
          </div>
        </div>

        {/* Progress text */}
        <div className="flex justify-between text-xs text-sf-muted mt-1">
          <span>Word {currentIndex + 1} of {raceWords.length}</span>
          <span>{runnerPos}%</span>
        </div>
      </div>

      {/* Current word prompt */}
      {currentWord && (
        <div className="w-full text-center space-y-3">
          {/* Hear the word button */}
          {onSpeak && (
            <button
              onClick={() => onSpeak(currentWord)}
              className="text-sf-heading hover:text-sf-text font-bold text-lg transition-colors"
              aria-label="Hear the word"
            >
              Hear the word
            </button>
          )}

          <p className="text-sf-muted text-sm">
            Type the correct spelling:
          </p>

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            disabled={stumbling}
            placeholder={stumbling ? 'Stumbled! Wait...' : 'Type spelling...'}
            className={`w-full p-3 rounded-xl border-2 font-medium text-center text-lg focus:outline-none focus:ring-2 transition-all ${
              stumbling
                ? 'border-red-400 bg-red-50 text-red-400 focus:ring-red-300'
                : lastCorrect === false
                  ? 'border-red-400 bg-sf-surface text-sf-heading focus:ring-red-300'
                  : 'border-sf-border-strong bg-sf-surface text-sf-heading focus:ring-sf-primary/50'
            }`}
            style={{ minHeight: buttonSize }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />

          {/* Feedback flash */}
          {stumbling && (
            <p className="text-red-500 font-medium animate-pulse">
              Stumbled! Keep going...
            </p>
          )}
        </div>
      )}

      {/* Submit button */}
      {!stumbling && (
        <button
          onClick={handleSubmit}
          disabled={!inputValue.trim()}
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ minHeight: buttonSize }}
        >
          Go!
        </button>
      )}
    </div>
  );
}

// ─── SVG Icons ───────────────────────────────────────────────

function RunnerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <circle cx="12" cy="4" r="2.5" />
      <path d="M7 21l3-7 2 2 4-6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 14l-3 1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 10l2-1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
