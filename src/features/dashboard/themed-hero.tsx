// src/features/dashboard/themed-hero.tsx — Theme-aware hero banner with mascot and milestone progress

import { themeEngine } from '../../themes';
import { rewardTracker } from '../rewards';

interface ThemedHeroProps {
  profileId: string;
  themeId: string;
}

/** Theme-specific mascot SVG icons */
function DragonMascot({ milestone }: { milestone: string }) {
  const isEgg = milestone === 'Egg';
  const isBaby = milestone === 'Baby Dragon' || milestone === 'Hatching';
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full" aria-hidden="true">
      {isEgg ? (
        <>
          <ellipse cx="32" cy="38" rx="16" ry="20" fill="currentColor" opacity="0.3" />
          <ellipse cx="32" cy="38" rx="14" ry="18" fill="currentColor" opacity="0.5" />
          <path d="M26 30 Q32 24 38 30" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.6" />
        </>
      ) : (
        <>
          <ellipse cx="32" cy="42" rx={isBaby ? 12 : 14} ry={isBaby ? 14 : 16} fill="currentColor" opacity="0.3" />
          <circle cx="32" cy={isBaby ? 24 : 22} r={isBaby ? 8 : 10} fill="currentColor" opacity="0.4" />
          <circle cx="28" cy={isBaby ? 22 : 20} r="2" fill="currentColor" opacity="0.8" />
          <circle cx="36" cy={isBaby ? 22 : 20} r="2" fill="currentColor" opacity="0.8" />
          {!isBaby && (
            <>
              <path d="M18 28 Q14 18 22 22" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.4" />
              <path d="M46 28 Q50 18 42 22" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.4" />
            </>
          )}
        </>
      )}
    </svg>
  );
}

function MonsterMascot({ milestone }: { milestone: string }) {
  const isBlueprint = milestone === 'Blueprint';
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full" aria-hidden="true">
      {isBlueprint ? (
        <>
          <rect x="18" y="16" width="28" height="36" rx="4" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" strokeDasharray="4 2" />
          <circle cx="32" cy="28" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
          <line x1="24" y1="40" x2="40" y2="40" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        </>
      ) : (
        <>
          <rect x="20" y="18" width="24" height="30" rx="6" fill="currentColor" opacity="0.3" />
          <circle cx="27" cy="28" r="3" fill="currentColor" opacity="0.7" />
          <circle cx="37" cy="28" r="3" fill="currentColor" opacity="0.7" />
          <path d="M26 36 Q32 42 38 36" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.5" />
          <rect x="16" y="26" width="6" height="4" rx="2" fill="currentColor" opacity="0.3" />
          <rect x="42" y="26" width="6" height="4" rx="2" fill="currentColor" opacity="0.3" />
        </>
      )}
    </svg>
  );
}

function StarMascot({ milestone }: { milestone: string }) {
  const isFirst = milestone === 'First Light';
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full" aria-hidden="true">
      <path
        d="M32 8 L36 24 L52 24 L39 33 L43 49 L32 40 L21 49 L25 33 L12 24 L28 24 Z"
        fill="currentColor"
        opacity={isFirst ? 0.2 : 0.4}
      />
      {!isFirst && (
        <>
          <circle cx="18" cy="14" r="2" fill="currentColor" opacity="0.3" />
          <circle cx="48" cy="18" r="1.5" fill="currentColor" opacity="0.25" />
          <circle cx="14" cy="44" r="1" fill="currentColor" opacity="0.2" />
          <circle cx="50" cy="42" r="1.5" fill="currentColor" opacity="0.2" />
        </>
      )}
    </svg>
  );
}

