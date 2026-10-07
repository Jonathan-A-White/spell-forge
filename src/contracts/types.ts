// src/contracts/types.ts — the contract all modules implement against

import type { BsvEvent } from '../bsv/types';

// ─── Core Entities ─────────────────────────────────────────────

export type ProfileStatus = 'active' | 'archived' | 'deleted';

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  themeId: string;
  pin?: string; // parent PIN hash
  createdAt: Date;
  settings: AccessibilitySettings;
  importFilterWords?: string[];  // words/phrases to auto-exclude from camera import
  status?: ProfileStatus; // defaults to 'active' for backward compat
  gradeGoal?: number; // target % of words at familiar+ for readiness (80, 90, or 100; default 100)
}

/**
 * Order in which words are presented while learning new words.
 * Word length is the difficulty proxy (no stats exist yet at learning time).
 * - 'wave': easy → medium → hard → medium → easy (saves the shortest words for the end)
 * - 'easy-to-hard': shortest → longest
 * - 'hard-to-easy': longest → shortest
 * - 'random': fresh shuffle each visit
 */
export type LearningStrategy = 'wave' | 'easy-to-hard' | 'hard-to-easy' | 'random';

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
  learningStrategy: LearningStrategy;
  /** The Tutor's strictness this child last chose (sf-tutor); absent means 'meaning-gated'. */
  tutorStrictness?: TutorStrictness;
}

export interface WordList {
  id: string;
  profileId: string;
  name: string;
  language: string;  // BCP-47 language code ('en', 'es', etc.) — defaults to 'en'
  testDate: Date | null;
  createdAt: Date;
  source: 'camera' | 'manual' | 'import';
  active: boolean;
  archived: boolean;
}

/** How far a photo import has got: sent to the factory and awaited, read by it, read by the device, or neither could. */
export type PhotoImportStatus = 'reading' | 'factory' | 'device' | 'failed';

