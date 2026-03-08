// src/features/dashboard/home-screen.tsx — Main hub screen with compact single-screen layout

import type { Profile, WordList, Word, WordStats, WordLearningProgress, StreakData, CoinBalance } from '../../contracts/types';
import { canPlayFree, getWordsDueCount } from '../../core/spaced-rep';
import { countMasteredWords } from '../../core/mastery';
import { ThemedHero } from './themed-hero';
import { monsterCollection } from '../rewards';

interface HomeScreenProps {
  profile: Profile;
  wordLists: WordList[];
  allWords: Word[];
  allStats: WordStats[];
  learningProgress: WordLearningProgress[];
  streakData: StreakData | null;
  coinBalance: CoinBalance | null;
  onNavigate: (view: 'progress' | 'practice' | 'practice-games' | 'quiz' | 'learning' | 'list-editor' | 'settings' | 'word-lists' | 'share' | 'monster-stable') => void;
  onSwitchProfile: () => void;
  hasMultipleProfiles: boolean;
}

export function HomeScreen({
  profile,
  wordLists,
  allWords,
  allStats,
  learningProgress,
  streakData,
  coinBalance,
  onNavigate,
  onSwitchProfile,
  hasMultipleProfiles,
}: HomeScreenProps) {
  const mastered = countMasteredWords(allWords, allStats, learningProgress);
  const activeLists = wordLists.filter((l) => l.active && !l.archived);
  const streak = streakData?.currentStreak ?? 0;
  const wordsDue = getWordsDueCount(allStats);
  const coins = coinBalance?.coins ?? 0;
  const allMastered = canPlayFree(allWords.length, mastered);
  const masteryPercent = allWords.length > 0 ? Math.round((mastered / allWords.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-sf-bg">
      {/* Hero header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-sf-surface via-sf-surface to-sf-surface-hover px-4 pt-3 pb-3">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-sf-primary blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full bg-sf-track-fill blur-3xl" />
        </div>

        <div className="relative max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto">
          {/* Top bar: Switch + Settings */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={onSwitchProfile}
              className="flex items-center gap-1.5 text-sf-muted hover:text-sf-secondary text-sm transition-colors"
            >
              <SwitchIcon />
              <span>{hasMultipleProfiles ? 'Switch' : 'Profiles'}</span>
            </button>
            <button
              onClick={() => onNavigate('settings')}
              className="p-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
              aria-label="Settings"
            >
              <SettingsIcon />
            </button>
          </div>

          {/* Avatar + Name */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br from-sf-primary to-sf-primary-hover text-sf-primary-text text-lg font-bold flex items-center justify-center shadow-lg">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <h1 className="text-xl font-bold text-sf-heading">
              Hey, {profile.name}!
            </h1>
          </div>

          {/* Compact stats row — mastery, due, streak, coins */}
          {allWords.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => onNavigate('progress')}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  allMastered
                    ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                    : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                }`}
              >
                {allMastered && <span className="text-xs">&#10003;</span>}
                <span>{masteryPercent}%</span>
                <span className="text-xs opacity-70">Mastery</span>
              </button>
              {wordsDue > 0 && (
                <button
                  onClick={() => onNavigate('practice')}
                  className="flex items-center gap-1.5 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
                >
                  <span>{wordsDue}</span>
                  <span className="text-xs opacity-70">Due</span>
                </button>
              )}
              <div className="flex items-center gap-1.5 bg-sf-surface/60 rounded-full px-3 py-1.5 text-sm">
                <span>🔥</span>
                <span className="font-medium text-sf-heading">{streak}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-sf-surface/60 rounded-full px-3 py-1.5 text-sm">
                <CoinIcon />
                <span className="font-bold text-yellow-400">{coins}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main actions */}
      <div className="max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto px-4 pb-6">
        <div className="space-y-3 mt-3">
          {/* Start Practice — hero card */}
          {allWords.length > 0 && (
            <button
              onClick={() => mastered > 0 ? onNavigate('practice') : onNavigate('learning')}
              className="group w-full relative overflow-hidden rounded-2xl bg-gradient-to-r from-sf-primary to-sf-primary-hover p-4 text-left shadow-lg hover:shadow-xl transition-all active:scale-[0.98]"
            >
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/20 -translate-y-1/2 translate-x-1/4" />
              </div>
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-sf-primary-text font-bold text-lg">
                    {mastered > 0 ? 'Start Practice' : 'Start Learning'}
                  </p>
                  <p className="text-sf-primary-text/70 text-sm">
                    {mastered > 0
                      ? `${mastered} word${mastered !== 1 ? 's' : ''} ready to practice`
                      : `${allWords.length} word${allWords.length !== 1 ? 's' : ''} to learn`
                    }
                  </p>
                </div>
                <div className="text-sf-primary-text text-3xl group-hover:translate-x-1 transition-transform">
                  →
                </div>
              </div>
            </button>
          )}

          {/* Theme milestone progress */}
          <ThemedHero profileId={profile.id} themeId={profile.themeId} />

          {/* Monster Stable link */}
          {monsterCollection.getCollectionCount(profile.id) > 0 && (
            <button
              onClick={() => onNavigate('monster-stable')}
              className="w-full flex items-center justify-between rounded-lg bg-sf-surface/60 border border-sf-border/50 px-3 py-2 hover:border-sf-border-strong transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{'\u{1F9EA}'}</span>
                <span className="text-xs font-medium text-sf-heading">Monster Stable</span>
              </div>
              <span className="text-xs text-sf-muted">
                {monsterCollection.getCollectionCount(profile.id)} creature{monsterCollection.getCollectionCount(profile.id) !== 1 ? 's' : ''} →
              </span>
            </button>
          )}

          {/* 2x2 navigation grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <NavCard
              title="Progress"
              subtitle={`${mastered}/${allWords.length} mastered`}
              icon={<ChartIcon />}
              onClick={() => onNavigate('progress')}
              accent="from-green-500/20 to-emerald-500/10"
              iconColor="text-green-500"
            />
            <NavCard
              title="Learn"
              subtitle={`${allWords.length - mastered} new word${allWords.length - mastered !== 1 ? 's' : ''}`}
              icon={<LearnIcon />}
              onClick={() => onNavigate('learning')}
              accent="from-teal-500/20 to-cyan-500/10"
              iconColor="text-teal-500"
            />
            <NavCard
              title="Games"
              subtitle={allMastered ? 'Free play!' : `${coins} coin${coins !== 1 ? 's' : ''}`}
              icon={<GamesIcon />}
              onClick={() => onNavigate('practice-games')}
              accent="from-pink-500/20 to-rose-500/10"
              iconColor="text-pink-500"
            />
            <NavCard
              title="Quiz"
              subtitle="Test yourself"
              icon={<QuizNavIcon />}
              onClick={() => onNavigate('quiz')}
              accent="from-orange-500/20 to-amber-500/10"
              iconColor="text-orange-500"
            />
          </div>

          {/* My Words — combined word lists + add words */}
          <button
            onClick={() => onNavigate('word-lists')}
            className="group w-full relative overflow-hidden rounded-xl bg-sf-surface border border-sf-border p-3 text-left hover:border-sf-border-strong hover:shadow-md transition-all active:scale-[0.97]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-violet-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-blue-500"><ListIcon /></div>
                <div>
                  <p className="font-bold text-sf-heading text-sm">My Words</p>
                  <p className="text-sf-muted text-xs">{activeLists.length} active list{activeLists.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="text-sf-muted group-hover:text-sf-secondary transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </div>
          </button>

          {/* Empty state for new users */}
          {allWords.length === 0 && (
            <button
              onClick={() => onNavigate('list-editor')}
              className="w-full rounded-2xl border-2 border-dashed border-sf-border-strong bg-sf-surface p-8 text-center hover:bg-sf-surface-hover hover:border-sf-primary transition-all active:scale-[0.98]"
            >
              <div className="text-4xl mb-3">&#10024;</div>
              <p className="text-sf-heading font-bold text-lg">Get Started!</p>
              <p className="text-sf-muted text-sm mt-1">Add your first spelling words</p>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-yellow-400">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
      <circle cx="12" cy="12" r="8" fill="currentColor" />
      <text x="12" y="16" textAnchor="middle" fill="#78350f" fontSize="10" fontWeight="bold">$</text>
    </svg>
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
      className="group relative overflow-hidden rounded-xl bg-sf-surface border border-sf-border p-3 text-left hover:border-sf-border-strong hover:shadow-md transition-all active:scale-[0.97]"
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

// ─── SVG Icons ───────────────────────────────────────────────

function LearnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-7 h-7">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-7 h-7">
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-7 h-7">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function GamesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-7 h-7">
      <rect x="2" y="2" width="9" height="9" rx="1" />
      <rect x="13" y="2" width="9" height="9" rx="1" />
      <rect x="2" y="13" width="9" height="9" rx="1" />
      <path d="M17.5 13v9M13 17.5h9" />
    </svg>
  );
}

function QuizNavIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-7 h-7">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
