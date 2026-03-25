// src/features/practice/word-relay-race.tsx — Timed spelling relay race with bot opponents & themed visuals

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { shuffle } from '../../core/shuffle';
import {
  calcRunnerPosition,
  formatTime,
  calcStumbleDelay,
  calcStarRating,
  createBotRacers,
  getBotProgress,
  getTrackThemeStyle,
  getPlayerAvatar,
  getPlacementLabel,
  getPlacementEmoji,
  type RaceDifficulty,
  type BotRacer,
} from './relay-race-logic';
import { SpellingField } from './custom-keyboard';
import { hapticSuccess, hapticError } from '../../core/haptics';

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
  difficulty?: RaceDifficulty;
}

interface WordRelayRaceProps {
  words: string[];
  onComplete: (results: RelayRaceResults) => void;
  onSpeak?: (word: string) => void;
  audioBusy?: boolean;
  tapTargetSize: number;
  savedState?: RelayRaceSavedState;
  onProgress?: (state: RelayRaceSavedState) => void;
  themeId?: string;
}

// ─── Component ───────────────────────────────────────────────

export function WordRelayRace({
  words,
  onComplete,
  onSpeak,
  audioBusy,
  tapTargetSize,
  savedState,
  onProgress,
  themeId = 'dragon-forge',
}: WordRelayRaceProps) {
  // Difficulty selection state
  const [difficulty, setDifficulty] = useState<RaceDifficulty | null>(
    savedState?.difficulty ?? null,
  );

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

  // Bot racers
  const [bots, setBots] = useState<BotRacer[]>([]);

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
        difficulty: difficulty ?? undefined,
      });
    }
  }, [wordTimes, currentIndex, raceWords, elapsedMs, bestTimeMs, difficulty]);

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

  const trackStyle = getTrackThemeStyle(themeId);
  const playerAvatar = getPlayerAvatar(themeId);

  // Countdown then start
  const handleStartRace = useCallback(() => {
    if (!difficulty) return;
    // Create bot racers
    const newBots = createBotRacers(raceWords.length, difficulty, themeId);
    setBots(newBots);

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
      }
    }, 700);
  }, [difficulty, raceWords.length, themeId]);

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
      hapticSuccess();
      const newTimes = [...wordTimes, wordTime];
      setWordTimes(newTimes);
      setCurrentIndex((prev) => prev + 1);
      setInputValue('');
      setWordStartTime(Date.now());
      setLastCorrect(null);
    } else {
      hapticError();
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

  // Calculate player placement
  const getPlayerPlacement = (): number => {
    const playerWords = currentIndex;
    let place = 1;
    for (const bot of bots) {
      const botWords = getBotProgress(bot, elapsedMs);
      if (botWords > playerWords) place++;
    }
    return place;
  };

  // ─── Difficulty selection screen ──────────────────────────

  if (difficulty === null) {
    return (
      <div className={`min-h-[80vh] relative overflow-hidden rounded-2xl ${trackStyle.wallpaperGradient}`}>
        {/* Decorative seam lines */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="absolute top-0 bottom-0 left-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
          <div className="absolute top-0 bottom-0 right-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
          {/* Diagonal seam pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.5) 20px, rgba(255,255,255,0.5) 21px)',
          }} />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-6 p-6 max-w-md md:max-w-3xl lg:max-w-5xl mx-auto">
          <h2 className={`text-3xl font-black tracking-tight ${trackStyle.headerGlow}`}>
            Word Relay Race
          </h2>

          <p className="text-white/70 text-center text-sm">
            Race against opponents! Spell words fast to cross the finish line first.
          </p>

          <div className="w-full space-y-3">
            <DifficultyOption
              title="Rookie Race"
              description="Slower opponent, more stumbles — great for warming up"
              emoji="🐢"
              color="from-green-600/40 to-emerald-700/40"
              border="border-green-500/50"
              onClick={() => setDifficulty('easy')}
              tapTargetSize={tapTargetSize}
            />
            <DifficultyOption
              title="Champion Circuit"
              description="Balanced opponent speed — a fair challenge"
              emoji="🐎"
              color="from-yellow-600/40 to-amber-700/40"
              border="border-yellow-500/50"
              onClick={() => setDifficulty('medium')}
              tapTargetSize={tapTargetSize}
            />
            <DifficultyOption
              title="Grand Prix"
              description="Lightning-fast opponent with few mistakes — for experts only!"
              emoji="🐆"
              color="from-red-600/40 to-rose-700/40"
              border="border-red-500/50"
              onClick={() => setDifficulty('hard')}
              tapTargetSize={tapTargetSize}
            />
          </div>
        </div>
      </div>
    );
  }

  // ─── Pre-race start screen ────────────────────────────────

  if (!raceStarted && countdownValue === null) {
    const diffLabel = difficulty === 'easy' ? 'Rookie Race' : difficulty === 'medium' ? 'Champion Circuit' : 'Grand Prix';

    return (
      <div className={`min-h-[80vh] relative overflow-hidden rounded-2xl ${trackStyle.wallpaperGradient}`}>
        <WallpaperSeams />

        <div className="relative z-10 flex flex-col items-center gap-6 p-6 max-w-md md:max-w-3xl lg:max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <h2 className={`text-2xl font-black ${trackStyle.headerGlow}`}>Word Relay Race</h2>
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-white/10 text-white/80 border border-white/20">
              {diffLabel}
            </span>
          </div>

          <div className="w-full bg-black/30 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center space-y-4">
            <div className="text-5xl">{playerAvatar}</div>

            <p className="text-white font-medium">
              Spell each word as fast as you can to race to the finish!
            </p>

            <div className="text-white/60 text-sm space-y-1">
              <p>Correct spelling = full speed ahead</p>
              <p>Wrong spelling = stumble and lose time</p>
              <p>Beat the opponent to win!</p>
            </div>

            <div className="flex justify-center gap-6 pt-2">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{raceWords.length}</p>
                <p className="text-xs text-white/50">Words</p>
              </div>
              {bestTimeMs !== null && (
                <div className="text-center">
                  <p className={`text-2xl font-bold ${trackStyle.headerGlow}`}>{formatTime(bestTimeMs)}</p>
                  <p className="text-xs text-white/50">Best Time</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-2xl font-bold text-white">1</p>
                <p className="text-xs text-white/50">Opponent</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 w-full">
            <button
              onClick={() => setDifficulty(null)}
              className="px-4 py-3 rounded-xl font-bold text-white/70 bg-white/10 hover:bg-white/20 transition-colors border border-white/10"
              style={{ minHeight: buttonSize }}
            >
              Back
            </button>
            <button
              onClick={handleStartRace}
              className="flex-1 font-black py-4 px-6 rounded-xl transition-all text-lg text-white border border-white/20"
              style={{
                minHeight: buttonSize,
                background: `linear-gradient(135deg, ${trackStyle.accentColor}cc, ${trackStyle.accentColor}88)`,
              }}
            >
              Start Race!
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Countdown ────────────────────────────────────────────

  if (countdownValue !== null) {
    return (
      <div className={`min-h-[80vh] relative overflow-hidden rounded-2xl ${trackStyle.wallpaperGradient} flex flex-col items-center justify-center gap-4 p-6`}>
        <WallpaperSeams />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <p className="text-white/70 text-lg font-medium">Get ready...</p>
          <div
            className="w-32 h-32 rounded-full flex items-center justify-center animate-pulse"
            style={{ background: `linear-gradient(135deg, ${trackStyle.accentColor}cc, ${trackStyle.accentColor}66)` }}
          >
            <span className="text-6xl font-black text-white">{countdownValue}</span>
          </div>
          <div className="flex gap-6 text-3xl mt-4">
            <span>{playerAvatar}</span>
            <span className="text-white/40">vs</span>
            {bots.map((bot, i) => (
              <span key={i}>{bot.themeAvatars[themeId] ?? bot.avatar}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Results screen ───────────────────────────────────────

  if (isFinished) {
    const wordsCorrect = wordTimes.filter((wt) => wt.correct).length;
    const totalTimeMs = elapsedMs;
    const isNewBest = wordsCorrect === raceWords.length && (bestTimeMs === null || totalTimeMs < bestTimeMs);
    const stars = calcStarRating(wordsCorrect, raceWords.length, isNewBest);
    const accuracy = Math.round((wordsCorrect / raceWords.length) * 100);
    const placement = getPlayerPlacement();

    return (
      <div className={`min-h-[80vh] relative overflow-hidden rounded-2xl ${trackStyle.wallpaperGradient}`}>
        <WallpaperSeams />

        <div className="relative z-10 flex flex-col items-center gap-5 p-6 max-w-md md:max-w-3xl lg:max-w-5xl mx-auto">
          {/* Placement banner */}
          <div className="text-center space-y-1">
            <span className="text-6xl">{getPlacementEmoji(placement)}</span>
            <h2 className={`text-3xl font-black ${placement === 1 ? 'text-yellow-400' : 'text-white'}`}>
              {getPlacementLabel(placement)}
            </h2>
          </div>

          {/* Stars */}
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                className={`text-4xl transition-all ${i <= stars ? 'text-yellow-400 scale-110' : 'text-white/20'}`}
              >
                ★
              </span>
            ))}
          </div>

          {/* Time display */}
          <div className="w-full bg-black/30 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center space-y-3">
            <p className={`text-4xl font-black ${trackStyle.headerGlow}`}>{formatTime(totalTimeMs)}</p>

            {isNewBest && (
              <p className="text-yellow-400 font-bold text-lg animate-pulse">New Personal Best!</p>
            )}

            {bestTimeMs !== null && !isNewBest && (
              <p className="text-white/50 text-sm">
                Best time: {formatTime(bestTimeMs)}
              </p>
            )}

            {/* Race results */}
            <div className="flex justify-center gap-8 pt-2">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{accuracy}%</p>
                <p className="text-xs text-white/50">Accuracy</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">
                  {wordsCorrect}/{raceWords.length}
                </p>
                <p className="text-xs text-white/50">Correct</p>
              </div>
            </div>

            {/* Bot results */}
            <div className="border-t border-white/10 pt-3 mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{playerAvatar}</span>
                  <span className="text-white font-medium">You</span>
                </div>
                <span className={`font-bold ${placement === 1 ? 'text-yellow-400' : 'text-white/70'}`}>
                  {formatTime(totalTimeMs)}
                </span>
              </div>
              {bots.map((bot, i) => {
                const botFinishTime = bot.schedule[bot.schedule.length - 1] ?? 0;
                const botPlace = botFinishTime < totalTimeMs ? 1 : 2;
                return (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{bot.themeAvatars[themeId] ?? bot.avatar}</span>
                      <span className="text-white/70">{bot.name}</span>
                    </div>
                    <span className={`font-bold ${botPlace === 1 ? 'text-yellow-400' : 'text-white/50'}`}>
                      {formatTime(botFinishTime)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Word breakdown */}
          <div className="w-full space-y-2">
            <h3 className="font-bold text-white/80 text-sm">Race Breakdown:</h3>
            {wordTimes.map((wt, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-3 rounded-lg border backdrop-blur-sm ${
                  wt.correct
                    ? 'bg-green-500/10 border-green-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{wt.correct ? '✓' : '✗'}</span>
                  <span className={`font-medium ${wt.correct ? 'text-green-400' : 'text-red-400'}`}>
                    {wt.word}
                  </span>
                </div>
                <span className="text-white/50 text-sm">{formatTime(wt.timeMs)}</span>
              </div>
            ))}
          </div>

          <button
            onClick={handleFinish}
            className="w-full font-black py-3 px-6 rounded-xl transition-all text-white border border-white/20"
            style={{
              minHeight: buttonSize,
              background: `linear-gradient(135deg, ${trackStyle.accentColor}cc, ${trackStyle.accentColor}88)`,
            }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ─── Active race ──────────────────────────────────────────

  const placement = getPlayerPlacement();

  return (
    <div className={`min-h-[70vh] relative overflow-hidden rounded-2xl ${trackStyle.wallpaperGradient}`}>
      <WallpaperSeams />

      <div className="relative z-10 flex flex-col items-center gap-3 p-4 max-w-md md:max-w-3xl lg:max-w-5xl mx-auto w-full">
        {/* Header with timer */}
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className={`text-lg font-black ${trackStyle.headerGlow}`}>Race</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              placement === 1
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              {placement === 1 ? 'Leading!' : `${getPlacementLabel(placement)}`}
            </span>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-mono font-black ${trackStyle.headerGlow}`}>{formatTime(elapsedMs)}</p>
            {bestTimeMs !== null && (
              <p className="text-xs text-white/40">Best: {formatTime(bestTimeMs)}</p>
            )}
          </div>
        </div>

        {/* Multi-lane track */}
        <div className="w-full space-y-1.5">
          {/* Player lane */}
          <RaceLane
            label="You"
            avatar={playerAvatar}
            position={runnerPos}
            stumbling={stumbling}
            trackStyle={trackStyle}
            isPlayer
            wordsCompleted={currentIndex}
            totalWords={raceWords.length}
          />

          {/* Bot lanes */}
          {bots.map((bot, i) => {
            const botProgress = getBotProgress(bot, elapsedMs);
            const botPos = calcRunnerPosition(botProgress, raceWords.length);
            const botAvatar = bot.themeAvatars[themeId] ?? bot.avatar;
            return (
              <RaceLane
                key={i}
                label={bot.name}
                avatar={botAvatar}
                position={botPos}
                stumbling={false}
                trackStyle={trackStyle}
                isPlayer={false}
                wordsCompleted={botProgress}
                totalWords={raceWords.length}
              />
            );
          })}
        </div>

        {/* Progress text */}
        <div className="flex justify-between w-full text-xs text-white/40">
          <span>Word {currentIndex + 1} of {raceWords.length}</span>
          <span>{runnerPos}%</span>
        </div>

        {/* Current word prompt */}
        {currentWord && (
          <div className="w-full text-center space-y-3">
            {onSpeak && (
              <button
                onClick={() => onSpeak(currentWord)}
                disabled={audioBusy}
                className={`font-bold text-lg transition-colors ${
                  audioBusy
                    ? 'opacity-50 cursor-not-allowed text-white/30'
                    : `${trackStyle.headerGlow} hover:text-white`
                }`}
                aria-label="Hear the word"
              >
                Hear the word
              </button>
            )}

            <p className="text-white/50 text-sm">
              Type the correct spelling:
            </p>

            <SpellingField
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              disabled={stumbling}
              placeholder={stumbling ? 'Stumbled! Wait...' : 'Type spelling...'}
              tapTargetSize={tapTargetSize}
              submitLabel="Go!"
              ariaLabel="Type the spelling word"
              displayClassName={
                stumbling
                  ? 'border-red-400 bg-red-500/10 text-red-400'
                  : lastCorrect === false
                    ? 'border-red-400'
                    : undefined
              }
            />

            {stumbling && (
              <p className="text-red-400 font-medium animate-pulse">
                Stumbled! Keep going...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

/** Decorative wallpaper seam lines */
function WallpaperSeams() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Border seams */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="absolute top-0 bottom-0 left-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
      <div className="absolute top-0 bottom-0 right-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
      {/* Diamond lattice pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.5) 20px, rgba(255,255,255,0.5) 21px), repeating-linear-gradient(-45deg, transparent, transparent 20px, rgba(255,255,255,0.5) 20px, rgba(255,255,255,0.5) 21px)',
      }} />
      {/* Horizontal seam accents */}
      <div className="absolute top-1/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      <div className="absolute top-2/3 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

/** Individual race lane showing a runner on a track */
function RaceLane({
  label,
  avatar,
  position,
  stumbling,
  trackStyle,
  isPlayer,
  wordsCompleted,
  totalWords,
}: {
  label: string;
  avatar: string;
  position: number;
  stumbling: boolean;
  trackStyle: ReturnType<typeof getTrackThemeStyle>;
  isPlayer: boolean;
  wordsCompleted: number;
  totalWords: number;
}) {
  return (
    <div className={`flex items-center gap-2 ${isPlayer ? '' : 'opacity-80'}`}>
      {/* Label */}
      <div className="w-14 text-right">
        <p className={`text-xs font-bold truncate ${isPlayer ? 'text-white' : 'text-white/60'}`}>
          {label}
        </p>
      </div>

      {/* Track */}
      <div className={`flex-1 h-10 relative rounded-full overflow-hidden border ${trackStyle.trackBorder} ${trackStyle.trackBg}`}>
        {/* Progress fill */}
        <div
          className={`absolute inset-y-0 left-0 ${trackStyle.progressFill} transition-all duration-300`}
          style={{ width: `${position}%` }}
        />

        {/* Track segments (dashed lane markings) */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: totalWords }, (_, i) => (
            <div
              key={i}
              className={`flex-1 border-r ${trackStyle.laneDivider} last:border-r-0`}
            />
          ))}
        </div>

        {/* Runner */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 transition-all duration-300 ${
            stumbling ? 'animate-bounce' : ''
          }`}
          style={{ left: `calc(${Math.min(position, 93)}% - 12px)` }}
        >
          <span className={`text-2xl ${stumbling ? 'grayscale' : ''}`} role="img" aria-label={label}>
            {stumbling ? '😵' : avatar}
          </span>
        </div>

        {/* Finish flag */}
        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          <span className="text-lg" role="img" aria-label="finish">🏁</span>
        </div>
      </div>

      {/* Word count */}
      <div className="w-10 text-left">
        <span className="text-xs text-white/40">{wordsCompleted}/{totalWords}</span>
      </div>
    </div>
  );
}

/** Difficulty selection card */
function DifficultyOption({
  title,
  description,
  emoji,
  color,
  border,
  onClick,
  tapTargetSize,
}: {
  title: string;
  description: string;
  emoji: string;
  color: string;
  border: string;
  onClick: () => void;
  tapTargetSize: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 p-4 rounded-xl border backdrop-blur-sm transition-all hover:scale-[1.02] active:scale-[0.98] bg-gradient-to-r ${color} ${border}`}
      style={{ minHeight: `${tapTargetSize}px` }}
    >
      <span className="text-3xl">{emoji}</span>
      <div className="text-left flex-1">
        <p className="text-white font-bold text-lg">{title}</p>
        <p className="text-white/60 text-sm">{description}</p>
      </div>
      <span className="text-white/40 text-xl">›</span>
    </button>
  );
}

// ─── SVG Icons ──────────────────────────────────────────────

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

// Re-export RunnerIcon for use in practice-games
export { RunnerIcon };
