# SpellForge — Product Specification

**Version:** 1.0
**Date:** March 5, 2026
**Author:** Jonathan (with Claude)
**Status:** Draft

---

## 1. Vision

SpellForge is a modular, themeable, offline-first PWA that helps children master spelling through adaptive learning techniques, spaced repetition backed by research, and reward mechanics that meet each child where they are. It is designed first for Paul — a resistant 3rd grader with double vision who loves building creatures out of Plus-Plusses, Legos, and is deep into the Wings of Fire series — but architected so that any parent can customize it for any child with any interests at any level.

The core philosophy: **help the child hack themselves.** Track which learning techniques work for each child and each word, adapt automatically, celebrate wins, scaffold struggles, and never let a session end in frustration.

---

## 2. Primary User: Paul

| Attribute | Detail |
|-----------|--------|
| Grade | 3rd |
| Attitude toward spelling | Resistant |
| Vision | Double vision (diagnosis pending — eye doctor visit imminent) |
| Phonics | Knows phonics well |
| Interests | Plus-Plus monster building (color-sensitive), Legos, Wings of Fire audiobooks (currently on *Winter Turning*) |
| Device | Amazon Fire tablet |
| Session tolerance | ~5 minutes, sometimes up to 10 on a good day; varies |
| Spelling cycle | No fixed pattern — new words and test dates vary week to week. Parent or child sets dates per list. |

---

## 3. Design Principles

1. **Offline-first, better with WiFi.** Core learning works without any network. Sync, OCR enhancement, image fetching, and feedback submission happen when connected.
2. **Adaptive everything.** Session length, difficulty scaffolding, technique selection, and pacing all respond to the child's real-time engagement signals.
3. **Meet them where they are.** If it's too hard, break it down and scaffold. If it's too easy, increase challenge. If they're bored, change the approach.
4. **Never end in frustration.** Detect declining engagement (slower responses, rising errors, abandonment patterns) and gracefully wrap the session with a win.
5. **The child picks the theme.** Dragons, monsters, hair and makeup, sports — the reward mechanic and visual skin are decoupled from the learning engine.
6. **Modular and shareable.** A single hosted PWA. Share via QR code. Each family sets up profiles. The codebase is designed for community contribution and extension.
7. **Parents see progress without friction.** A parent dashboard shows mastery, streaks, struggling words, and upcoming tests at a glance.
8. **Visual accessibility is a first-class citizen.** Every visual parameter is configurable — font size, letter spacing, line height, contrast, background color, reduced motion — to accommodate double vision and other visual challenges.
9. **BDD from day one.** Every feature is specified as Gherkin scenarios before implementation. Every bug fix includes a regression test. The test suite is living documentation.

---

## 4. Technical Architecture

### 4.1 Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | React 18+ with TypeScript | Familiar (msb-audio), mature PWA ecosystem, strong offline patterns |
| Build | Vite + vite-plugin-pwa (Workbox) | Fast builds, excellent service worker generation |
| Local DB | IndexedDB via Dexie.js | Proven offline-first DB for PWAs, structured queries, works on Fire/Android/iOS |
| Audio | Web Speech API (TTS) + recorded audio + dictionary API (layered) | Offline TTS baseline, enhanced with human audio when available |
| Images | Free image API (Unsplash/Pexels/Pixabay) | Auto-fetched when online, cached locally |
| OCR | Tesseract.js (local) with optional server fallback | Works offline; can hit Termux instance or remote server for better accuracy |
| Hosting | GitHub Pages | Free, simple, reliable for static PWA |
| Styling | Tailwind CSS | Utility-first, easy theming, responsive |
| Testing | Vitest + React Testing Library + Cucumber (vitest-cucumber) | BDD from day one; fast, Vite-native |

### 4.2 Data Model (Dexie.js / IndexedDB)

```
profiles
  id: string (uuid)
  name: string
  avatar: string (theme-specific)
  themeId: string
  createdAt: Date
  settings: {
    fontSize: number
    letterSpacing: number
    lineHeight: number
    contrastMode: 'light' | 'dark' | 'high-contrast'
    backgroundColor: string
    reducedMotion: boolean
    sessionMaxMinutes: number
    sessionAdaptive: boolean
    dailyGoalMinutes: number
  }

wordLists
  id: string (uuid)
  profileId: string
  name: string
  dueDate: Date | null
  createdAt: Date
  source: 'camera' | 'manual' | 'import'
  active: boolean

words
  id: string (uuid)
  listId: string
  profileId: string
  text: string
  phonemes: string[] (phonetic breakdown)
  syllables: string[]
  patterns: string[] (e.g., 'silent-e', 'igh', 'tion')
  imageUrl: string | null
  imageCached: boolean
  audioCustom: Blob | null
  createdAt: Date

wordStats
  id: string (uuid)
  wordId: string
  profileId: string
  lastAsked: Date
  timesAsked: number
  timesWrong: number
  timesStruggledRight: number
  timesEasyRight: number
  currentBucket: 'new' | 'learning' | 'familiar' | 'mastered' | 'review'
  nextReviewDate: Date
  difficultyScore: number (0-1, computed)
  techniqueHistory: TechniqueResult[]

techniqueResults (embedded in wordStats or separate)
  techniqueId: string
  wordId: string
  profileId: string
  timestamp: Date
  correct: boolean
  responseTimeMs: number
  struggled: boolean

sessionLog
  id: string (uuid)
  profileId: string
  startedAt: Date
  endedAt: Date
  wordsAttempted: number
  wordsCorrect: number
  engagementScore: number (computed)
  endReason: 'completed' | 'adaptive-stop' | 'user-quit' | 'parent-stop'
  rewardEarned: object (theme-specific)

streaks
  profileId: string
  currentStreak: number
  longestStreak: number
  lastSessionDate: Date
  weeklyProgress: { day: string, completed: boolean }[]

syncQueue
  id: string (uuid)
  type: 'feedback' | 'analytics' | 'backup'
  payload: object
  createdAt: Date
  synced: boolean

themes
  id: string
  name: string
  description: string
  rewardMechanic: string (e.g., 'build-creature', 'hatch-egg', 'unlock-palette')
  assets: object (colors, icons, sounds)
  ageRange: string
```

### 4.3 Offline-First Architecture

```
┌─────────────────────────────────────┐
│           SpellForge PWA            │
│                                     │
│  ┌──────────┐  ┌────────────────┐   │
│  │  React   │  │  Service Worker │   │
│  │   App    │──│  (Workbox)      │   │
│  └────┬─────┘  └───────┬────────┘   │
│       │                │             │
│  ┌────▼────────────────▼──────┐     │
│  │     Dexie.js (IndexedDB)   │     │
│  │  ┌────────┐ ┌───────────┐  │     │
│  │  │Profiles│ │ WordStats  │  │     │
│  │  │ Words  │ │ Sessions   │  │     │
│  │  │ Lists  │ │ SyncQueue  │  │     │
│  │  └────────┘ └───────────┘  │     │
│  └────────────────────────────┘     │
│       │                              │
│  ┌────▼──────────────────────┐      │
│  │    Sync Manager           │      │
│  │  (when WiFi available)    │      │
│  │  • Image fetch + cache    │      │
│  │  • OCR server fallback    │      │
│  │  • Feedback submission    │      │
│  │  • Data backup/export     │      │
│  └───────────────────────────┘      │
└─────────────────────────────────────┘
```

