// src/features/dashboard/home-screen.tsx — Main hub screen with navigation cards

import type { Profile, WordList, Word, WordStats, StreakData } from '../../contracts/types';

interface HomeScreenProps {
  profile: Profile;
  wordLists: WordList[];
  allWords: Word[];
  allStats: WordStats[];
  streakData: StreakData | null;
  onNavigate: (view: 'progress' | 'practice' | 'practice-games' | 'list-editor' | 'settings' | 'word-lists' | 'feedback') => void;
  onSwitchProfile: () => void;
  hasMultipleProfiles: boolean;
}

export function HomeScreen({
  profile,
  wordLists,
  allWords,
  allStats,
  streakData,
  onNavigate,
  onSwitchProfile,
  hasMultipleProfiles,
}: HomeScreenProps) {
  const mastered = allStats.filter((s) => s.currentBucket === 'mastered' || s.currentBucket === 'review').length;
  const activeLists = wordLists.filter((l) => l.active && !l.archived);
  const streak = streakData?.currentStreak ?? 0;

  return (
    <div className="min-h-screen bg-sf-bg">
      {/* Hero header with gradient overlay */}
      <div className="relative overflow-hidden bg-gradient-to-br from-sf-surface via-sf-surface to-sf-surface-hover px-4 pt-8 pb-6">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-sf-primary blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full bg-sf-track-fill blur-3xl" />
        </div>

        <div className="relative max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-6">
            {hasMultipleProfiles ? (
              <button
                onClick={onSwitchProfile}
                className="flex items-center gap-1.5 text-sf-muted hover:text-sf-secondary text-sm transition-colors"
              >
                <SwitchIcon />
                <span>Switch</span>
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={() => onNavigate('settings')}
              className="p-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
              aria-label="Settings"
            >
              <SettingsIcon />
            </button>
          </div>

          <div className="text-center mb-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-sf-primary to-sf-primary-hover text-sf-primary-text text-2xl font-bold mb-3 shadow-lg">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <h1 className="text-2xl font-bold text-sf-heading">
              Hey, {profile.name}!
            </h1>
            <p className="text-sf-muted text-sm mt-1">
              {getGreeting()}
            </p>
          </div>

          {/* Quick stats row */}
          <div className="flex justify-center gap-6 mt-4">
            <QuickStat value={streak} label="Streak" icon="🔥" />
            <QuickStat value={allWords.length} label="Words" icon="📝" />
            <QuickStat value={mastered} label="Mastered" icon="⭐" />
          </div>
        </div>
      </div>

      {/* Navigation cards */}
      <div className="max-w-lg mx-auto px-4 -mt-2 pb-6">
        <div className="space-y-3 mt-6">
          {/* Start Practice - Hero card */}
          {allWords.length > 0 && (
            <button
              onClick={() => onNavigate('practice')}
              className="group w-full relative overflow-hidden rounded-2xl bg-gradient-to-r from-sf-primary to-sf-primary-hover p-5 text-left shadow-lg hover:shadow-xl transition-all active:scale-[0.98]"
            >
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/20 -translate-y-1/2 translate-x-1/4" />
              </div>
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-sf-primary-text font-bold text-lg">Start Practice</p>
                  <p className="text-sf-primary-text/70 text-sm mt-0.5">
                    {allWords.length} word{allWords.length !== 1 ? 's' : ''} waiting
                  </p>
                </div>
                <div className="text-sf-primary-text text-3xl group-hover:translate-x-1 transition-transform">
                  →
                </div>
              </div>
            </button>
          )}

          {/* Grid of feature cards */}
          <div className="grid grid-cols-2 gap-3">
            <NavCard
              title="Progress"
              subtitle={`${mastered}/${allWords.length} mastered`}
              icon={<ChartIcon />}
              onClick={() => onNavigate('progress')}
              accent="from-green-500/20 to-emerald-500/10"
              iconColor="text-green-500"
            />
            <NavCard
              title="Games"
              subtitle="Search, quiz"
              icon={<GamesIcon />}
              onClick={() => onNavigate('practice-games')}
              accent="from-pink-500/20 to-rose-500/10"
              iconColor="text-pink-500"
            />
            <NavCard
              title="Word Lists"
              subtitle={`${activeLists.length} active list${activeLists.length !== 1 ? 's' : ''}`}
              icon={<ListIcon />}
              onClick={() => onNavigate('word-lists')}
              accent="from-blue-500/20 to-cyan-500/10"
              iconColor="text-blue-500"
            />
            <NavCard
              title="Add Words"
              subtitle="Create a new list"
              icon={<PlusIcon />}
              onClick={() => onNavigate('list-editor')}
              accent="from-purple-500/20 to-violet-500/10"
              iconColor="text-purple-500"
            />
            <NavCard
              title="Settings"
              subtitle={capitalize(profile.settings.contrastMode) + ' mode'}
              icon={<SettingsIcon />}
              onClick={() => onNavigate('settings')}
              accent="from-orange-500/20 to-amber-500/10"
              iconColor="text-orange-500"
            />
          </div>

          {/* Empty state for new users */}
          {allWords.length === 0 && (
            <button
              onClick={() => onNavigate('list-editor')}
              className="w-full rounded-2xl border-2 border-dashed border-sf-border-strong bg-sf-surface p-8 text-center hover:bg-sf-surface-hover hover:border-sf-primary transition-all active:scale-[0.98]"
            >
              <div className="text-4xl mb-3">✨</div>
              <p className="text-sf-heading font-bold text-lg">Get Started!</p>
              <p className="text-sf-muted text-sm mt-1">Add your first spelling words</p>
            </button>
          )}

          {/* Feedback link */}
          <button
            onClick={() => onNavigate('feedback')}
            className="w-full text-center text-sf-muted hover:text-sf-secondary text-sm py-3 transition-colors"
          >
            Send Feedback
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickStat({ value, label, icon }: { value: number; label: string; icon: string }) {
  return (
    <div className="text-center">
      <div className="text-sm mb-0.5">{icon}</div>
      <p className="text-xl font-bold text-sf-heading">{value}</p>
      <p className="text-xs text-sf-muted">{label}</p>
    </div>
  );
}

interface NavCardProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onClick: () => void;
  accent: string;
  iconColor: string;
}

function NavCard({ title, subtitle, icon, onClick, accent, iconColor }: NavCardProps) {
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-xl bg-sf-surface border border-sf-border p-4 text-left hover:border-sf-border-strong hover:shadow-md transition-all active:scale-[0.97]"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-0 group-hover:opacity-100 transition-opacity`} />
      <div className="relative">
        <div className={`${iconColor} mb-2`}>{icon}</div>
        <p className="font-bold text-sf-heading text-sm">{title}</p>
        <p className="text-sf-muted text-xs mt-0.5">{subtitle}</p>
      </div>
    </button>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Ready for some morning practice?';
  if (hour < 17) return 'Good afternoon! Time to practice?';
  return 'Evening practice session?';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace('-', ' ');
}

// ─── SVG Icons ───────────────────────────────────────────────

function SwitchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M16 3l4 4-4 4" />
      <path d="M20 7H4" />
      <path d="M8 21l-4-4 4-4" />
      <path d="M4 17h16" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function GamesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <rect x="2" y="2" width="9" height="9" rx="1" />
      <rect x="13" y="2" width="9" height="9" rx="1" />
      <rect x="2" y="13" width="9" height="9" rx="1" />
      <path d="M17.5 13v9M13 17.5h9" />
    </svg>
  );
}
