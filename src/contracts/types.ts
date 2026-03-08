// src/contracts/types.ts — the contract all modules implement against

// ─── Core Entities ─────────────────────────────────────────────

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  themeId: string;
  pin?: string; // parent PIN hash
  createdAt: Date;
  settings: AccessibilitySettings;
}

export interface AccessibilitySettings {
  fontSize: number;          // 16-48, default 24
  fontWeight: 'normal' | 'bold' | 'extra-bold';
  fontFamily: string;
  letterSpacing: number;     // 0-0.3em
  lineHeight: number;        // 1.2-2.5
  contrastMode: 'light' | 'dark' | 'high-contrast';
  backgroundColor: string;
  reducedMotion: boolean;
  sessionMaxMinutes: number;
  sessionAdaptive: boolean;
  dailyGoalMinutes: number;
  tapTargetSize: number;     // 48-72px
  voicePreference: 'female' | 'male';
}

export interface WordList {
  id: string;
  profileId: string;
  name: string;
  testDate: Date | null;
  createdAt: Date;
  source: 'camera' | 'manual' | 'import';
  active: boolean;
  archived: boolean;
}

export interface Word {
  id: string;
  listId: string;
  profileId: string;
  text: string;
  phonemes: string[];
  syllables: string[];
  patterns: DetectedPattern[];
  imageUrl: string | null;
  imageCached: boolean;
  audioCustom: Blob | null;
  createdAt: Date;
}

export interface WordStats {
  id: string;
  wordId: string;
  profileId: string;
  lastAsked: Date | null;
  timesAsked: number;
  timesWrong: number;
  timesStruggledRight: number;
  timesEasyRight: number;
  consecutiveCorrect: number;
  currentBucket: WordBucket;
  nextReviewDate: Date;
  difficultyScore: number;  // 0.0-1.0
  techniqueHistory: TechniqueResult[];
}

export type WordBucket = 'new' | 'learning' | 'familiar' | 'mastered' | 'review';

export interface TechniqueResult {
  techniqueId: string;
  timestamp: Date;
  correct: boolean;
  responseTimeMs: number;
  struggled: boolean;
  scaffoldingUsed: boolean;
}

export interface SessionLog {
  id: string;
  profileId: string;
  startedAt: Date;
  endedAt: Date | null;
  wordsAttempted: number;
  wordsCorrect: number;
  engagementScore: number;
  endReason: 'completed' | 'adaptive-stop' | 'user-quit' | 'parent-stop';
  rewardEarned: RewardEvent | null;
}

export interface StreakData {
  profileId: string;
  currentStreak: number;
  longestStreak: number;
  lastSessionDate: Date | null;
  weeklyProgress: DayProgress[];
}

export interface DayProgress {
  date: string;       // ISO date
  completed: boolean;
  sessionCount: number;
}

// ─── Phonics ───────────────────────────────────────────────────

export interface PhonicsResult {
  syllables: string[];
  phonemes: Phoneme[];
  patterns: DetectedPattern[];
  difficultyScore: number;
  scaffoldingHints: string[];
  relatedWords: string[];
}

export interface Phoneme {
  grapheme: string;    // what's written: "igh"
  phoneme: string;     // how it sounds: "/aɪ/"
  position: number;    // index in word
  length: number;      // grapheme length
}

export interface DetectedPattern {
  id: string;
  category: PatternCategory;
  grapheme: string;
  hint: string;
}

export type PatternCategory =
  | 'short-vowel' | 'long-vowel-silent-e' | 'vowel-team'
  | 'r-controlled' | 'consonant-digraph' | 'consonant-blend'
  | 'silent-letter' | 'double-consonant' | 'suffix' | 'prefix'
  | 'irregular';

// ─── Spaced Repetition ────────────────────────────────────────

export interface SessionWordSelection {
  currentListWords: Word[];     // ~60% of session
  reviewWords: Word[];          // ~30% from past lists
  maintenanceWords: Word[];     // ~10% long-term
  totalTarget: number;
}

// ─── Adaptive Session ─────────────────────────────────────────

export interface EngagementSignals {
  responseTimeTrend: 'stable' | 'increasing' | 'decreasing';
  recentErrorRate: number;      // 0.0-1.0
  consecutiveErrors: number;
  sessionDurationMs: number;
  historicalToleranceMs: number;
}

export interface AdaptiveAction {
  type: 'continue' | 'easier-word' | 'more-scaffolding' | 'wrap-up' | 'switch-technique';
  reason: string;
}

// ─── Audio ────────────────────────────────────────────────────

export interface AudioProvider {
  speak(word: string): Promise<void>;
  speakSlowly(word: string): Promise<void>;
  speakChunks(chunks: string[], delayMs?: number): Promise<void>;
  isAvailable(): boolean;
  priority: number;   // higher = preferred
}

// ─── OCR ──────────────────────────────────────────────────────