### 4.4 Phonics Engine

A rule-based engine that decomposes English words into phonetic patterns, syllables, and learnable chunks.

**Core capabilities:**
- Break words into syllables using standard English syllabification rules
- Identify phoneme-grapheme mappings (e.g., "igh" → /aɪ/, "tion" → /ʃən/)
- Detect spelling patterns: silent-e, double consonants, vowel teams, r-controlled vowels
- Highlight trouble patterns per child (tracked in wordStats.techniqueHistory)
- Provide sounding-out scaffolding: show the word in chunks, play each chunk's sound, then the whole word

**Pattern database (extensible JSON):**
```json
{
  "patterns": [
    { "grapheme": "igh", "phoneme": "/aɪ/", "examples": ["light", "night", "right"], "hint": "igh says 'eye'" },
    { "grapheme": "tion", "phoneme": "/ʃən/", "examples": ["nation", "station"], "hint": "tion says 'shun'" },
    { "grapheme": "ough", "phoneme": "/ʌf/,/oʊ/,/uː/,/ɔː/", "examples": ["tough", "though", "through", "thought"], "hint": "ough is tricky — listen carefully" }
  ]
}
```

This ships as a static JSON file in Phase 1, with the architecture to support dynamic expansion and per-child pattern difficulty tracking.

---

## 5. Feature Specification by Phase

---

### Phase 1: Core Learning Loop (MVP)

**Goal:** Paul can practice his weekly spelling words on his Fire tablet with a letter bank, audio support, and basic progress tracking. A parent can enter words and see how he's doing.

#### 5.1.1 Profile Management
- **Add child:** Create a new profile with name, avatar (from theme), and independent settings
- **Edit child:** Update name, avatar, theme, and all settings
- **Delete child:** Remove a profile and all associated data (word lists, stats, session history, streaks). Requires parent PIN + confirmation ("This will permanently delete Paul's profile and all progress. Type the child's name to confirm.")
- **Clear child's data:** Reset a profile's learning data (stats, session history, streaks, word buckets) while keeping the profile, settings, and word lists intact. Useful for a fresh start without re-entering everything. Requires parent PIN + confirmation.
- **Export child's data:** Download all of a child's data as a JSON file — profile settings, word lists, all word stats, session history, streak data, technique history. Can be used for backup, migrating to another device, or sharing with a teacher. Available without WiFi (generates a local file).
- **Import child's data:** Import a previously exported JSON file to restore or migrate a profile. If the profile already exists on the device, the user chooses merge or replace. **Merge behavior:** imported data wins on conflicts (e.g., if a word's stats differ, the imported version is kept). New words/lists from the import are added. Existing words/lists not in the import file are preserved. This enables syncing progress across devices without losing work done on either side.
- Parent PIN required for add, delete, clear, and import (not for export — the child should be able to export their own data)
- Multiple profiles per device

#### 5.1.2 Visual Accessibility Settings
All configurable per profile:
- **Font size:** slider, range 16px–48px, default 24px
- **Font weight:** normal / bold / extra-bold
- **Font family:** choose from dyslexia-friendly options (OpenDyslexic, Lexie Readable, system sans-serif)
- **Letter spacing:** slider, range 0–0.3em, default 0.05em
- **Line height:** slider, range 1.2–2.5, default 1.6
- **Contrast mode:** light / dark / high-contrast
- **Background color:** preset options including cream, light blue, light green, pale yellow (research-backed for visual comfort) plus custom color picker
- **Reduced motion:** toggle (disables animations, transitions)
- **UI element size:** slider affecting button sizes, tap targets (minimum 48px per WCAG)
- **Word display duration:** how long the word shows before practice begins

#### 5.1.3 Word List Management
- **Manual entry:** Parent types words into a simple form
- **Camera capture (OCR):** Child or parent takes a photo of the paper word list
  - Tesseract.js runs locally for immediate (offline) extraction
  - Architecture supports hitting a Termux instance or remote server for enhanced accuracy when WiFi available
  - Always presents extracted words in an editable list for human review/correction
- **Import:** Paste a comma/newline-separated list; import from CSV or text file
- **Edit:** Add, remove, reorder words in any list
- **Schedule:** Set test date for each list (no fixed weekly pattern — dates vary). Test date can be updated anytime.
- **Archive:** Lists move to archive after test date. **All words from all lists remain in the lifetime review pool.** The goal is permanent mastery of every word the child has ever been assigned — old words never disappear, they just get reviewed at increasingly long intervals.

#### 5.1.4 Core Practice Session
- **Session start:** Child selects profile, sees encouraging greeting, taps "Start Practice"
- **Word selection algorithm:** Every session mixes new words and review words. The child should never only see new words or only see old words. Prioritization:
  1. **Trouble words** (difficultyScore > 0.7 from any list, past or present) — always included
  2. **Words due for spaced repetition review** from the lifetime word pool (see §5.1.6) — this includes words from all past lists, not just the current one
  3. **New words** from the current active list not yet attempted
  4. **Mastered words due for long-term maintenance review** — the expanding-interval words that keep long-term memory alive
  - **Session mix target:** roughly 60% current list words (new + reinforcing), 30% review from past lists, 10% long-term maintenance. These ratios shift as test day approaches (more current list) or when no active list exists (all review).
  - **Test day proximity boost:** As the test date approaches, current list words get higher priority. On the day before a test, the session focuses almost entirely on the current list with emphasis on words not yet mastered.
- **Primary technique (Phase 1): Letter Bank**
  - Word is spoken aloud (TTS)
  - Optional: image displayed (if cached)
  - Letter bank appears with the correct letters plus 3-5 distractors
  - Child taps letters to build the word
  - Letters are large (accessibility-aware sizing), high contrast, well-spaced
  - Correct letters snap into place with satisfying visual/audio feedback
  - Wrong letters bounce back with gentle audio cue
- **Audio support (layered):**
  1. Browser TTS (always available offline) — speaks the word and can speak individual syllables/phonemes
  2. Custom recorded audio (if parent/teacher has recorded for this word)
  3. Dictionary API pronunciation (fetched and cached when online)
  - "Hear it again" button always visible
  - "Sound it out" button breaks word into syllable chunks with pauses
- **On incorrect attempt:**
  - Encouraging message (never punitive): "Almost! Let's try sounding it out."
  - Phonics scaffolding activates: word breaks into colored syllable/pattern chunks
  - Each chunk is highlighted and spoken
  - Child retries with scaffolding visible
  - If still struggling after 2 attempts: show the correct answer with patterns highlighted, speak it slowly, move on (marked as "struggled" in stats)
