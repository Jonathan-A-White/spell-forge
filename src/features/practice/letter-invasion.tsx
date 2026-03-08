// src/features/practice/letter-invasion.tsx — Arcade-style alien spaceship spelling game

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

// Fixed star positions so they don't regenerate on every render
const STARS = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  left: ((i * 37 + 13) % 100),
  top: ((i * 53 + 7) % 100),
  size: (i % 3) + 1,
  delay: (i * 0.3) % 3,
}));

// ─── Space Background ───────────────────────────────────────

function SpaceBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Deep space gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 30% 20%, #0a0e2e 0%, #050816 50%, #020408 100%)',
        }}
      />
      {/* Subtle nebula glow */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: 'radial-gradient(circle at 70% 60%, rgba(88,28,135,0.4) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(30,64,175,0.3) 0%, transparent 40%)',
        }}
      />
      {/* Twinkling stars */}
      {STARS.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            backgroundColor: star.size > 2 ? '#E0E7FF' : '#94A3B8',
            animation: `sf-twinkle ${1.5 + star.delay}s ease-in-out infinite alternate`,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes sf-twinkle {
          0% { opacity: 0.3; }
          100% { opacity: 1; }
        }
        @keyframes sf-ship-hover {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-2px); }
        }
        @keyframes sf-beam-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes sf-explosion {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.8; }
          100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Alien Spaceship SVG ────────────────────────────────────

