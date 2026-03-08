// src/features/rewards/monster-stable.tsx — Full Monster Stable / Collection view

import type { Profile, CompletedCreature } from '../../contracts/types';
import { themeEngine } from '../../themes';

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

function getThemeIcon(themeId: string): string {
  return THEME_ICONS[themeId] ?? '\u{1F9EA}';
}

export function MonsterStable({ profile, collection, onBack }: MonsterStableProps) {
  // Sort newest first
  const sorted = [...collection].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
  );

  // Group by theme
  const byTheme = new Map<string, CompletedCreature[]>();
  for (const creature of sorted) {
    const list = byTheme.get(creature.themeId) ?? [];
    list.push(creature);
    byTheme.set(creature.themeId, list);
  }

  return (
    <div className="min-h-screen bg-sf-bg">
      {/* Header */}
      <div className="bg-sf-surface border-b border-sf-border px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
            aria-label="Back to home"
          >
            <BackIcon />
          </button>
          <div>
            <h1 className="text-xl font-bold text-sf-heading">Monster Stable</h1>
            <p className="text-sm text-sf-muted">
              {collection.length} creature{collection.length !== 1 ? 's' : ''} collected
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Empty state */}
        {collection.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">{getThemeIcon(profile.themeId)}</div>
            <h2 className="text-lg font-bold text-sf-heading mb-2">No creatures yet!</h2>
            <p className="text-sf-muted text-sm max-w-xs mx-auto">
              Keep practicing to fill up your creature's progress bar. Once it's complete, your creature will be added here!
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
              <div className="grid grid-cols-2 gap-3">
                {creatures.map((creature) => (
                  <CreatureCard key={creature.id} creature={creature} themeId={themeId} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CreatureCard({ creature, themeId }: { creature: CompletedCreature; themeId: string }) {
  const theme = themeEngine.getTheme(themeId);
  const completedDate = new Date(creature.completedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="bg-sf-surface border border-sf-border rounded-xl p-4 hover:border-sf-border-strong transition-colors">
      <div className="text-center">
        <div className="text-3xl mb-2">{getThemeIcon(themeId)}</div>
        <p className="font-bold text-sf-heading text-sm truncate">{creature.name}</p>
        <p className="text-[10px] text-sf-muted mt-1">{theme.name}</p>
        <div className="flex items-center justify-center gap-1.5 mt-2">
          <span className="text-[10px] text-sf-faint">{completedDate}</span>
          <span className="text-sf-faint">·</span>
          <span className="text-[10px] text-sf-faint">
            {creature.totalBlocksUsed} {theme.rewardMechanic.unitName}
          </span>
        </div>
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
