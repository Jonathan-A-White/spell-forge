// src/features/practice/word-volcano.tsx — Eruption Builder spelling game

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { shuffle } from '../../core/shuffle';
import {
  createLetterTiles,
  checkWordBuilt,
  calcVolcanoWordScore,
  calcLavaFill,
  getEruptionLevel,
  calcVolcanoStars,
  calcMaxPossibleScore,
  type VolcanoLetter,
} from './word-volcano-logic';

// ─── Types ───────────────────────────────────────────────────

export interface WordVolcanoResults {
  totalWords: number;
  wordsCompleted: number;
  totalScore: number;
  maxPossibleScore: number;
}

export interface WordVolcanoSavedState {
  words: string[];
  currentWordIndex: number;
  wordsCompleted: number;
  totalScore: number;
  mistakes: number;
  hintsUsed: number;
}

interface WordVolcanoProps {
  words: string[];
  onComplete: (results: WordVolcanoResults) => void;
  onSpeak?: (word: string) => void;
  tapTargetSize: number;
  savedState?: WordVolcanoSavedState;
  onProgress?: (state: WordVolcanoSavedState) => void;
}

// ─── Component ───────────────────────────────────────────────

export function WordVolcano({
  words,
  onComplete,
  onSpeak,
  tapTargetSize,
  savedState,
  onProgress,
}: WordVolcanoProps) {
  const gameWords = useMemo(() => {
    if (savedState) return savedState.words;
    return shuffle(words).slice(0, 10);
  }, [words, savedState]);

  const [currentWordIndex, setCurrentWordIndex] = useState(savedState?.currentWordIndex ?? 0);
  const [wordsCompleted, setWordsCompleted] = useState(savedState?.wordsCompleted ?? 0);
  const [totalScore, setTotalScore] = useState(savedState?.totalScore ?? 0);
  const [mistakes, setMistakes] = useState(savedState?.mistakes ?? 0);
  const [hintsUsed, setHintsUsed] = useState(savedState?.hintsUsed ?? 0);
  const [gameStarted, setGameStarted] = useState(!!savedState);
  const [wordComplete, setWordComplete] = useState(false);
  const [wordFailed, setWordFailed] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  // Letter selection state — tiles are derived from the current word index
  const [placedTileIds, setPlacedTileIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [wordMistakes, setWordMistakes] = useState(0);
  const [wordHints, setWordHints] = useState(0);
  const [hintRevealed, setHintRevealed] = useState<number | null>(null);

  const onProgressRef = useRef(onProgress);
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);

  const currentWord = gameWords[currentWordIndex] ?? '';
  const isFinished = currentWordIndex >= gameWords.length || gameOver;
  const eruptionLevel = getEruptionLevel(wordsCompleted);
  const lavaFill = calcLavaFill(wordsCompleted, gameWords.length);
  const maxMistakesPerWord = 3;

  // Generate base tiles only when the word changes (randomness lives here)
  const baseTiles = useMemo(
    () => createLetterTiles(currentWord, currentWordIndex),
    [currentWord, currentWordIndex],
  );

  // Apply placed status separately so tile order stays stable
  const tiles = useMemo(
    () => baseTiles.map((t) => ({
      ...t,
      placed: placedTileIds.has(t.id),
    })),
    [baseTiles, placedTileIds],
  );

  // Save progress
  useEffect(() => {
    if (gameStarted && !isFinished) {
      onProgressRef.current?.({
        words: gameWords,
        currentWordIndex,
        wordsCompleted,
        totalScore,
        mistakes,
        hintsUsed,
      });
    }
  }, [gameStarted, isFinished, gameWords, currentWordIndex, wordsCompleted, totalScore, mistakes, hintsUsed]);

  const handleSelectTile = useCallback((tile: VolcanoLetter) => {
    if (wordComplete || wordFailed || isFinished) return;

    const nextIndex = selected.length;
    const expectedLetter = currentWord[nextIndex]?.toLowerCase();

    if (tile.letter.toLowerCase() === expectedLetter) {
      // Correct letter
      const newSelected = [...selected, tile.letter];
      setSelected(newSelected);
      setPlacedTileIds((prev) => new Set([...prev, tile.id]));

      // Check if word is complete
      if (checkWordBuilt(newSelected, currentWord)) {
        const score = calcVolcanoWordScore(currentWord.length, wordMistakes, wordHints);
        setTotalScore((prev) => prev + score);
        setWordsCompleted((prev) => prev + 1);
        setWordComplete(true);
        setFeedback('correct');
        setTimeout(() => setFeedback(null), 800);
      }
    } else {
      // Wrong letter
      setFeedback('wrong');
      setWordMistakes((prev) => prev + 1);
      setMistakes((prev) => prev + 1);
      setTimeout(() => setFeedback(null), 500);

      if (wordMistakes + 1 >= maxMistakesPerWord) {
        setWordFailed(true);
      }
    }
  }, [wordComplete, wordFailed, isFinished, selected, currentWord, wordMistakes, wordHints]);

  const handleUseHint = useCallback(() => {
    if (wordComplete || wordFailed || isFinished) return;
    const nextIndex = selected.length;
    if (nextIndex >= currentWord.length) return;

    setHintRevealed(nextIndex);
    setWordHints((prev) => prev + 1);
    setHintsUsed((prev) => prev + 1);
    setTimeout(() => setHintRevealed(null), 1500);
  }, [wordComplete, wordFailed, isFinished, selected.length, currentWord]);

  const handleNextWord = useCallback(() => {
    const nextIdx = currentWordIndex + 1;
    if (nextIdx >= gameWords.length) {
      setGameOver(true);
      return;
    }
    setCurrentWordIndex(nextIdx);
    setWordComplete(false);
    setWordFailed(false);
    setPlacedTileIds(new Set());
    setSelected([]);
    setFeedback(null);
    setWordMistakes(0);
    setWordHints(0);
    setHintRevealed(null);
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
        <h2 className="text-2xl font-bold text-sf-heading">Word Volcano</h2>

        <div className="w-full bg-sf-surface border border-sf-border rounded-2xl p-6 text-center space-y-4">
          <VolcanoIcon className="w-16 h-16 mx-auto text-orange-500" />

          <p className="text-sf-text font-medium">
            Build words letter by letter to make the volcano erupt!
          </p>

          <div className="text-sf-muted text-sm space-y-1">
            <p>Tap letters in the right order to spell each word</p>
            <p>Wrong letters shake the ground — 3 mistakes and the word crumbles</p>
            <p>Complete words to fill the volcano with lava!</p>
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
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 px-6 rounded-xl transition-colors text-lg"
          style={{ minHeight: buttonSize }}
        >
          Start Building!
        </button>
      </div>
    );
  }

  // ─── Results screen ────────────────────────────────────────

  if (isFinished) {
    const maxScore = calcMaxPossibleScore(gameWords);
    const stars = calcVolcanoStars(wordsCompleted, gameWords.length, totalScore, maxScore);
    const percentage = Math.round((wordsCompleted / gameWords.length) * 100);

    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-sf-heading">
          {eruptionLevel.level >= 4 ? 'Eruption Complete!' : 'Volcano Cooled Down!'}
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
          <p className="text-4xl font-bold text-orange-500">{totalScore}</p>
          <p className="text-sf-muted text-sm">points</p>

          <div className="flex justify-center gap-8 pt-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-sf-heading">{percentage}%</p>
              <p className="text-xs text-sf-muted">Words Built</p>
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
              Eruption level: {eruptionLevel.label}
            </p>
          </div>
        </div>

        {/* Word results */}
        <div className="w-full space-y-2">
          <h3 className="font-bold text-sf-heading text-sm">Eruption Log:</h3>
          {gameWords.map((word, i) => (
            <div
              key={i}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                i < wordsCompleted
                  ? 'bg-orange-50 border-orange-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {i < wordsCompleted ? '\u2713' : '\u2717'}
                </span>
                <span className={`font-medium ${
                  i < wordsCompleted ? 'text-orange-800' : 'text-gray-500'
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

  // ─── Word complete / failed interstitial ───────────────────

  if (wordComplete || wordFailed) {
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-sf-heading">
          {wordComplete ? 'Word Built!' : 'Word Crumbled!'}
        </h2>

        <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 ${
          wordComplete ? 'border-orange-400 bg-orange-50' : 'border-gray-400 bg-gray-50'
        }`}>
          <span className="text-4xl">{wordComplete ? '🌋' : '🪨'}</span>
        </div>

        <p className="text-sf-heading text-xl font-bold tracking-wider">
          {currentWord.split('').map((ch, i) => (
            <span
              key={i}
              className={
                i < selected.length
                  ? 'text-orange-500'
                  : 'text-gray-300'
              }
            >
              {ch}
            </span>
          ))}
        </p>

        {wordComplete && (
          <p className="text-orange-500 font-medium">
            +{calcVolcanoWordScore(currentWord.length, wordMistakes, wordHints)} points!
          </p>
        )}

        <button
          onClick={handleNextWord}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-xl transition-colors"
          style={{ minHeight: buttonSize }}
        >
          {currentWordIndex + 1 < gameWords.length ? 'Next Word' : 'See Results'}
        </button>
      </div>
    );
  }

  // ─── Active game ───────────────────────────────────────────

  return (
    <div className="flex flex-col items-center gap-3 p-4 max-w-md mx-auto w-full">
      {/* Header */}
      <div className="w-full flex items-center justify-between">
        <span className="text-sm font-medium text-sf-muted">
          Word {currentWordIndex + 1}/{gameWords.length}
        </span>
        <span className={`text-sm font-bold text-${eruptionLevel.color}-500`}>
          {eruptionLevel.label}
        </span>
        <span className="text-sm font-bold text-orange-500">{totalScore} pts</span>
      </div>

      {/* Volcano visual */}
      <div className="w-full relative h-20 rounded-xl overflow-hidden border border-sf-border bg-gradient-to-t from-orange-100 to-sf-surface">
        <div
          className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-red-500 via-orange-400 to-yellow-300 transition-all duration-700"
          style={{ height: `${lavaFill}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-sf-heading drop-shadow-sm">
            🌋 {lavaFill}%
          </span>
        </div>
      </div>

      {/* Mistakes indicator */}
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center gap-1">
          {Array.from({ length: maxMistakesPerWord }, (_, i) => (
            <span
              key={i}
              className={`text-lg ${i < (maxMistakesPerWord - wordMistakes) ? 'text-red-400' : 'text-gray-300'}`}
            >
              ♥
            </span>
          ))}
        </div>
        <button
          onClick={handleUseHint}
          className="text-sm text-sf-muted hover:text-orange-500 transition-colors underline"
        >
          Hint
        </button>
      </div>

      {/* Target word display */}
      <div className="w-full bg-sf-surface border border-sf-border rounded-xl p-3">
        <div className="flex items-center justify-center gap-1">
          {onSpeak && (
            <button
              onClick={() => onSpeak(currentWord)}
              className="mr-2 text-sf-muted hover:text-orange-500 transition-colors"
              aria-label="Hear the word"
            >
              🔊
            </button>
          )}
          {currentWord.split('').map((ch, i) => {
            const isPlaced = i < selected.length;
            const isHinted = hintRevealed === i;
            return (
              <span
                key={i}
                className={`w-8 h-10 flex items-center justify-center rounded font-bold text-lg ${
                  isPlaced
                    ? 'bg-orange-100 border border-orange-300 text-orange-700'
                    : isHinted
                      ? 'bg-yellow-100 border border-yellow-400 text-yellow-700 animate-pulse'
                      : 'bg-sf-surface border-2 border-dashed border-sf-border text-sf-muted'
                }`}
              >
                {isPlaced ? selected[i] : isHinted ? ch : '?'}
              </span>
            );
          })}
        </div>
        <p className="text-center text-xs text-sf-muted mt-2">
          Next letter: <span className="font-bold text-orange-500 text-sm">
            {currentWord[selected.length]?.toUpperCase() ?? ''}
          </span>
        </p>
      </div>

      {/* Letter tiles */}
      <div className="w-full grid grid-cols-4 gap-2 mt-2">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            onClick={() => !tile.placed && handleSelectTile(tile)}
            disabled={tile.placed}
            className={`h-14 rounded-xl font-bold text-xl flex items-center justify-center transition-all active:scale-90 ${
              tile.placed
                ? 'bg-gray-100 border-2 border-gray-200 text-gray-300 cursor-default'
                : 'bg-sf-surface border-2 border-sf-border text-sf-heading hover:bg-orange-50 hover:border-orange-300 shadow'
            }`}
            style={{
              minWidth: `${Math.max(48, tapTargetSize)}px`,
              minHeight: `${Math.max(48, tapTargetSize)}px`,
            }}
          >
            {tile.letter.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Feedback flash */}
      {feedback && (
        <div className={`text-center text-2xl font-bold ${
          feedback === 'correct' ? 'text-green-500' : 'text-red-500'
        }`}>
          {feedback === 'correct' ? '\u2713 Built!' : '\u2717 Try again!'}
        </div>
      )}
    </div>
  );
}

// ─── SVG Icons ───────────────────────────────────────────────

export function VolcanoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path d="M2 22L8 8h8l6 14H2z" strokeLinejoin="round" />
      <path d="M10 8l-1-3h6l-1 3" strokeLinejoin="round" />
      <path d="M12 2v1M9 3l1 2M15 3l-1 2" strokeLinecap="round" />
      <path d="M8 14c1-2 3-1 4-3s3 1 4 3" strokeLinecap="round" />
    </svg>
  );
}