/** Theme-specific decorative background shapes */
function ThemeDecorations({ themeId }: { themeId: string }) {
  switch (themeId) {
    case 'dragon-forge':
      return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-sf-accent/10 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-16 h-16 rounded-full bg-sf-secondary/10 blur-xl" />
          <svg className="absolute top-2 right-2 w-8 h-8 text-sf-accent/15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93z" />
          </svg>
        </div>
      );
    case 'monster-lab':
      return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-4 -left-4 w-20 h-20 rounded-lg rotate-12 bg-sf-accent/10 blur-2xl" />
          <div className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-sf-secondary/10 blur-xl" />
          <svg className="absolute bottom-2 right-2 w-6 h-6 text-sf-secondary/15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
          </svg>
        </div>
      );
    case 'star-trail':
      return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-8 right-4 w-16 h-16 rounded-full bg-sf-secondary/10 blur-2xl" />
          <div className="absolute bottom-0 -left-8 w-24 h-24 rounded-full bg-sf-accent/5 blur-2xl" />
          {[
            { x: '10%', y: '20%', size: 'w-1 h-1' },
            { x: '80%', y: '15%', size: 'w-1.5 h-1.5' },
            { x: '60%', y: '70%', size: 'w-1 h-1' },
            { x: '25%', y: '80%', size: 'w-0.5 h-0.5' },
          ].map((star, i) => (
            <div
              key={i}
              className={`absolute ${star.size} rounded-full bg-sf-secondary/20`}
              style={{ left: star.x, top: star.y }}
            />
          ))}
        </div>
      );
    default:
      return null;
  }
}

function ThemeMascot({ themeId, milestone }: { themeId: string; milestone: string }) {
  switch (themeId) {
    case 'dragon-forge':
      return <DragonMascot milestone={milestone} />;
    case 'monster-lab':
      return <MonsterMascot milestone={milestone} />;
    case 'star-trail':
      return <StarMascot milestone={milestone} />;
    default:
      return null;
  }
}

/** Returns a theme-flavored encouragement message */
function getThemeMessage(themeId: string, milestone: string, next: string | null): string {
  if (!next) {
    switch (themeId) {
      case 'dragon-forge': return 'Your dragon is fully grown!';
      case 'monster-lab': return 'Your creature is complete!';
      case 'star-trail': return 'You mapped the universe!';
      default: return 'Amazing progress!';
    }
  }

  switch (themeId) {
    case 'dragon-forge': return `Growing your dragon — ${milestone}`;
    case 'monster-lab': return `Building creature — ${milestone}`;
    case 'star-trail': return `Exploring space — ${milestone}`;
    default: return milestone;
  }
}

export function ThemedHero({ profileId, themeId }: ThemedHeroProps) {
  const theme = themeEngine.getTheme(themeId);
  const milestoneStatus = rewardTracker.getMilestoneStatus(profileId, themeId);
  const progress = rewardTracker.getProgress(profileId, themeId);
  const maxProgress = themeEngine.getMaxProgress(themeId);
  const progressPercent = maxProgress > 0 ? Math.min(100, Math.round((progress / maxProgress) * 100)) : 0;
  const message = getThemeMessage(themeId, milestoneStatus.current, milestoneStatus.next);

  return (
    <div className="relative rounded-xl bg-sf-surface border border-sf-border p-3 overflow-hidden" data-testid="themed-hero">
      <ThemeDecorations themeId={themeId} />

      <div className="relative flex items-center gap-3">
        {/* Mascot */}
        <div className="flex-shrink-0 w-12 h-12 text-sf-primary" data-testid="theme-mascot">
          <ThemeMascot themeId={themeId} milestone={milestoneStatus.current} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-sf-primary uppercase tracking-wide">
              {theme.name}
            </span>
          </div>

          <p className="text-sm text-sf-heading font-medium truncate" data-testid="theme-message">
            {message}
          </p>

          {/* Progress bar */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-sf-border overflow-hidden">
              <div
                className="h-full rounded-full bg-sf-primary transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={maxProgress}
                aria-label={`${theme.name} progress: ${progressPercent}%`}
              />
            </div>
            <span className="text-xs text-sf-muted font-medium tabular-nums" data-testid="progress-percent">
              {progressPercent}%
            </span>
          </div>

          {/* Next milestone hint */}
          {milestoneStatus.next && (
            <p className="text-xs text-sf-muted mt-1" data-testid="next-milestone">
              {milestoneStatus.progressToNext} {theme.rewardMechanic.unitName} to {milestoneStatus.next}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