- **Session flow:**
  - Default: 5-8 words per session (configurable)
  - Adaptive session length (see §5.1.5)
  - Mix of new words and review words
  - Session ends with summary: words practiced, stars earned, streak update
  - Celebration screen with theme-appropriate reward (see §5.1.7)

#### 5.1.5 Adaptive Session Management
- **Engagement detection signals:**
  - Response time trending up → fatigue/boredom
  - Error rate increasing → frustration
  - Consecutive errors → too hard
  - Very fast correct answers → too easy / not challenging
  - Session duration approaching child's historical tolerance
  - Abandonment (app backgrounded) → auto-save and gracefully end
- **Adaptive responses:**
  - Fatigue detected → "Great job! Let's do one more and celebrate!"
  - Frustration detected → Switch to easier word or provide more scaffolding
  - Too easy → Reduce scaffolding, remove letter bank distractors, switch to harder technique
  - Boredom detected → Switch technique, add surprise element from theme
- **Configurable ceiling:** Parent sets max session length (default: 10 minutes). App will never exceed this. App targets the child's demonstrated tolerance level, not the ceiling.
- **Minimum session:** At least 2 words attempted to count as a session for streak purposes

#### 5.1.6 Spaced Repetition System

Based on a modified SM-2 algorithm adapted for children, with these key research-backed principles:

- **Lifetime mastery goal:** The app maintains every word the child has ever been assigned, across all lists, past and present. The goal is that the child stays at mastery level on all historical words, not just the current list. Old words never "graduate out" — their review intervals simply expand as mastery deepens (days → weeks → months → semesters).
- **Short-term to long-term memory bridge:** New words are reviewed within 1 hour (if the child returns), then at 1 day, 3 days, 7 days, 14 days, 30 days
- **Bucket system:**
  - `new` → never attempted
  - `learning` → attempted but not yet reliably correct (0-2 consecutive correct)
  - `familiar` → getting it right but still needs reinforcement (3-4 consecutive correct)
  - `mastered` → reliably correct across multiple sessions (5+ consecutive correct across 3+ days)
  - `review` → mastered words in long-term maintenance
- **Fluidity:** Words can move in both directions. A mastered word that's missed drops back to `learning`. A trouble word that clicks can jump to `familiar`.
- **Difficulty score:** 0.0 (easy) to 1.0 (hard), computed from: error rate, average response time, times scaffolding was needed, recency of last error
- **Review scheduling:**
  - `learning` words: reviewed every session
  - `familiar` words: reviewed every 2-3 sessions
  - `mastered` words: reviewed on expanding intervals (7d → 14d → 30d → 60d)
  - `review` words: reviewed on expanding long-term intervals (60d → 90d → 120d → 180d). These words span the child's entire history — a word from September is still in the pool in March, just reviewed very infrequently.
  - Trouble words (difficultyScore > 0.7): injected into every session regardless of bucket
- **Per-word statistics tracked:**
  - Last asked timestamp
  - Times asked (total)
  - Times wrong
  - Times struggled but got right (needed scaffolding or multiple attempts)
  - Times easily right (correct on first attempt, fast response)
  - Current bucket
  - Next scheduled review date
  - Full technique history (which techniques were used, result of each)

#### 5.1.7 Reward System (Theme Engine — Phase 1 Foundation)

Phase 1 ships with 2-3 built-in themes. The architecture supports adding unlimited themes.

**Theme interface:**
```typescript
interface Theme {
  id: string;
  name: string;
  description: string;
  ageRange: string; // e.g., "6-9", "10-14"
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    success: string;
    error: string;
  };
  rewardMechanic: RewardMechanic;
  assets: ThemeAssets;
}

interface RewardMechanic {
  type: 'build' | 'hatch' | 'collect' | 'unlock' | 'grow';
  unitName: string; // "scales", "parts", "stars"
  milestoneNames: string[]; // ["Egg", "Hatching", "Baby Dragon", "Full Dragon"]
  progressPerCorrect: number;
  progressPerSession: number;
  weeklyGoalReward: string; // Description of weekly completion reward
}
```

**Phase 1 themes:**
1. **Dragon Forge** — Earn scales to build a dragon. Colors correspond to performance (gold = mastered, silver = familiar, bronze = learning). Dragon grows over the week. Fully built by test day if all words practiced. Wings of Fire inspired color palettes.
2. **Monster Lab** — Earn Plus-Plus style building blocks. Choose colors for each part. Assemble a unique creature. Inspired by Paul's Plus-Plus building.
3. **Star Trail** — Simple, universal. Earn stars, fill constellations. Good default for any age/interest.

**Reward triggers:**
- Each correct answer → small reward unit (1 scale/block/star)
- Completing a session → bonus reward (3 units)
- Daily streak maintained → streak bonus
- All words in a list mastered → major milestone (dragon evolves, monster completes, constellation finishes)
- Weekly goal met → special themed celebration

#### 5.1.8 Streak & Progress Tracking
- **Daily streak:** Counts consecutive days with at least one completed session
- **Weekly progress:** Visual tracker showing each day of the week (Mon-Sun or configurable), filled in when a session is completed
- **Streak recovery:** Missing one day doesn't fully reset — drops to "streak at risk" state. Missing two consecutive days resets. (Research shows harsh resets demotivate children.)
- **Bite-sized daily goal:** Configurable (default: 1 session or 5 minutes, whichever is less). Clearly communicated: "Just 5 minutes today!"
- **Progress visualization:** Per-word mastery shown as a simple bar or color (red → yellow → green), overall list completion percentage, trend over time

#### 5.1.9 Progress Dashboard (Accessible to Everyone)
- **No PIN required.** The child, parent, or anyone using the app can see progress. The dashboard is part of the main app experience, not hidden behind a parent gate.
- **At a glance:**
  - Current streak and weekly completion
  - Words mastered vs. learning vs. struggling (for the active list)
  - Session history (when, how long, how many words)
- **Test Readiness Indicator:**
  - Prominently displayed when an active list has a test date set
  - Simple, child-friendly visualization: e.g., a forge temperature gauge from cold (not ready) to white-hot (fully ready)
  - Computed from: percentage of current list words in `mastered` or `familiar` buckets, trend direction (improving or slipping), and time until test
  - Readiness levels: "Keep forging!" (< 50%), "Getting warmer!" (50-75%), "Almost there!" (75-90%), "Ready to crush it!" (90%+)
  - Tapping the indicator shows which specific words still need work
- **Lifetime Word Health:**
  - Beyond the current list, show overall mastery across all words the child has ever had
  - Simple summary: "Paul has mastered 87 of 102 lifetime words" with a breakdown by bucket
  - Highlight any old words that have slipped (due for review and recently missed)
- **Per-word detail:**
  - Tap any word to see full history: attempts, errors, techniques used, bucket, next review
