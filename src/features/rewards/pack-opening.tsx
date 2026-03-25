// src/features/rewards/pack-opening.tsx — Pack opening animation & reveal UI

import { useState } from 'react';
import type { CompletedCreature } from '../../contracts/types';
import { themeEngine } from '../../themes';
import { CreatureArt, RarityBadge, LevelStars } from './creature-art';

interface PackOpeningProps {
  pack: CompletedCreature[];
  onDone: () => void;
}

const RARITY_GLOW: Record<string, string> = {
  common: 'rgba(107, 114, 128, 0.4)',
  uncommon: 'rgba(5, 150, 105, 0.5)',
  rare: 'rgba(37, 99, 235, 0.5)',
  epic: 'rgba(124, 58, 237, 0.6)',
  legendary: 'rgba(217, 119, 6, 0.7)',
};

export function PackOpening({ pack, onDone }: PackOpeningProps) {
  const [revealed, setRevealed] = useState<boolean[]>([false, false, false]);
  const allRevealed = revealed.every(Boolean);

  const themeId = pack[0]?.themeId ?? 'monster-lab';
  const theme = themeEngine.getTheme(themeId);
  const vfx = theme.visualEffects;

  function revealCard(index: number) {
    setRevealed((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
  }

  function revealAll() {
    setRevealed([true, true, true]);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4">
      {/* Title */}
      <div className="text-center mb-6">
        <h2
          className="text-2xl font-extrabold text-white mb-1"
          style={{ textShadow: `0 0 20px ${vfx.glowColor}` }}
        >
          Pack Opened!
        </h2>
        <p className="text-white/60 text-sm">
          {allRevealed ? 'Here are your new creatures!' : 'Tap each card to reveal'}
        </p>
      </div>

      {/* Card slots */}
      <div className="flex gap-3 mb-8">
        {pack.map((creature, i) => (
          <button
            key={creature.id}
            onClick={() => revealCard(i)}
            disabled={revealed[i]}
            className="relative transition-transform duration-300"
            style={{
              transform: revealed[i] ? 'rotateY(0deg) scale(1)' : 'rotateY(0deg) scale(0.95)',
            }}
            aria-label={revealed[i] ? `${creature.name}, ${creature.rarity}` : `Reveal card ${i + 1}`}
          >
            {revealed[i] ? (
              <RevealedCard creature={creature} />
            ) : (
              <UnrevealedCard themeId={themeId} index={i} />
            )}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {!allRevealed && (
          <button
            onClick={revealAll}
            className="px-5 py-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 text-sm font-medium transition-colors"
          >
            Reveal All
          </button>
        )}
        {allRevealed && (
          <button
            onClick={onDone}
            className="px-6 py-2.5 rounded-lg font-bold text-white text-sm transition-colors"
            style={{ background: vfx.progressGradient }}
          >
            Collect!
          </button>
        )}
      </div>
    </div>
  );
}

function RevealedCard({ creature }: { creature: CompletedCreature }) {
  const glow = RARITY_GLOW[creature.rarity] ?? RARITY_GLOW.common;

  return (
    <div
      className="w-28 sm:w-32 rounded-xl p-3 flex flex-col items-center gap-2 border"
      style={{
        background: 'linear-gradient(180deg, rgba(30,30,40,0.95) 0%, rgba(15,15,25,0.98) 100%)',
        borderColor: glow,
        boxShadow: `0 0 16px ${glow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      <CreatureArt themeId={creature.themeId} appearance={creature.appearance} size={64} />
      <p className="text-white font-bold text-xs text-center truncate w-full">{creature.name}</p>
      <RarityBadge rarity={creature.rarity} />
      <LevelStars level={creature.level} />
    </div>
  );
}

function UnrevealedCard({ themeId, index }: { themeId: string; index: number }) {
  const theme = themeEngine.getTheme(themeId);
  const vfx = theme.visualEffects;

  return (
    <div
      className="w-28 sm:w-32 h-48 sm:h-52 rounded-xl flex flex-col items-center justify-center gap-2 border border-white/10 cursor-pointer hover:border-white/30 hover:scale-105 transition-all"
      style={{
        background: vfx.gradient,
        boxShadow: `0 0 12px ${vfx.shadowColor}`,
      }}
    >
      <div className="text-4xl opacity-80">?</div>
      <p className="text-white/50 text-[10px] font-medium">Card {index + 1}</p>
    </div>
  );
}