function AlienShip({ letter, isTarget, size }: { letter: string; isTarget: boolean; size: number }) {
  const shipColor = isTarget ? '#22D3EE' : '#A78BFA';
  const glowColor = isTarget ? '#06B6D4' : '#7C3AED';
  const cockpitColor = isTarget ? '#67E8F9' : '#C4B5FD';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 48 48"
        fill="none"
        className="absolute inset-0"
        style={{ animation: 'sf-ship-hover 1.5s ease-in-out infinite', filter: `drop-shadow(0 0 6px ${glowColor})` }}
      >
        {/* Tractor beam */}
        <path
          d="M16 32 L24 44 L32 32"
          fill={`${glowColor}33`}
          style={{ animation: 'sf-beam-pulse 2s ease-in-out infinite' }}
        />
        {/* Saucer body */}
        <ellipse cx="24" cy="26" rx="16" ry="6" fill={shipColor} opacity="0.9" />
        <ellipse cx="24" cy="25" rx="16" ry="6" fill={shipColor} />
        {/* Dome / cockpit */}
        <ellipse cx="24" cy="22" rx="9" ry="7" fill={cockpitColor} opacity="0.6" />
        <ellipse cx="24" cy="20" rx="6" ry="5" fill={cockpitColor} opacity="0.3" />
        {/* Port lights */}
        <circle cx="12" cy="26" r="2" fill="#FACC15" opacity="0.9">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="0.8s" repeatCount="indefinite" />
        </circle>
        <circle cx="20" cy="28" r="1.5" fill="#FB923C" opacity="0.9">
          <animate attributeName="opacity" values="1;0.4;1" dur="0.8s" repeatCount="indefinite" />
        </circle>
        <circle cx="28" cy="28" r="1.5" fill="#FB923C" opacity="0.9">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="0.8s" repeatCount="indefinite" />
        </circle>
        <circle cx="36" cy="26" r="2" fill="#FACC15" opacity="0.9">
          <animate attributeName="opacity" values="1;0.4;1" dur="0.8s" repeatCount="indefinite" />
        </circle>
      </svg>
      {/* Letter on the cockpit */}
      <span
        className="relative z-10 font-extrabold"
        style={{
          fontSize: size * 0.38,
          color: '#FFFFFF',
          textShadow: `0 0 8px ${glowColor}, 0 0 16px ${glowColor}`,
          marginTop: -4,
        }}
      >
        {letter.toUpperCase()}
      </span>
    </div>
  );
}

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
      <div className="relative flex flex-col items-center gap-6 p-6 max-w-md mx-auto min-h-[480px]">
        <SpaceBackground />

        <h2 className="relative z-10 text-2xl font-bold text-cyan-300" style={{ textShadow: '0 0 12px rgba(34,211,238,0.5)' }}>
          Alien Word Invasion
        </h2>

        <div className="relative z-10 w-full bg-slate-900/80 border border-cyan-500/30 rounded-2xl p-6 text-center space-y-4 backdrop-blur-sm">
          <InvaderIcon className="w-20 h-20 mx-auto" />

          <p className="text-cyan-100 font-medium">
            Alien spaceships are invading! Blast the right ones to spell each word!
          </p>

          <div className="text-slate-400 text-sm space-y-1">
            <p>Tap an alien ship to zap it</p>
            <p>Wrong shots drain your energy shields</p>
            <p>Defend Earth from all the waves!</p>
          </div>

          <div className="flex justify-center gap-6 pt-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-cyan-300">{gameWords.length}</p>
              <p className="text-xs text-slate-400">Waves</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setGameStarted(true)}
          className="relative z-10 w-full font-bold py-4 px-6 rounded-xl transition-all text-lg text-white"
          style={{
            minHeight: buttonSize,
            background: 'linear-gradient(135deg, #0891B2 0%, #6D28D9 100%)',
            boxShadow: '0 0 20px rgba(34,211,238,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
          }}
        >
          Launch Defense!
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
      <div className="relative flex flex-col items-center gap-6 p-6 max-w-md mx-auto min-h-[480px]">
        <SpaceBackground />

        <h2 className="relative z-10 text-2xl font-bold" style={{ color: wavesCleared === gameWords.length ? '#67E8F9' : '#FCA5A5', textShadow: '0 0 12px rgba(34,211,238,0.4)' }}>
          {wavesCleared === gameWords.length ? 'Earth is Saved!' : 'Aliens Won!'}
        </h2>

        {/* Stars */}
        <div className="relative z-10 flex gap-2">
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className="text-4xl"
              style={{
                color: i <= stars ? '#FACC15' : '#334155',
                textShadow: i <= stars ? '0 0 10px rgba(250,204,21,0.6)' : 'none',
              }}
            >
              ★
            </span>
          ))}
        </div>

        <div className="relative z-10 w-full bg-slate-900/80 border border-cyan-500/30 rounded-2xl p-6 text-center space-y-3 backdrop-blur-sm">
          <p className="text-4xl font-bold text-cyan-400" style={{ textShadow: '0 0 12px rgba(34,211,238,0.5)' }}>{totalScore}</p>
          <p className="text-slate-400 text-sm">points</p>

          <div className="flex justify-center gap-8 pt-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-cyan-300">{percentage}%</p>
              <p className="text-xs text-slate-400">Waves Cleared</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-cyan-300">
                {wavesCleared}/{gameWords.length}
              </p>
              <p className="text-xs text-slate-400">Complete</p>
            </div>
          </div>
        </div>

        {/* Word results — mission log */}
        <div className="relative z-10 w-full space-y-2">
          <h3 className="font-bold text-cyan-300 text-sm">Mission Log:</h3>
          {gameWords.map((word, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-lg border backdrop-blur-sm"
              style={{
                backgroundColor: i < wavesCleared ? 'rgba(6,182,212,0.1)' : 'rgba(51,65,85,0.3)',
                borderColor: i < wavesCleared ? 'rgba(6,182,212,0.3)' : 'rgba(51,65,85,0.4)',
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {i < wavesCleared ? '\u2713' : '\u2717'}
                </span>
                <span className={`font-medium ${
                  i < wavesCleared ? 'text-cyan-200' : 'text-slate-500'
                }`}>
                  {word}
                </span>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleFinish}
          className="relative z-10 w-full font-bold py-3 px-6 rounded-xl transition-all text-white"
          style={{
            minHeight: buttonSize,
            background: 'linear-gradient(135deg, #0891B2 0%, #6D28D9 100%)',
            boxShadow: '0 0 20px rgba(34,211,238,0.3)',
          }}
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
      <div className="relative flex flex-col items-center gap-6 p-6 max-w-md mx-auto min-h-[480px]">
        <SpaceBackground />

        <h2 className="relative z-10 text-2xl font-bold" style={{ color: wasSuccess ? '#67E8F9' : '#FCA5A5', textShadow: '0 0 12px rgba(34,211,238,0.4)' }}>
          {wasSuccess ? 'Wave Cleared!' : 'Wave Lost!'}
        </h2>

        <div className="relative z-10" style={{ width: 96, height: 96 }}>
          {wasSuccess ? (
            <svg viewBox="0 0 96 96" fill="none" className="w-full h-full">
              <circle cx="48" cy="48" r="44" fill="rgba(6,182,212,0.15)" stroke="#22D3EE" strokeWidth="3" />
              <path d="M30 48 L42 60 L66 36" stroke="#22D3EE" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 96 96" fill="none" className="w-full h-full">
              <circle cx="48" cy="48" r="44" fill="rgba(239,68,68,0.15)" stroke="#F87171" strokeWidth="3" />
              <path d="M34 34 L62 62 M62 34 L34 62" stroke="#F87171" strokeWidth="5" strokeLinecap="round" />
            </svg>
          )}
        </div>

        <p className="relative z-10 text-xl font-bold tracking-wider">
          {currentWord.split('').map((ch, i) => (
            <span
              key={i}
              style={{
                color: i < nextLetterIndex ? '#67E8F9' : '#475569',
                textShadow: i < nextLetterIndex ? '0 0 8px rgba(34,211,238,0.5)' : 'none',
              }}
            >
              {ch}
            </span>
          ))}
        </p>

        {wasSuccess && (
          <p className="relative z-10 text-cyan-400 font-medium" style={{ textShadow: '0 0 8px rgba(34,211,238,0.4)' }}>
            +{calcWaveScore(currentWord.length, shield, maxShield)} points!
          </p>
        )}

        <button
          onClick={handleNextWave}
          className="relative z-10 w-full font-bold py-3 px-6 rounded-xl transition-all text-white"
          style={{
            minHeight: buttonSize,
            background: 'linear-gradient(135deg, #0891B2 0%, #6D28D9 100%)',
            boxShadow: '0 0 20px rgba(34,211,238,0.3)',
          }}
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
    <div className="relative flex flex-col items-center gap-3 p-4 max-w-md mx-auto w-full">
      {/* Header */}
      <div className="w-full flex items-center justify-between relative z-10">
        <span className="text-sm font-medium text-cyan-400">
          Wave {currentWaveIndex + 1}/{gameWords.length}
        </span>
        <div className="flex items-center gap-1">
          {Array.from({ length: maxShield }, (_, i) => (
            <EnergyShieldIcon key={i} active={i < shield} />
          ))}
        </div>
        <span className="text-sm font-bold text-cyan-300" style={{ textShadow: '0 0 6px rgba(34,211,238,0.4)' }}>
          {totalScore} pts
        </span>
      </div>

      {/* Target word display */}
      <div className="relative z-10 w-full bg-slate-900/80 border border-cyan-500/30 rounded-xl p-3 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-1">
          {onSpeak && (
            <button
              onClick={() => onSpeak(currentWord)}
              className="mr-2 text-slate-400 hover:text-cyan-400 transition-colors"
              aria-label="Hear the word"
            >
              <SpeakerIcon />
            </button>
          )}
          {revealedLetters.map((ch, i) => (
            <span
              key={i}
              className="w-8 h-10 flex items-center justify-center rounded font-bold text-lg"
              style={{
                background: 'rgba(6,182,212,0.2)',
                border: '1px solid rgba(34,211,238,0.4)',
                color: '#67E8F9',
                textShadow: '0 0 6px rgba(34,211,238,0.5)',
              }}
            >
              {ch}
            </span>
          ))}
          {Array.from({ length: remainingSlots }, (_, i) => (
            <span
              key={`blank-${i}`}
              className="w-8 h-10 flex items-center justify-center rounded text-lg"
              style={{
                background: 'rgba(15,23,42,0.6)',
                border: '2px dashed rgba(100,116,139,0.4)',
                color: '#64748B',
              }}
            >
              ?
            </span>
          ))}
        </div>
        <p className="text-center text-xs text-slate-400 mt-2">
          Zap the letter: <span className="font-bold text-cyan-300 text-sm" style={{ textShadow: '0 0 6px rgba(34,211,238,0.5)' }}>{currentWord[nextLetterIndex]?.toUpperCase()}</span>
        </p>
      </div>

      {/* Wave progress bar */}
      <div className="relative z-10 w-full flex items-center gap-2">
        <span className="text-xs text-slate-400">Wave {currentWaveIndex + 1}</span>
        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.round((nextLetterIndex / currentWord.length) * 100)}%`,
              background: 'linear-gradient(90deg, #06B6D4, #8B5CF6)',
              boxShadow: '0 0 8px rgba(34,211,238,0.4)',
            }}
          />
        </div>
      </div>

      {/* Invasion grid — deep space arena */}
      <div
        className="w-full relative rounded-xl overflow-hidden"
        style={{
          height: `${GRID_ROWS * 52}px`,
          background: 'radial-gradient(ellipse at 50% 30%, #0a0e2e 0%, #050816 60%, #020408 100%)',
          border: '1px solid rgba(34,211,238,0.2)',
          boxShadow: 'inset 0 0 30px rgba(6,182,212,0.05)',
        }}
      >
        {/* Grid stars */}
        {STARS.slice(0, 30).map((star) => (
          <div
            key={`grid-${star.id}`}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: `${star.left}%`,
              top: `${star.top}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              backgroundColor: '#475569',
              opacity: 0.5,
            }}
          />
        ))}

        {/* Column guides — subtle laser grid */}
        {Array.from({ length: GRID_COLUMNS }, (_, col) => (
          <div
            key={`col-${col}`}
            className="absolute top-0 bottom-0"
            style={{
              left: `${((col + 1) / GRID_COLUMNS) * 100}%`,
              borderRight: '1px solid rgba(34,211,238,0.06)',
            }}
          />
        ))}

        {/* Defense line — planetary shield */}
        <div
          className="absolute left-0 right-0"
          style={{
            top: `${((GRID_ROWS - 1) / GRID_ROWS) * 100}%`,
            height: '2px',
            background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.4), rgba(139,92,246,0.4), transparent)',
            boxShadow: '0 0 8px rgba(34,211,238,0.3)',
          }}
        />

        {/* Planet surface glow at bottom */}
        <div
          className="absolute left-0 right-0 bottom-0 pointer-events-none"
          style={{
            height: `${(1 / GRID_ROWS) * 100}%`,
            background: 'linear-gradient(0deg, rgba(6,182,212,0.12) 0%, transparent 100%)',
          }}
        />

        {/* Invaders as alien spaceships */}
        {invaders.map((inv) => {
          const colWidth = 100 / GRID_COLUMNS;
          const leftPct = inv.column * colWidth + colWidth / 2;
          const topPx = inv.row * 52;
          const shipSize = Math.max(44, tapTargetSize);

          return (
            <button
              key={inv.id}
              onClick={() => handleShootInvader(inv)}
              className="absolute flex items-center justify-center transition-all active:scale-75"
              style={{
                left: `${leftPct}%`,
                top: `${topPx}px`,
                width: `${shipSize}px`,
                height: `${shipSize}px`,
                marginLeft: `${-shipSize / 2}px`,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
              aria-label={`Shoot letter ${inv.letter.toUpperCase()}`}
            >
              <AlienShip letter={inv.letter} isTarget={inv.isTarget} size={shipSize} />
            </button>
          );
        })}

        {/* Feedback flash */}
        {feedback && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{
              background: feedback.type === 'hit'
                ? 'radial-gradient(circle, rgba(34,211,238,0.3) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(239,68,68,0.3) 0%, transparent 70%)',
            }}
          >
            <span
              className="text-5xl font-bold"
              style={{
                color: feedback.type === 'hit' ? '#22D3EE' : '#F87171',
                textShadow: feedback.type === 'hit'
                  ? '0 0 20px rgba(34,211,238,0.8)'
                  : '0 0 20px rgba(239,68,68,0.8)',
                animation: 'sf-explosion 0.5s ease-out',
              }}
            >
              {feedback.type === 'hit' ? '\u2713' : '\u2717'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SVG Icons ───────────────────────────────────────────────

function EnergyShieldIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="22" height="22" fill="none">
      <path
        d="M10 2 L17 6 L17 12 C17 16 10 19 10 19 C10 19 3 16 3 12 L3 6 Z"
        fill={active ? 'rgba(34,211,238,0.3)' : 'rgba(51,65,85,0.3)'}
        stroke={active ? '#22D3EE' : '#475569'}
        strokeWidth="1.5"
      />
      {active && (
        <path
          d="M10 5 L14 7.5 L14 12 C14 14.5 10 16.5 10 16.5"
          fill="rgba(34,211,238,0.15)"
          stroke="none"
        />
      )}
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

export function InvaderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className}>
      {/* Tractor beam */}
      <path d="M20 40 L32 58 L44 40" fill="rgba(34,211,238,0.15)">
        <animate attributeName="opacity" values="0.1;0.3;0.1" dur="2s" repeatCount="indefinite" />
      </path>
      {/* Saucer body */}
      <ellipse cx="32" cy="32" rx="22" ry="8" fill="#0E7490" />
      <ellipse cx="32" cy="30" rx="22" ry="8" fill="#22D3EE" opacity="0.8" />
      {/* Dome */}
      <ellipse cx="32" cy="26" rx="12" ry="10" fill="#67E8F9" opacity="0.5" />
      <ellipse cx="32" cy="23" rx="8" ry="7" fill="#A5F3FC" opacity="0.3" />
      {/* Port lights */}
      <circle cx="14" cy="31" r="2.5" fill="#FACC15">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="0.7s" repeatCount="indefinite" />
      </circle>
      <circle cx="24" cy="34" r="2" fill="#FB923C">
        <animate attributeName="opacity" values="1;0.4;1" dur="0.7s" repeatCount="indefinite" />
      </circle>
      <circle cx="40" cy="34" r="2" fill="#FB923C">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="0.7s" repeatCount="indefinite" />
      </circle>
      <circle cx="50" cy="31" r="2.5" fill="#FACC15">
        <animate attributeName="opacity" values="1;0.4;1" dur="0.7s" repeatCount="indefinite" />
      </circle>
      {/* Alien eyes on dome */}
      <ellipse cx="27" cy="22" rx="3" ry="4" fill="#0F172A" opacity="0.7" />
      <ellipse cx="37" cy="22" rx="3" ry="4" fill="#0F172A" opacity="0.7" />
      <ellipse cx="27" cy="21" rx="1.5" ry="2" fill="#22D3EE" />
      <ellipse cx="37" cy="21" rx="1.5" ry="2" fill="#22D3EE" />
    </svg>
  );
}