- **Settings access:** Word list management, theme selection, and profile settings remain behind the parent PIN
- **Feedback button:** "Send Feedback to Developer" (see §5.1.10)

#### 5.1.10 Parent Feedback System
- Simple in-app form: text field + optional screenshot + auto-captured device info and app version
- Stored in syncQueue when offline
- When WiFi available, submitted to a lightweight endpoint:
  - **Phase 1:** Google Form submission (zero infrastructure, works immediately)
  - **Phase 2+:** Endpoint that auto-creates a GitHub issue via GitHub API (transparent to parent — they never see Git)
- Parent sees: "Thanks! Your feedback has been sent." (or "Saved — will send when connected.")

#### 5.1.11 PWA & Installation
- Full PWA with service worker (Workbox via vite-plugin-pwa)
- Installable on Amazon Fire (via Silk browser), Android Chrome, iOS Safari
- App manifest with SpellForge branding, icons, theme color
- Offline capability: entire app shell cached, all learning data local
- "Add to Home Screen" prompt on first visit
- QR code on landing page for easy sharing: parent scans, installs, creates profile

---

### Phase 2: Adaptive Intelligence

**Goal:** The app learns which techniques work best for each child and each word, and automatically leads with the most effective approach.

#### 5.2.1 Expanded Technique Library
Beyond the letter bank, add:
- **Audio-first:** Hear the word, type it (no letter bank, full keyboard)
- **Syllable builder:** Word is broken into syllable chunks; child assembles syllables in order
- **Pattern spotlight:** Highlight the tricky pattern in the word (e.g., the "igh" in "knight"), then practice just that pattern across multiple words
- **Multiple choice:** Show 3-4 spellings, child picks the correct one (good for visual recognition)
- **Missing letters:** Word shown with blanks for the hard parts; child fills in only the tricky letters
- **Memory flash:** Show the word for a few seconds, hide it, child types from memory
- **Sentence context:** Word used in a sentence with a blank; child hears the sentence and fills in the word
- **Word building:** Start from the root/base word, add prefixes/suffixes

#### 5.2.2 Adaptive Technique Engine
- Each word × child pair tracks: which technique was used, whether the child got it right, response time, and whether scaffolding was needed
- Over time, the system builds a **technique effectiveness profile** per child:
  - "Paul learns visual-pattern words best with syllable builder"
  - "Paul gets phonetically-regular words right fastest with audio-first"
  - "Pattern spotlight works best for words with unusual graphemes"