/** A photo of a word list on its way into a list (mw-z361n.4); survives the app closing. */
export interface PhotoImport {
  id: string;
  listId: string;
  profileId: string;
  /** The grist's txid, seq and mill: set once the factory has the photo. */
  txid?: string;
  seq?: number;
  mill?: string;
  /** The photo as stored for the device read; deleted once the import settles. */
  photo?: ArrayBuffer;
  mime: string;
  language: string;
  sentAt: Date;
  /** After this the device reads the photo itself. */
  deadline: Date;
  status: PhotoImportStatus;
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
  consecutiveWrong: number;
  longestCorrectStreak: number;
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
  mistakeCount?: number;
  userInput?: string;  // what the user actually typed (captured on incorrect attempts)
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
  | 'irregular'
  // Spanish-specific categories
  | 'es-vowel' | 'es-accent' | 'es-digraph' | 'es-silent-letter'
  | 'es-special-consonant' | 'es-diphthong' | 'es-syllable-rule';

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
  visualEffects: ThemeVisualEffects;
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

export interface ThemeVisualEffects {
  gradient: string;          // CSS gradient for themed backgrounds
  glowColor: string;         // glow/shadow accent color (rgba)
  particleColors: string[];  // 2-3 colors for ambient animated particles
  shadowColor: string;       // themed drop shadow color (rgba)
  progressGradient: string;  // gradient for the progress bar fill
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
  /** When a creature is completed, the pack of 3 creatures earned. */
  packEarned?: CompletedCreature[];
}

export type CreatureRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface CreatureAppearance {
  bodyShape: number;    // 0-4 index into theme body shapes
  primaryColor: number; // 0-5 index into theme color palette
  accentColor: number;  // 0-5 index into theme accent palette
  eyes: number;         // 0-4 eye style
  mouth: number;        // 0-3 mouth style
  extra: number;        // 0-4 theme-specific extra (horns, wings, sparkles)
}

export interface CompletedCreature {
  id: string;
  profileId: string;
  themeId: string;
  name: string;
  completedAt: Date;
  totalBlocksUsed: number;
  level: number;              // 1-5
  rarity: CreatureRarity;
  appearance: CreatureAppearance;
  packId?: string;            // groups creatures from same pack opening
}

export interface ThemeProgress {
  id: string;              // `${profileId}:${themeId}`
  profileId: string;
  themeId: string;
  totalProgress: number;
  updatedAt: Date;
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

export type CoinTransactionReason =
  | 'word-mastered'
  | 'all-learning'
  | 'all-familiar'
  | 'game-play';

export interface CoinTransaction {
  id: string;
  profileId: string;
  amount: number;          // positive = earned, negative = spent
  reason: CoinTransactionReason;
  description: string;     // human-readable description
  wordId?: string;         // associated word (for word-mastered)
  createdAt: Date;
}

// ─── Memory Aids ─────────────────────────────────────────────

export type MemoryAidType = 'phonetic' | 'pattern' | 'mnemonic';

export interface PhoneticAid {
  type: 'phonetic';
  /** Syllable chunks with optional pronunciation */
  chunks: PhoneticChunk[];
  /** Plain summary like "say it: beau·ti·ful" */
  summary: string;
}

export interface PhoneticChunk {
  text: string;        // the syllable grapheme, e.g. "beau"
  pronunciation: string; // IPA or friendly pronunciation, e.g. "/bjuː/"
}

export interface PatternAid {
  type: 'pattern';
  /** Segments of the word, some highlighted as known patterns */
  segments: PatternSegment[];
  /** Teaching tips about the highlighted patterns */
  tips: PatternTip[];
}

export interface PatternSegment {
  text: string;
  patternId: string | null; // null = no pattern, plain text
  colorIndex: number;       // 0 for plain, 1-4 for pattern colors
}

export interface PatternTip {
  pattern: string;   // e.g. "igh"
  hint: string;      // e.g. '"igh" says long i'
  examples: string[]; // e.g. ['light', 'night', 'sight']
}

export interface MnemonicAid {
  type: 'mnemonic';
  /** Short memorable trick or phrase */
  tricks: MnemonicTrick[];
}

export interface MnemonicTrick {
  label: string;   // e.g. "Words inside" or "Remember"
  content: string; // e.g. "to·GET·HER" or "Big Elephants Can..."
}

export type MemoryAid = PhoneticAid | PatternAid | MnemonicAid;

// ─── Test Results ────────────────────────────────────────────

export interface TestResult {
  id: string;
  wordListId: string;
  profileId: string;
  testDate: Date;
  recordedAt: Date;
  wordResults: TestWordResult[];
  calculatedPercent: number;   // auto-calculated from wordResults
  overridePercent: number | null; // teacher-assigned grade override
  finalPercent: number;        // overridePercent ?? calculatedPercent
}

export interface TestWordResult {
  wordId: string;
  word: string;       // snapshot of word text at test time
  correct: boolean;
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
  activityProgress: ActivityProgress[];
  learningProgress: WordLearningProgress[];
  coinBalance: CoinBalance | null;
  testResults: TestResult[];
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
  | { type: 'coins:earned'; payload: { profileId: string; amount: number; reason: CoinTransactionReason; wordId?: string } }
  | { type: 'coins:spent'; payload: { profileId: string; amount: number; reason: CoinTransactionReason } }
  | { type: 'profile:archived'; payload: { profileId: string } }
  | { type: 'profile:restored'; payload: { profileId: string } }
  | { type: 'profile:deleted'; payload: { profileId: string } }
  | { type: 'test:recorded'; payload: { testResult: TestResult; wordListId: string } }
  | BsvEvent;

export interface EventBus {
  emit(event: AppEvent): void;
  on(type: AppEvent['type'], handler: (event: AppEvent) => void): () => void;
}

// ─── BSV Wallet ──────────────────────────────────────────────

export type BsvWalletKeyKind = 'wif';

export interface BsvWalletKey {
  id: string;
  kind: BsvWalletKeyKind;
  network: 'testnet' | 'mainnet';
  material: string;   // the WIF string
  address: string;
  createdAt: Date;
  label?: string;
}

// ─── BSV Chain Provider ─────────────────────────────────────

export type { Utxo, AddressHistoryEntry } from '../bsv/types';

/** Outpoints spent by a broadcast, remembered until WhatsOnChain confirms it or 24h pass. */
export interface BsvPendingSpend {
  txid: string;
  outpoints: string[]; // "txid:vout"
  createdAt: Date;
}

// ─── Tutor (sf-tutor) ─────────────────────────────────────────

export type TutorStrictness = 'meaning-gated' | 'precision';
export type TutorMode = 'problem-in' | 'reading' | 'math';
export type TutorSessionStatus = 'active' | 'ended';
export type TutorTurnStatus = 'sending' | 'waiting' | 'answered' | 'refused' | 'failed' | 'stale';
export type TutorAttachmentKind = 'problem' | 'work' | 'audio';

/** One word of a scorer's reading result (the mill's scorer contract). */
export interface ReadingWord {
  text: string;
  expected_phonemes: string[];
  produced_phonemes: string[];
  error: 'none' | 'omission' | 'insertion' | 'mispronunciation' | 'hesitation';
  accuracy: number;
  self_corrected: boolean;
}

/** What one scoring engine heard of a clip. */
export interface ReadingResult {
  engine: string;
  words: ReadingWord[];
  accuracy: number;
  seconds: number;
}

/** The scorers' results for one reading, by engine; both travel to the grist and stay in the record. */
export interface TutorReadingResult {
  azure?: ReadingResult;
  local?: ReadingResult;
}

/** An earlier turn, compact, so the grist knows what has been tried. */
export interface TutorHistoryEntry {
  mode: TutorMode;
  action?: TutorAnswerAction;
  prompt_to_child?: string;
  child_answer?: string;
}

/** App -> AI: the input of one tutor turn (design 4). Photos and audio travel as attachments. */
export interface TutorRequest {
  mode: TutorMode;
  strictness: TutorStrictness;
  target_text?: string;
  reading_result?: TutorReadingResult;
  child_answer?: string;
  /** True when a photo of the child's work is attached. */
  work_photo?: boolean;
  session_history: TutorHistoryEntry[];
}

export type TutorAnswerAction =
  | 'continue'
  | 'reread_word'
  | 'reread_sentence'
  | 'sound_out'
  | 'math_probe'
  | 'confirm_answer'
  | 'encourage'
  | 'done';

/** AI -> App: grinds/tutor-turn.answer.schema.json. Never the answer to the problem in a field the child sees. */
export interface TutorAnswer {
  action: TutorAnswerAction;
  focus_words: { word: string; chunks: string[] }[];
  prompt_to_child: string;
  layer_diagnosis: 'reading' | 'math' | 'both' | 'none';
  math_diagnosis?: { where_wrong: string; gap: string; method: string };
  target_text?: string;
  problem_kind?: 'word' | 'plain';
  notes_for_parent?: string;
  recommendations_for_parent?: { what: string; why: string; where: string }[];
  teaching_method?: string;
}

/** The mill's verdict on one tutor turn, as the app applies it. */
export type TutorTurnResult =
  | { status: 'answered'; answer: TutorAnswer }
  | { status: 'refused' | 'failed'; reason: string };

export interface TutorSession {
  id: string;
  profileId: string;
  startedAt: Date;
  endedAt?: Date;
  strictness: TutorStrictness;
  problemKind?: 'word' | 'plain';
  targetText?: string;
  status: TutorSessionStatus;
}

export interface TutorTurn {
  id: string;
  sessionId: string;
  /** 1-based, in the order turns were added to the session. */
  index: number;
  mode: TutorMode;
  sentAt: Date;
  answeredAt?: Date;
  /** The grist's txid, seq and mill: set once the factory has the turn. */
  txid?: string;
  seq?: number;
  mill?: string;
  request: TutorRequest;
  attachments: { kind: TutorAttachmentKind; blobId: string }[];
  readingResult?: TutorReadingResult;
  answer?: TutorAnswer;
  /** Why a turn was refused or failed. */
  failureReason?: string;
  /** The child moved past this turn while it waited: its answer is kept but never shown (status stale). */
  movedOn?: boolean;
  status: TutorTurnStatus;
}

/** A photo or a recording kept for the session's raw record. */
export interface TutorBlob {
  id: string;
  bytes: ArrayBuffer;
  mime: string;
  name?: string;
  createdAt: Date;
}

// ─── Sync Queue ───────────────────────────────────────────────

export interface SyncQueueItem {
  id: string;
  type: 'feedback' | 'analytics' | 'backup';
  payload: unknown;
  createdAt: Date;
  synced: boolean;
}
