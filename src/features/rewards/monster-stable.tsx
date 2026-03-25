// src/features/rewards/monster-stable.tsx — Full Collection view for all themes

import type { Profile, CompletedCreature } from '../../contracts/types';
import { themeEngine } from '../../themes';
import { CreatureArt, RarityBadge, LevelStars } from './creature-art';

interface MonsterStableProps {
  profile: Profile;
  collection: CompletedCreature[];
  onBack: () => void;
}

const THEME_ICONS: Record<string, string> = {
  'dragon-forge': '\u{1F409}',   // dragon
  'monster-lab': '\u{1F9EA}',    // test tube
  'star-trail': '\u{2B50}',      // star
};

const COLLECTION_NAMES: Record<string, string> = {
  'dragon-forge': 'Dragon Lair',
  'monster-lab': 'Monster Stable',
  'star-trail': 'Star Atlas',
};

function getThemeIcon(themeId: string): string {
  return THEME_ICONS[themeId] ?? '\u{1F9EA}';
}

function getCollectionName(themeId: string): string {
  return COLLECTION_NAMES[themeId] ?? 'Collection';
}

const RARITY_SORT_ORDER: Record<string, number> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  uncommon: 3,
  common: 4,
};

export function MonsterStable({ profile, collection, onBack }: MonsterStableProps) {
  // Sort by rarity (best first), then newest
  const sorted = [...collection].sort((a, b) => {
    const rarityDiff = (RARITY_SORT_ORDER[a.rarity] ?? 5) - (RARITY_SORT_ORDER[b.rarity] ?? 5);
    if (rarityDiff !== 0) return rarityDiff;
    return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
  });

  // Group by theme
  const byTheme = new Map<string, CompletedCreature[]>();
  for (const creature of sorted) {
    const list = byTheme.get(creature.themeId) ?? [];
    list.push(creature);
    byTheme.set(creature.themeId, list);
  }

  const activeTheme = themeEngine.getTheme(profile.themeId);
  const vfx = activeTheme.visualEffects;
  const collectionName = getCollectionName(profile.themeId);

  // Stats
  const rarityCount = (r: string) => collection.filter((c) => c.rarity === r).length;

  return (
    <div className="min-h-screen bg-sf-bg">
      {/* Header */}
      <div
        className="bg-sf-surface border-b border-sf-border px-4 py-4"
        style={{ boxShadow: `0 2px 12px ${vfx.shadowColor}` }}
      >
        <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
            aria-label="Back to home"
          >
            <BackIcon />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl">{getThemeIcon(profile.themeId)}</span>
            <div>
              <h1 className="text-xl font-bold text-sf-heading">{collectionName}</h1>
              <p className="text-sm text-sf-muted">
                {collection.length} card{collection.length !== 1 ? 's' : ''} collected
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto px-4 py-6">
        {/* Collection stats */}
        {collection.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {(['legendary', 'epic', 'rare', 'uncommon', 'common'] as const).map((r) => {
              const count = rarityCount(r);
              if (count === 0) return null;
              return (
                <div key={r} className="flex items-center gap-1.5 bg-sf-surface border border-sf-border rounded-lg px-2.5 py-1.5">
                  <RarityBadge rarity={r} />
                  <span className="text-xs text-sf-muted font-medium">{count}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {collection.length === 0 && (
          <div className="text-center py-16">
            <div
              className="text-6xl mb-4"
              style={{ filter: `drop-shadow(0 0 12px ${vfx.glowColor})` }}
            >
              {getThemeIcon(profile.themeId)}
            </div>
            <h2 className="text-lg font-bold text-sf-heading mb-2">No cards yet!</h2>
            <p className="text-sf-muted text-sm max-w-xs mx-auto">
              Keep practicing to fill up your progress bar. When it's complete, you'll open a pack of 3 cards!
            </p>
          </div>
        )}

        {/* Collection grid, grouped by theme */}
        {[...byTheme.entries()].map(([themeId, creatures]) => {
          const theme = themeEngine.getTheme(themeId);
          return (
            <div key={themeId} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{getThemeIcon(themeId)}</span>
                <h2 className="text-sm font-bold text-sf-heading">{theme.name}</h2>
                <span className="text-xs text-sf-muted">({creatures.length})</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {creatures.map((creature) => (
                  <CreatureCard key={creature.id} creature={creature} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RARITY_GLOW: Record<string, string> = {
  common: 'rgba(107, 114, 128, 0.2)',
  uncommon: 'rgba(5, 150, 105, 0.25)',
  rare: 'rgba(37, 99, 235, 0.3)',
  epic: 'rgba(124, 58, 237, 0.35)',
  legendary: 'rgba(217, 119, 6, 0.4)',
};

const RARITY_BORDER: Record<string, string> = {
  common: 'rgba(107, 114, 128, 0.3)',
  uncommon: 'rgba(5, 150, 105, 0.4)',
  rare: 'rgba(37, 99, 235, 0.5)',
  epic: 'rgba(124, 58, 237, 0.5)',
  legendary: 'rgba(217, 119, 6, 0.6)',
};

function CreatureCard({ creature }: { creature: CompletedCreature }) {
  const glow = RARITY_GLOW[creature.rarity] ?? RARITY_GLOW.common;
  const border = RARITY_BORDER[creature.rarity] ?? RARITY_BORDER.common;
  const completedDate = new Date(creature.completedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className="bg-sf-surface rounded-xl p-3 hover:scale-[1.02] transition-transform"
      style={{
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: border,
        boxShadow: `0 0 10px ${glow}`,
      }}
    >
      <div className="flex flex-col items-center gap-1.5">
        {/* Creature art */}
        <CreatureArt themeId={creature.themeId} appearance={creature.appearance} size={72} />

        {/* Name */}
        <p className="font-bold text-sf-heading text-sm text-center truncate w-full">
          {creature.name}
        </p>

        {/* Rarity + Level */}
        <div className="flex items-center gap-2">
          <RarityBadge rarity={creature.rarity} />
        </div>
        <LevelStars level={creature.level} />

        {/* Date */}
        <span className="text-[10px] text-sf-faint">{completedDate}</span>
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}