- **Selection algorithm:** For each word in a session, pick the technique most likely to lead to success based on:
  1. Child's overall technique effectiveness profile
  2. This specific word's pattern characteristics
  3. This word's history with this child
  4. Variety (don't use the same technique 5 times in a row)
- **Fallback cascade:** If the selected technique leads to failure, automatically fall back to more scaffolded techniques (e.g., audio-first → syllable builder → letter bank)

#### 5.2.3 Enhanced Phonics Engine
- Expanded pattern database covering all common English phonics rules
- Pattern difficulty scoring per child (some kids struggle with vowel teams, others with silent letters)
- Cross-word pattern grouping: "You got 'night' right — 'light', 'sight', and 'flight' use the same pattern!"
- Mnemonic suggestions for hard patterns (extensible, community-contributed)

#### 5.2.4 Enhanced Image Support
- Images auto-fetched from Unsplash/Pexels/Pixabay API when online
- Cached in IndexedDB for offline use
- Parent can override with custom image upload per word
- Image shown during word introduction and as a hint option during practice

#### 5.2.5 Sync & Backup
- Optional account creation (email-based, lightweight) for cross-device sync
- Data export/import as JSON (manual backup without account)
- Sync strategy: last-write-wins with conflict detection for multi-device scenarios
- All sync is additive/non-destructive — never deletes local data without confirmation

---

### Phase 3: Community & Customization

**Goal:** Other families can use SpellForge with their own children. Themes, word lists, and phonics data become community-shareable.

#### 5.3.1 Theme Builder
- In-app theme creator: pick colors, reward mechanic type, name your units
- Theme sharing: export as JSON, share via link/QR
- Theme marketplace (curated): browse and install community themes
- Example community themes: "Makeup Studio" (earn products, build looks), "Sports Arena" (earn trophies), "Space Explorer" (visit planets), "Garden" (grow plants)

#### 5.3.2 Shared Word Lists
- Export word lists as shareable links or QR codes
- Import community word lists by grade level, curriculum, or subject
- Teacher integration: teacher shares a link, all parents in the class import the same list
- Word list format: JSON with optional phonics annotations, images, and schedule

#### 5.3.3 GitHub Issue Automation for Feedback
- Lightweight serverless function (GitHub Actions or Cloudflare Worker)
- Parent submits feedback → function creates a GitHub issue with:
  - Feedback text
  - Device info (OS, browser, screen size)
  - App version
  - Optional screenshot
  - Auto-labels: "user-feedback", priority guess based on keywords
- Parent never sees GitHub — the experience is "Send Feedback" → "Thanks!"

#### 5.3.4 Advanced Dashboard & Insights
- Multi-child comparison view (parent PIN required for cross-profile data)
- Learning style insights: "Paul is a visual-pattern learner. He masters words 2x faster with syllable builder."
- Suggested home activities based on struggling patterns
- Lifetime mastery trends: graph of total words mastered over months
- Export progress report as PDF (for sharing with teachers)
- Print-friendly weekly summary

#### 5.3.5 Teacher Mode (Stretch)
- Teacher creates a class, shares join code
- Assigns word lists with due dates to entire class
- Sees anonymized class-level progress (which words are hardest for the class)
- No student data shared between families — teacher sees only aggregate stats unless parent opts in

---

### Phase 4: Advanced Learning & Beyond Spelling

**Goal:** SpellForge becomes a general-purpose adaptive learning tool.

#### 5.4.1 Beyond Spelling
- Vocabulary mode: definitions, usage in context, synonyms
- Reading comprehension tie-ins: words from books the child is reading
- Grammar patterns: homophones (their/there/they're), contractions, possessives
- Math facts mode (same adaptive engine, different content type)

#### 5.4.2 AI-Powered Features (Optional, Requires Connectivity)
- AI-generated practice sentences using the child's interests ("The dragon breathed fire on the knight's *shield*.")
- AI analysis of error patterns: "Paul consistently transposes 'ei' and 'ie' — here's a focused mini-lesson"
- Natural language feedback for parents: weekly AI-generated summary email

#### 5.4.3 Accessibility Expansion
- Screen reader full support (ARIA labels throughout)
- Voice input: child speaks the spelling aloud, app evaluates via speech recognition
- Switch access / alternative input for children with motor challenges
- Multilingual support: ESL spelling, bilingual word lists

---

## 6. Phonics Engine Deep Dive

### 6.1 Pattern Categories

| Category | Examples | Hint Style |
|----------|----------|------------|
| Short vowels | cat, bed, sit, hot, cup | "a says /æ/ like in 'apple'" |
| Long vowels (silent-e) | cake, bike, home, cute | "silent e makes the vowel say its name" |
| Vowel teams | rain, sea, boat, pie, blue | "when two vowels go walking, the first one does the talking" |
| R-controlled | car, her, bird, for, burn | "r changes the vowel sound" |
| Consonant digraphs | sh, ch, th, wh, ph, ck | "two letters, one sound" |
| Consonant blends | bl, cr, str, spl, -nd, -nk | "blend the sounds together" |
| Silent letters | knight, write, lamb, psalm | "this letter is silent — it's hiding!" |
| Double consonants | rabbit, butter, happy | "double letters, one sound" |
| Suffixes | -tion, -sion, -ness, -ment, -ly, -ful | "word endings with their own sounds" |
| Prefixes | un-, re-, pre-, dis-, mis- | "word beginnings that change meaning" |
| Irregular | said, does, their, people, through | "tricky words — your brain just has to remember these" |

### 6.2 Word Decomposition Pipeline

```
Input: "knight"
→ Syllable split: ["knight"] (1 syllable)
→ Phoneme mapping: k(silent) - n - igh(/aɪ/) - t
→ Pattern detection: ["silent-k", "igh-vowel-team"]
→ Difficulty flags: silent letter + unusual vowel team = high difficulty
→ Scaffolding strategy: highlight silent 'k', show 'igh' pattern family
→ Hint: "The 'k' is silent — you can't hear it! And 'igh' says 'eye' like in 'light'."
```

### 6.3 Implementation

Phase 1 ships with a static JSON rules file (~200 patterns covering grades 1-5 vocabulary). The engine is a pure TypeScript module with no external dependencies:

```typescript
interface PhonicsResult {
  syllables: string[];
  phonemes: Phoneme[];
  patterns: DetectedPattern[];
  difficultyScore: number;
  scaffoldingHints: string[];
  relatedWords: string[]; // words sharing the same patterns
}

function analyzeWord(word: string): PhonicsResult;
function getPatternFamily(pattern: string): string[]; // e.g., "igh" → ["light", "night", "right", ...]
function generateHint(pattern: DetectedPattern): string;
```

---

## 7. Visual Accessibility Deep Dive

### 7.1 Double Vision Considerations

Until the eye doctor provides specific guidance, the app ships with these conservative defaults and full configurability:

- **Large default font size** (24px body, 32px+ for spelling words)
- **High letter spacing** (0.05em default, adjustable to 0.3em)
- **Bold font weight** by default for spelling words
- **High contrast** between text and background
- **Solid, non-patterned backgrounds** (patterns can exacerbate double vision)
- **No parallax or complex motion** (reduced motion ON by default)
- **Large tap targets** (minimum 48px, configurable up to 72px)
- **Single-column layout** — no side-by-side content that requires eye tracking across the screen
- **Word display:** centered, large, isolated (no clutter around the target word)
- **Letter bank:** letters widely spaced, large, with clear borders

### 7.2 Research-Backed Background Colors

Configurable presets:
- **Cream/Warm white** (#FFF8E7) — reduces glare vs pure white
- **Light blue** (#E6F0FF) — some studies suggest benefit for visual stress
- **Light green** (#E8F5E9) — calming, reduces eye strain
- **Pale yellow** (#FFFDE7) — commonly recommended for dyslexia overlays
- **Custom** — full color picker

### 7.3 Post-Diagnosis Adjustment

After the eye doctor visit, the parent can:
- Adjust all settings via the accessibility panel
- Save as a preset ("Paul's settings") for quick switching
- The app remembers per-profile settings independently

---

## 8. Session UX Flow

### 8.1 Daily Flow (Child's Perspective)

```
1. Open SpellForge → See profile selection (if multiple kids)
2. Tap profile → Greeting: "Welcome back, Paul! 🔥 3-day streak!"
3. See today's progress: "4 words to practice today. Ready to forge?"
4. Tap "Start Forging" → Session begins
5. Word announced (TTS): "Your word is: KNIGHT"
   - Image shown (if available): picture of a knight
   - Letter bank appears: K, N, I, G, H, T + distractors (S, R, E)
6. Child taps letters to spell → immediate feedback per letter
7. Correct! → Scale/block/star earned, satisfying animation + sound
   - OR incorrect → encouraging prompt, phonics scaffolding activates
8. After 5-8 words (or adaptive cutoff): "Amazing work! You forged 6 words!"
9. Reward screen: dragon gained 6 new scales, streak badge
10. Return to home → "See you tomorrow! 🔥 Keep the streak alive!"
```

### 8.2 List Cycle Flow (Parent or Child)

```
Day 1: New word list arrives (any day of the week)
  → Enter words (photo, type, or import) → set test date
  → App calculates pacing: words to introduce per day based on days until test

Daily: Paul practices (5-10 min)
  → Session mixes new words from current list + review from lifetime pool
  → Dashboard shows test readiness gauge and lifetime word health
  → Old words from past lists surface for review at spaced intervals

Day before test: App nudges a focused review session
  → Readiness indicator prominent: "3 words still need work — let's forge!"
  → Session prioritizes current list words not yet mastered

After test: List archived, words join lifetime review pool
  → No "weekend off" — review words still surface at their scheduled intervals
  → Between lists (no active test): sessions are 100% review/maintenance
```

---

## 9. Non-Functional Requirements

### 9.1 Performance
- App shell loads in < 2 seconds on Amazon Fire tablet
- Interaction latency < 100ms for letter taps and feedback
- IndexedDB operations < 50ms for typical queries
- Service worker caches all app assets; subsequent loads are instant offline

### 9.2 Compatibility
- **Amazon Fire tablets** (Silk browser): primary target, tested thoroughly
- **Android** (Chrome): fully supported
- **iOS** (Safari): fully supported with PWA limitations (no push notifications)
- **Desktop browsers:** functional but not primary target

### 9.3 Data Safety
- All child data stored locally on device only (Phase 1)
- No accounts, no cloud storage, no tracking in Phase 1
- Parent PIN protects settings (not encryption-level security — it's a kid's spelling app)
- Data export available for manual backup (JSON download)
- Phase 2 optional sync uses parent's own account, data stays in their control

### 9.4 Accessibility (WCAG 2.1 AA Target)
- All interactive elements have ARIA labels
- Keyboard navigable (for desktop use)
- Color is never the only indicator — always paired with text/icon
- Minimum contrast ratio 4.5:1 (7:1 in high-contrast mode)
- Touch targets minimum 48x48px

---

## 10. Testing Strategy: BDD from Day One

### 10.1 Philosophy

Every feature is specified as Gherkin scenarios **before** implementation begins. These scenarios serve three purposes: they are the acceptance criteria for the feature, the living documentation of how the app behaves, and the automated test suite that prevents regressions. No feature ships without green scenarios.

**Iron rule: every bug fix includes a regression test.** When a bug is found, the first step is writing a failing scenario (or step-level test) that reproduces it. The fix is not complete until that test passes and is committed alongside the fix. This ensures bugs never come back.

### 10.2 Tooling

| Tool | Role |
|------|------|
| Vitest | Test runner (fast, Vite-native, watch mode) |
| vitest-cucumber | Gherkin feature file execution in Vitest |
| React Testing Library | Component-level BDD steps (render, interact, assert) |
| Playwright | E2E scenarios for critical flows (install PWA, complete session, offline mode) |
| fake-indexeddb | In-memory IndexedDB for fast data layer tests |

### 10.3 Test Layers

```
┌──────────────────────────────────────────┐
│  E2E Scenarios (Playwright)              │
│  "Parent creates a word list and child   │
│   completes a practice session"          │
├──────────────────────────────────────────┤
│  Feature Scenarios (vitest-cucumber)     │
│  Gherkin .feature files → step defs      │
│  One .feature file per feature module    │
├──────────────────────────────────────────┤
│  Unit Tests (Vitest)                     │
│  Pure logic: phonics engine, spaced rep, │
│  adaptive algorithm, technique selector  │
└──────────────────────────────────────────┘
```

**Feature scenarios** are the primary layer. They exercise the logic through the same interfaces the UI uses, but without rendering React components (fast, deterministic). **E2E scenarios** cover the critical happy paths and offline behavior — fewer in number, run in CI. **Unit tests** cover pure algorithmic modules (phonics engine, spaced repetition math) where Gherkin would be unnecessarily verbose.

### 10.4 Directory Structure

```
tests/
├── features/                    # Gherkin .feature files
│   ├── practice-session.feature
│   ├── word-list-management.feature
│   ├── spaced-repetition.feature
│   ├── adaptive-session.feature
│   ├── phonics-engine.feature
│   ├── profile-management.feature
│   ├── streak-tracking.feature
│   ├── rewards.feature
│   ├── ocr-import.feature
│   ├── accessibility.feature
│   └── offline-mode.feature
├── steps/                       # Step definitions
│   ├── practice.steps.ts
│   ├── word-list.steps.ts
│   ├── spaced-rep.steps.ts
│   ├── adaptive.steps.ts
│   ├── phonics.steps.ts
│   ├── profile.steps.ts
│   ├── streak.steps.ts
│   ├── rewards.steps.ts
│   ├── ocr.steps.ts
│   ├── accessibility.steps.ts
│   └── offline.steps.ts
├── e2e/                         # Playwright E2E tests
│   ├── full-session.spec.ts
│   ├── pwa-install.spec.ts
│   └── offline-practice.spec.ts
├── unit/                        # Pure logic unit tests
│   ├── phonics-engine.test.ts
│   ├── spaced-rep.test.ts
│   ├── adaptive-engine.test.ts
│   └── difficulty-score.test.ts
└── fixtures/                    # Shared test data
    ├── word-lists.ts
    ├── profiles.ts
    └── session-histories.ts
```

### 10.5 Example Feature Scenarios

#### Practice Session

```gherkin
Feature: Core practice session
  As a child practicing spelling
  I want to build words from a letter bank
  So that I can learn my weekly spelling words

  Background:
    Given a profile "Paul" exists
    And the active word list contains "knight", "bridge", "light"
    And the theme is "Dragon Forge"

  Scenario: Correct spelling on first attempt
    Given the session presents the word "light"
    And the word is spoken aloud via TTS
    When Paul taps the letters L, I, G, H, T in order
    Then the word is marked as "easily right"
    And a reward of 1 scale is earned
    And a success animation plays

  Scenario: Incorrect attempt triggers phonics scaffolding
    Given the session presents the word "knight"
    When Paul taps the letters N, I, G, H, T
    Then the attempt is marked incorrect
    And an encouraging message is displayed
    And the word is broken into phonics chunks: "kn" + "igh" + "t"
    And each chunk is highlighted and spoken
    And Paul can retry with scaffolding visible

  Scenario: Two failed attempts shows the answer
    Given the session presents the word "knight"
    And Paul has failed 2 attempts
    Then the correct spelling is displayed with patterns highlighted
    And the word is spoken slowly
    And the word is marked as "wrong"
    And the session moves to the next word

  Scenario: Session adapts when frustration is detected
    Given Paul has answered 3 words with increasing response times
    And the last 2 answers were incorrect
    Then the session offers an easier word
    And the scaffolding level increases
    And the session prepares to wrap up with a success
```

#### Spaced Repetition

```gherkin
Feature: Spaced repetition scheduling
  As the learning engine
  I want to schedule word reviews at optimal intervals
  So that words move from short-term to long-term memory

  Scenario: New word enters the learning bucket after first attempt
    Given a word "bridge" with no prior history
    When Paul attempts "bridge" and gets it right
    Then the word moves to the "learning" bucket
    And the next review is scheduled within 1 day

  Scenario: Mastered word drops back on incorrect answer
    Given the word "light" is in the "mastered" bucket
    When Paul attempts "light" and gets it wrong
    Then the word moves to the "learning" bucket
    And the next review is scheduled for the next session

  Scenario: Trouble words appear every session
    Given the word "knight" has a difficulty score above 0.7
    Then "knight" is included in every practice session
    Regardless of its scheduled review date

  Scenario: Mastered words expand review intervals
    Given the word "bridge" is in the "mastered" bucket
    And it was last reviewed 7 days ago
    When Paul gets "bridge" right
    Then the next review is scheduled for 14 days from now
```

#### Word Selection & Session Mix

```gherkin
Feature: Session word selection mixes new and review words
  As the learning engine
  I want every session to include both new and review words
  So that the child builds new knowledge while maintaining old

  Background:
    Given a profile "Paul" exists
    And the active list "Week 12" has test date in 4 days
    And "Week 12" contains 15 words, 8 not yet attempted
    And Paul has 85 lifetime words from past lists

  Scenario: Normal session mixes current and review words
    When the session selects 8 words to practice
    Then at least 4 words are from the current list "Week 12"
    And at least 1 word is a review from a past list
    And trouble words from any list are included regardless of source

  Scenario: Day before test prioritizes current list
    Given the test date for "Week 12" is tomorrow
    When the session selects 8 words to practice
    Then at least 6 words are from the current list "Week 12"
    And words not yet mastered from "Week 12" are prioritized first

  Scenario: No active list means pure review session
    Given there is no active list with a future test date
    When the session selects 8 words to practice
    Then all words are drawn from the lifetime review pool
    And words due for spaced repetition review are prioritized
    And the session greeting says "Let's keep your skills sharp!"

  Scenario: Old mastered word surfaces for long-term review
    Given the word "because" was mastered 58 days ago
    And its next review is scheduled for today
    When the session selects words
    Then "because" is included in the session
```

#### Test Readiness

```gherkin
Feature: Test readiness indicator
  As a child or parent
  I want to see how ready I am for the upcoming test
  So that I know where to focus my practice

  Background:
    Given a profile "Paul" exists
    And the active list "Week 12" has 15 words with test date in 2 days

  Scenario: Low readiness
    Given 4 of 15 words are in "mastered" or "familiar" buckets
    Then the readiness indicator shows "Keep forging!"
    And the readiness level is below 50%
    And the indicator highlights the 11 words that need work

  Scenario: High readiness
    Given 14 of 15 words are in "mastered" or "familiar" buckets
    Then the readiness indicator shows "Ready to crush it!"
    And the readiness level is above 90%

  Scenario: Readiness visible without parent PIN
    Given Paul is viewing the dashboard
    And no parent PIN has been entered
    Then the test readiness indicator is visible
    And the lifetime word health summary is visible
    And the streak and session history are visible

  Scenario: Lifetime word health shows old words needing review
    Given Paul has 85 lifetime words
    And 3 previously mastered words have slipped to "learning"
    Then the lifetime summary shows "82 of 85 words mastered"
    And the 3 slipped words are highlighted as needing review
```

#### Phonics Engine

```gherkin
Feature: Phonics word decomposition
  As the phonics engine
  I want to break words into learnable sound patterns
  So that children can sound out unfamiliar words

  Scenario: Silent letter detection
    When the engine analyzes "knight"
    Then the syllables are ["knight"]
    And the patterns include "silent-k" and "igh-vowel-team"
    And the hint includes "The 'k' is silent"

  Scenario: Suffix detection
    When the engine analyzes "nation"
    Then the patterns include "tion-suffix"
    And the hint includes "tion says 'shun'"

  Scenario: Related words by pattern
    When the engine looks up the pattern family for "igh"
    Then the results include "light", "night", "right", "sight"
```

#### Profile Management

```gherkin
Feature: Profile lifecycle management
  As a parent
  I want to manage child profiles
  So that I can add, remove, and maintain data for each child

  Scenario: Add a new child profile
    Given the parent has entered the PIN
    When the parent creates a profile with name "Paul"
    And selects the "Dragon Forge" theme
    Then a profile "Paul" exists with default settings
    And the profile has no word lists or stats
    And "Paul" appears on the profile selection screen

  Scenario: Delete a child profile requires confirmation
    Given a profile "Paul" exists with 102 lifetime words and 45 sessions
    And the parent has entered the PIN
    When the parent chooses to delete "Paul"
    Then a confirmation dialog warns that all progress will be permanently deleted
    And the parent must type "Paul" to confirm
    When the parent types "Paul" and confirms
    Then the profile "Paul" no longer exists
    And all associated word lists, stats, and session history are deleted

  Scenario: Clear a child's data preserves profile and lists
    Given a profile "Paul" exists with 102 lifetime words across 8 lists
    And Paul has 45 sessions of history and a 12-day streak
    And the parent has entered the PIN
    When the parent chooses to clear Paul's learning data
    And confirms the action
    Then Paul's profile and settings are preserved
    And Paul's 8 word lists are preserved
    And all word stats are reset to "new" bucket
    And session history is cleared
    And streak is reset to 0

  Scenario: Export a child's data
    Given a profile "Paul" exists with word lists and stats
    When Paul or a parent taps "Export Data"
    Then a JSON file is downloaded containing:
      | Data | Included |
      | Profile settings | yes |
      | Word lists | yes |
      | All word stats | yes |
      | Session history | yes |
      | Streak data | yes |
      | Technique history | yes |
    And no parent PIN is required

  Scenario: Import a child's data to a new device
    Given the parent has entered the PIN
    And the parent has an exported JSON file from another device
    And no profile with that name exists on this device
    When the parent imports the file
    Then a new profile is created with the imported settings
    And all word lists and stats are restored
    And the streak data is restored
    And the child can continue practicing where they left off

  Scenario: Import with merge into existing profile (import wins)
    Given a profile "Paul" exists on this device
    And Paul has the word "bridge" marked as "familiar" with 5 attempts
    And Paul has the word "castle" marked as "mastered"
    And the imported file has "bridge" marked as "mastered" with 8 attempts
    And the imported file has a new word "throne" not on this device
    And the imported file does not contain "castle"
    When the parent imports the file and chooses "Merge"
    Then "bridge" is updated to "mastered" with 8 attempts (import wins)
    And "castle" is preserved as "mastered" (not in import, kept)
    And "throne" is added as a new word with imported stats
    And Paul's settings are updated to match the imported file

  Scenario: Import with replace overwrites everything
    Given a profile "Paul" exists on this device with 50 lifetime words
    And the imported file has 30 words
    When the parent imports the file and chooses "Replace"
    Then Paul's profile is reset to match the imported file exactly
    And only the 30 imported words exist
    And a confirmation warned that 20 words would be lost
```

#### Bug Fix Regression (Example Pattern)

```gherkin
Feature: Regression — streak not counting minimum sessions
  # Bug #42: Streak incremented even when session had 0 words attempted
  # (child opened app and immediately closed it)

  Scenario: Session with zero words does not count for streak
    Given Paul has a 3-day streak
    And Paul opens a session
    When Paul closes the session before attempting any words
    Then the streak remains at 3
    And the session is logged with endReason "user-quit"
    And the session does not count toward daily progress

  Scenario: Session with one word counts for streak
    Given Paul has a 3-day streak
    And Paul opens a session
    When Paul attempts at least 1 word
    And closes the session
    Then the streak updates to 4
```

### 10.6 BDD Workflow

```
1. Feature request or bug report arrives
2. Write Gherkin scenarios (.feature file)
   — For new features: scenarios ARE the acceptance criteria
   — For bugs: scenario reproduces the bug (must fail before fix)
3. Implement step definitions
4. Run scenarios → watch them fail (red)
5. Implement the feature / fix the bug
6. Run scenarios → watch them pass (green)
7. Refactor as needed (scenarios stay green)
8. PR includes: .feature file + steps + implementation
   — PRs without scenarios for new behavior are not mergeable
   — Bug fix PRs without a regression scenario are not mergeable
```

### 10.7 CI Pipeline

```yaml
# .github/workflows/test.yml
name: SpellForge CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test:unit          # Vitest unit tests
      - run: npm run test:features      # vitest-cucumber BDD scenarios
      - run: npm run test:e2e           # Playwright E2E (critical paths only)
      - run: npm run lint
      - run: npm run typecheck
```

### 10.8 Coverage Expectations

| Layer | Coverage Target | Rationale |
|-------|----------------|-----------|
| Core logic (phonics, spaced-rep, adaptive) | 90%+ | Pure algorithms, easy to test, critical correctness |
| Feature scenarios | Every user-facing behavior has a scenario | Living documentation |
| E2E | Critical happy paths + offline mode | Slow to run, high confidence |
| Bug regressions | 100% — every fix has a test | Non-negotiable |

---

## 11. Success Metrics

### For Paul (and any individual child)
- Spelling test scores improve over 4 weeks of consistent use
- Session completion rate > 80% (sessions started vs. finished without abandonment)
- Average daily usage: 5-10 minutes (not more — bite-sized is the goal)
- Streak maintenance: 4+ days/week average
- Word mastery rate: 70%+ of weekly words reach "mastered" bucket by test day

### For the Product
- PWA installs from QR code: track via analytics (privacy-respecting)
- Feedback submissions per month
- Number of active profiles
- Theme diversity: community themes created

---

## 12. Tech Debt & Architecture Notes

### 12.1 Module Boundaries

The codebase is organized for independent development and testing:

```
src/
├── core/
│   ├── phonics/          # Phonics engine (pure TS, no React deps)
│   ├── spaced-rep/       # Spaced repetition algorithm
│   ├── adaptive/         # Session adaptation logic
│   └── technique/        # Technique selection engine (Phase 2)
├── data/
│   ├── db.ts             # Dexie.js schema and migrations
│   ├── sync.ts           # Sync manager
│   └── models/           # TypeScript interfaces
├── features/
│   ├── practice/         # Practice session UI
│   ├── word-lists/       # Word list management
│   ├── profiles/         # Profile CRUD
│   ├── dashboard/        # Parent dashboard
│   ├── rewards/          # Reward system + theme rendering
│   ├── onboarding/       # First-run experience
│   └── feedback/         # Feedback form
├── themes/
│   ├── dragon-forge/
│   ├── monster-lab/
│   └── star-trail/
├── accessibility/
│   ├── settings.ts       # Accessibility state management
│   └── hooks.ts          # useAccessibility() hook
├── ocr/
│   ├── local.ts          # Tesseract.js wrapper
│   └── remote.ts         # Server fallback
├── audio/
│   ├── tts.ts            # Web Speech API wrapper
│   ├── dictionary.ts     # Dictionary API audio fetch
│   └── custom.ts         # Custom recording playback
tests/
├── features/             # Gherkin .feature files (one per feature module)
├── steps/                # Step definitions (one per .feature file)
├── e2e/                  # Playwright E2E specs (critical paths)
├── unit/                 # Pure logic unit tests (phonics, spaced-rep, adaptive)
└── fixtures/             # Shared test data (word lists, profiles, session histories)
```

### 12.2 Key Design Decisions Log

| Decision | Choice | Rationale | Revisit When |
|----------|--------|-----------|--------------|
| Framework | React + TypeScript | Familiarity, ecosystem, PWA maturity | Never (unless Svelte PWA story matures significantly) |
| Local DB | Dexie.js (IndexedDB) | Proven, structured, offline-first, works on Fire tablets | If query complexity demands SQLite |
| Hosting | GitHub Pages | Free, simple, fits static PWA | If server-side features needed (Phase 3+) |
| OCR | Tesseract.js local-first | Offline capability, no server cost | If accuracy is insufficient — add server fallback |
| TTS | Web Speech API primary | Free, offline, no dependencies | If quality is poor on Fire tablets — test early |
| Spaced repetition | Modified SM-2 | Well-researched, adaptable | If children's learning patterns diverge significantly from SM-2 assumptions |
| Testing | BDD (Gherkin + vitest-cucumber) from day one | Living docs, acceptance criteria as code, prevents regressions | Never — this is a core practice |
| Bug fix policy | Every fix must include a regression test | Bugs that come back erode trust and waste time | Never — non-negotiable |

### 12.3 Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Fire tablet Silk browser PWA support is limited | High | Test early on actual device. Fallback: sideload via APK wrapper (TWA) |
| Tesseract.js OCR accuracy on handwritten word lists | Medium | Always show editable results. Phase 2: server fallback for better accuracy |
| Web Speech API voice quality varies by device | Medium | Layer with dictionary API audio. Allow custom recordings. |
| IndexedDB storage limits on Fire tablets | Low | Monitor usage. Typical spelling app data is <10MB. Warn at 80% capacity. |
| Child fatigue from double vision not adequately addressed by settings alone | High | Build maximum configurability. Defer to eye doctor guidance. Be prepared to add specialized display modes post-diagnosis. |

---

## 13. Development Roadmap

### Phase 1: MVP (Weeks 1-6)
- Week 1-2: Project setup (Vite + React + Vitest + vitest-cucumber + Playwright), data model, profile management, accessibility settings. **Write feature files for profiles and accessibility before implementing.**
- Week 2-3: Word list management (manual + import), phonics engine v1. **Phonics engine developed test-first with Gherkin scenarios for every pattern category.**
- Week 3-4: Core practice session (letter bank), audio (TTS), basic reward system. **Practice session .feature file is the acceptance criteria.**
- Week 4-5: Spaced repetition, streak tracking, parent dashboard. **Spaced rep algorithm developed test-first with unit tests + scenarios covering all bucket transitions.**
- Week 5-6: OCR (Tesseract.js), PWA setup, Fire tablet testing, QR sharing. **E2E suite covers: install PWA, complete session, offline practice.**
- **Deliverable:** Paul can practice spelling on his Fire tablet. All features have passing BDD scenarios.

### Phase 2: Adaptive Intelligence (Weeks 7-12)
- Expanded technique library (audio-first, syllable builder, pattern spotlight, etc.)
- Adaptive technique engine (build on Phase 1 tracking data)
- Enhanced phonics engine with expanded pattern database
- Image auto-fetch and caching
- Optional sync/backup
- **Deliverable:** App automatically adapts to each child's learning style

### Phase 3: Community & Customization (Weeks 13-18)
- Theme builder and sharing
- Word list sharing
- GitHub issue automation for feedback
- Advanced parent dashboard with insights and PDF export
- **Deliverable:** Other families can use and customize SpellForge

### Phase 4: Beyond Spelling (Weeks 19+)
- Vocabulary mode, grammar, reading comprehension hooks
- AI-powered features (optional, requires connectivity)
- Voice input (speech-to-text spelling)
- Teacher mode
- **Deliverable:** SpellForge becomes a general adaptive learning platform

---

## 14. Open Questions

1. **Fire tablet PWA support:** Need to test Silk browser's service worker and IndexedDB support early. If insufficient, consider a TWA (Trusted Web Activity) wrapper.
2. **Eye doctor results:** May require specialized display modes beyond current accessibility settings. Design the settings system to be easily extensible.
3. **TTS quality on Fire:** Web Speech API quality varies significantly by device/browser. Need early testing on Paul's actual tablet.
4. **Phonics engine scope:** Phase 1 covers ~200 patterns. Is this sufficient for 3rd grade vocabulary? May need to expand based on Paul's actual word lists.
5. **Image API selection:** Unsplash has good quality but requires attribution. Pixabay is CC0. Need to evaluate which returns useful images for elementary vocabulary words (many spelling words are abstract — "because", "through" — and don't have obvious images).
6. **Feedback endpoint:** Google Forms for Phase 1 is zero-infrastructure but limited. When to invest in the GitHub issue automation?

---

*This is a living document. Update as decisions are made, the eye doctor provides guidance, and Paul starts using the app.*