export interface OcrResult {
  rawText: string;
  words: string[];
  confidence: number;   // 0.0-1.0
  source: 'local' | 'remote';
}

export interface OcrProvider {
  extractWords(image: Blob): Promise<OcrResult>;
  isAvailable(): boolean;
}

// ─── Theme & Rewards ──────────────────────────────────────────

export interface Theme {
  id: string;
  name: string;
  description: string;
  ageRange: string;
  palette: ThemePalette;
  rewardMechanic: RewardMechanic;
  assets: ThemeAssets;
}

export interface ThemePalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  success: string;
  error: string;
}

export interface RewardMechanic {
  type: 'build' | 'hatch' | 'collect' | 'unlock' | 'grow';
  unitName: string;
  milestoneNames: string[];
  progressPerCorrect: number;
  progressPerSession: number;
  weeklyGoalReward: string;
}

export interface ThemeAssets {
  icon: string;
  sounds: Record<string, string>;
  images: Record<string, string>;
}

export interface RewardEvent {
  themeId: string;
  unitsEarned: number;
  milestoneReached: string | null;
  totalProgress: number;
  creatureCompleted: boolean;
}

export interface CompletedCreature {
  id: string;
  profileId: string;
  themeId: string;
  name: string;
  completedAt: Date;
  totalBlocksUsed: number;
}

// ─── Dashboard ────────────────────────────────────────────────

export type ReadinessLevel = 'keep-forging' | 'getting-warmer' | 'almost-there' | 'ready';

// ─── Activity Progress (Auto-Save) ───────────────────────

export type ActivityType = 'practice' | 'word-search' | 'quiz' | 'learning' | 'relay-race' | 'spell-catcher' | 'word-volcano' | 'letter-invasion';

export interface ActivityProgress {
  id: string;              // `${profileId}:${activityType}`
  profileId: string;
  activityType: ActivityType;
  savedAt: Date;
  state: Record<string, unknown>;  // JSON-serializable activity state
}

// ─── Word Learning ───────────────────────────────────────────

export interface WordLearningProgress {
  id: string;              // `${profileId}:${wordId}`
  profileId: string;
  wordId: string;
  wordListId: string;
  stage: LearningStage;
  consecutiveSuccesses: number;  // 0-2 within current stage
  consecutiveFailures: number;   // for regression (2 in a row = regress)
  mastered: boolean;
  totalAttempts: number;
  totalErrors: number;
  lastAttemptAt: Date | null;
  createdAt: Date;
}

/**
 * Stage 0: Full word shown
 * Stage 1: 1 random letter hidden
 * Stage 2: 2 random letters hidden
 * Stage 3: No word shown (audio only)
 */
export type LearningStage = 0 | 1 | 2 | 3;

export type LearningInputMode = 'scrambled' | 'keyboard';

// ─── Coin Economy ────────────────────────────────────────────

export interface CoinBalance {
  profileId: string;       // primary key
  coins: number;           // current available coins
  totalEarned: number;     // lifetime coins earned
  totalSpent: number;      // lifetime coins spent
  updatedAt: Date;
}

// ─── Import/Export ────────────────────────────────────────────

export interface ExportPayload {
  version: string;
  exportedAt: Date;
  profile: Profile;
  wordLists: WordList[];
  words: Word[];
  wordStats: WordStats[];
  sessionLogs: SessionLog[];
  streakData: StreakData;
}

export type ImportStrategy = 'merge' | 'replace';

export interface ImportResult {
  profileId: string;
  wordsAdded: number;
  wordsUpdated: number;    // import won conflict
  wordsPreserved: number;  // existed only locally
  listsAdded: number;
  strategy: ImportStrategy;
}

// ─── Event Bus ────────────────────────────────────────────────

export type AppEvent =
  | { type: 'word:attempted'; payload: { wordId: string; correct: boolean; technique: string; responseTimeMs: number; struggled: boolean } }
  | { type: 'session:started'; payload: { profileId: string } }
  | { type: 'session:ended'; payload: { sessionLog: SessionLog } }
  | { type: 'reward:earned'; payload: RewardEvent }
  | { type: 'streak:updated'; payload: StreakData }
  | { type: 'profile:switched'; payload: { profileId: string } }
  | { type: 'settings:changed'; payload: { profileId: string; settings: Partial<AccessibilitySettings> } }
  | { type: 'coins:earned'; payload: { profileId: string; amount: number; reason: 'word-mastered'; wordId: string } }
  | { type: 'coins:spent'; payload: { profileId: string; amount: number; reason: 'game-play' } };

export interface EventBus {
  emit(event: AppEvent): void;
  on(type: AppEvent['type'], handler: (event: AppEvent) => void): () => void;
}

// ─── Sync Queue ───────────────────────────────────────────────

export interface SyncQueueItem {
  id: string;
  type: 'feedback' | 'analytics' | 'backup';
  payload: unknown;
  createdAt: Date;
  synced: boolean;
}
