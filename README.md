# SpellForge

An offline-first spelling app that helps kids learn through adaptive techniques, spaced repetition, mini-games, and rewards they actually care about.

Built for children like Paul — a 3rd grader with double vision who loves creature-building games — but architected to be customizable for any child with any interests.

## Philosophy

1. **Help children hack themselves** — track what works for each child, adapt automatically
2. **Never end in frustration** — gracefully wrap sessions, scaffold struggles, celebrate wins
3. **Offline first, better with WiFi** — core learning works without connectivity
4. **Visual accessibility as default** — every parameter tunable for individual needs
5. **Themes decouple from learning** — dragons, monsters, stars — pick what motivates your child

## Features

### Learning Engine

- **Letter-hiding progression** — four stages that gradually remove scaffolding, from full word display to typing from memory
- **Input modes** — scrambled letter bank (tap to build) and keyboard input as skills advance
- **Phonics analysis** — breaks words into syllables, phonemes, and grapheme-phoneme mappings; detects patterns like silent-e, vowel teams, and consonant digraphs
- **Phonics scaffolding** — on struggle, words break into colored syllable chunks with audio cues and hints
- **Spaced repetition** — SM-2 algorithm adapted for children with expanding review intervals
- **Difficulty scoring** — per-word difficulty (0.0–1.0) based on error rate, response time, and scaffolding needs
- **Word bucketing** — tracks words through states: `new` → `learning` → `familiar` → `mastered` → `review`
- **Smart word mix** — ~60% current list, ~30% review, ~10% long-term maintenance
- **Test-day boost** — shifts mix toward current list words as test date approaches

### Engagement Detection

- Detects **fatigue** (increasing response times) and wraps sessions gracefully
- Detects **frustration** (high error rate) and provides scaffolding or easier words
- Detects **boredom** (too-fast answers) and increases difficulty
- Respects configurable max session duration (1–15 minutes)

### Practice and Games

- **Letter bank** — tap letters to build words
- **Letter Invasion** — spell words as letters invade the screen
- **Word Volcano** — words erupt and you spell them before they cool
- **Spell Catcher** — catch and spell words in motion
- **Word Relay Race** — relay-style spelling challenges
- **Word Search** — find spelling words hidden in a grid
- **Quiz mode** — focused assessment for test prep

### Coin Economy

- Earn coins by mastering words
- Spend coins to unlock premium mini-games
- Some games available for free, others require coins
- Tracked per profile

### Themes and Rewards

- **Dragon Forge** — earn scales to build a dragon (Wings of Fire inspired)
- **Monster Lab** — earn building blocks for creature assembly (Plus-Plus inspired)
- **Star Trail** — collect stars to fill constellations (universal default)
- Theme-specific hero banners and reward animations
- Monster Stable to view and admire your collected creatures
- Modular theme API decoupled from the learning engine

### Progress Tracking

- Daily streak system with recovery grace period
- Weekly progress visualization
- Test readiness indicator (keep-forging → getting-warmer → almost-there → ready)
- Lifetime stats: total words, mastery counts, slipped words

### Multi-Layer Audio

- **Browser TTS** — Web Speech API, works fully offline
- **Dictionary API** — online fallback with natural pronunciation
- Supports `speak()`, `speakSlowly()`, and `speakChunks()` for scaffolding

### OCR Word Import

- Snap a photo of a spelling list and import words automatically
- Local processing via Tesseract.js — no data leaves the device
- Remote fallback when local OCR confidence is low
- Post-OCR spell checking and word extraction
- Configurable word filters to exclude common non-spelling words

### Accessibility (First-Class)

- Configurable font size (16–48px), weight, family (dyslexia-friendly options), letter spacing, line height
- Background color presets (cream, blue, green, yellow) and contrast modes (light/dark/high-contrast)
- Reduced-motion toggle for vestibular sensitivity
- Configurable tap target size (48–72px), WCAG compliant
- Named presets for common needs (e.g., dyslexia-friendly, high-contrast)
- Per-profile accessibility settings

### Data and Offline

- **IndexedDB via Dexie.js** — all data persists locally across browser restarts
- **Multi-child profiles** — independent settings, word lists, progress, and coin balances per child
- **Multiple word lists** — organize words by week, subject, or any grouping
- **Import/export** — JSON backups with merge strategies for cross-device sync
- **Activity auto-save** — resume interrupted sessions where you left off
- **Sync queue** — queues feedback for cloud sync when WiFi is available

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18, TypeScript 5.9 |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 |
| Database | Dexie.js 4 (IndexedDB) |
| Routing | React Router DOM 7 |
| OCR | Tesseract.js 7 |
| Testing | Vitest 4, React Testing Library, fake-indexeddb |
| Linting | ESLint 9, typescript-eslint |
| CI/CD | GitHub Actions |
| Hosting | GitHub Pages |

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install and Run

```bash
npm install
npm run dev
```

### Build for Production

```bash
npm run build
npm run preview    # preview the production build locally
```

## Development

```bash
npm run dev          # start Vite dev server
npm run build        # TypeScript compile + Vite build
npm run typecheck    # strict type checking
npm run lint         # ESLint
npm test             # run all tests
npm run test:watch   # watch mode
```

### Subsystem Tests

```bash
npm run test:phonics     # phonics engine
npm run test:spaced-rep  # spaced repetition + difficulty scoring
npm run test:data        # data layer and repositories
npm run test:audio       # audio system
npm run test:ocr         # OCR pipeline (unit)
npm run test:ocr-integration  # OCR with real Tesseract.js + fixture image
npm run test:themes      # themes and rewards
npm run test:a11y        # accessibility
npm run test:adaptive    # adaptive engine
npm run test:contracts   # type contracts
npm run test:learning    # learning engine
```

## Project Structure

```
src/
├── contracts/          # Central type definitions and event bus
├── core/
│   ├── phonics/        # Phoneme-grapheme analysis, syllabification, hints
│   ├── spaced-rep/     # SM-2 scheduler, buckets, difficulty, coin service
│   ├── word-selection/  # Session word mix algorithm
│   ├── adaptive/       # Engagement detection and session adaptation
│   └── learning/       # Letter-hiding progression engine (stages 0–3)
├── data/
│   ├── db.ts           # Dexie database schema
│   ├── import-export.ts
│   └── repositories/   # Profile, word-list, word, stats, session, streak,
│                        # learning-progress, activity-progress, coin repos
├── audio/              # Multi-provider: custom → TTS → dictionary API
├── ocr/                # Tesseract.js local OCR + remote fallback + spell check
├── themes/             # Dragon Forge, Monster Lab, Star Trail + engine
├── accessibility/      # Settings, presets, defaults, CSS variable mapping
├── hooks/              # Custom React hooks
└── features/
    ├── onboarding/     # First-run profile and theme setup
    ├── dashboard/      # Home screen, progress, readiness, themed hero
    ├── practice/       # Practice session, letter bank, 5 mini-games, quiz
    ├── learning/       # Dedicated learning mode with keyboard input
    ├── word-lists/     # List management, editor, detail view, camera import
    ├── profiles/       # Multi-child profile switching
    ├── settings/       # Accessibility settings, share, import filters
    ├── rewards/        # Monster stable, reward tracking
    └── feedback/       # User feedback form + offline sync banner
```

## Architecture

### Key Design Patterns

- **Repository pattern** — all data access goes through `src/data/repositories/`. Never access Dexie tables directly from UI code.
- **Event bus** — cross-module communication via `src/contracts/events.ts`. Events include `word:attempted`, `session:started`, `session:ended`, `reward:earned`, `streak:updated`, `profile:switched`, `settings:changed`, `coins:earned`, `coins:spent`.
- **Provider pattern** — audio system uses priority-based provider fallback with configurable priorities.
- **Central contracts** — all entity types defined in `src/contracts/types.ts`. Import types from `src/contracts/`, not from individual modules.

### Database Schema (Dexie v1)

Tables: `profiles`, `wordLists`, `words`, `wordStats`, `sessionLogs`, `streaks`, `coinBalances`, `learningProgress`, `activityProgress`, `syncQueue`

## CI/CD

- **test.yml** — smart conditional testing via `dorny/paths-filter` to run only affected subsystem tests on each push/PR
- **deploy.yml** — automatic build and deploy to GitHub Pages on push to `main`
- **version-bump.yml** — automated version updates
- **ci-pass** gate job aggregates all test results for branch protection

## Credits

> "If I have seen further it is by standing on the shoulders of Giants."
> — Isaac Newton, in a letter to Robert Hooke, 1675

SpellForge stands on other people’s work, so we credit every text, tool, font and idea it is built on, whether or not the licence asks us to.

The same list is shown in the app under Settings → About & Credits (source: [`src/features/about/credits.ts`](src/features/about/credits.ts)); a test fails when a runtime dependency in `package.json` is missing from it.

- [React](https://react.dev) — Draws every screen. Licence: [MIT](https://github.com/facebook/react/blob/main/LICENSE). Changes: None; used as published.
- [React Router](https://reactrouter.com) — Installed for routing; screens are switched by hand today. Licence: [MIT](https://github.com/remix-run/react-router/blob/main/LICENSE.md). Changes: None; used as published.
- [Dexie.js](https://dexie.org) — Keeps every profile, word list and score in the browser’s IndexedDB, so SpellForge works offline. Licence: [Apache-2.0](https://github.com/dexie/Dexie.js/blob/master/LICENSE). Changes: None; used as published.
- [Tesseract.js](https://github.com/naptha/tesseract.js) — Reads a photo of a spelling list on the device, so the picture never has to leave it. Licence: [Apache-2.0](https://github.com/naptha/tesseract.js/blob/master/LICENSE.md). Changes: None; used as published.
- [Tesseract OCR English language data](https://github.com/tesseract-ocr/tessdata) — The English model (eng.traineddata) Tesseract.js reads with, bundled so photo import works offline. Licence: [Apache-2.0](https://github.com/tesseract-ocr/tessdata/blob/main/LICENSE). Changes: None; the file is bundled as downloaded.
- [html5-qrcode](https://github.com/mebjas/html5-qrcode) — Scans a QR code with the camera to import a shared word list. Licence: [Apache-2.0](https://github.com/mebjas/html5-qrcode/blob/master/LICENSE). Changes: None; used as published.
- [node-qrcode](https://github.com/soldair/node-qrcode) — Draws the QR codes that share a word list and show this device’s public key. Licence: [MIT](https://github.com/soldair/node-qrcode/blob/master/license). Changes: None; used as published.
- [jsPDF](https://github.com/parallax/jsPDF) — Makes the printable word-list and practice sheets. Licence: [MIT](https://github.com/parallax/jsPDF/blob/master/LICENSE). Changes: None; used as published.
- [uuid](https://github.com/uuidjs/uuid) — Gives every profile, word and session its own id. Licence: [MIT](https://github.com/uuidjs/uuid/blob/main/LICENSE.md). Changes: None; used as published.
- [BSV SDK](https://github.com/bsv-blockchain/ts-stack/tree/main/packages/sdk) — Makes this device’s key and builds and signs the transactions that prove a licence. Licence: [Open BSV License](https://github.com/bsv-blockchain/ts-stack/blob/main/packages/sdk/LICENSE.txt). Changes: None; used as published.
- [bsv-kit](https://github.com/Jonathan-A-White/bsv-kit) — Our own shared kit for talking to the factory: it seals the questions the Tutor and photo import send, and opens the answers. Licence: [MIT](https://github.com/Jonathan-A-White/bsv-kit/blob/main/LICENSE). Changes: Written by us; shared with our other apps.
- [Tailwind CSS](https://tailwindcss.com) — Styles every screen. Licence: [MIT](https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE). Changes: None; used as published.
- [Vite](https://vite.dev) — Builds and bundles the app. Licence: [MIT](https://github.com/vitejs/vite/blob/main/LICENSE). Changes: None; used as published.
- [Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand) — The handwriting font on printed practice sheets. The font by Patrick Wagesreiter reaches us through Fontsource. Licence: [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/). Changes: The printed sheets embed a Latin-only subset of the font, converted to base64.
- [OpenDyslexic](https://opendyslexic.org) — The font the dyslexia-friendly preset asks for, used only if it is installed on the device. Licence: [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/). Changes: None; SpellForge does not ship the font, it only names it.
- [Feather icons](https://feathericons.com) — Several of the small line icons on the Settings screen follow Feather’s shapes. Licence: [MIT](https://github.com/feathericons/feather/blob/main/LICENSE). Changes: Redrawn inline as SVG and recoloured with the theme.
- [Fry Instant Words](https://en.wikipedia.org/wiki/Sight_word) — Edward Fry’s list of the most common English words seeds the dictionary that corrects photo-import misreads. Licence: [Published word list, no licence stated](https://en.wikipedia.org/wiki/Sight_word). Changes: Mixed with common K–8 spelling vocabulary and sorted alphabetically.
- [SM-2 spaced repetition](https://super-memory.com/english/ol/sm2.htm) — Piotr Woźniak’s SuperMemo algorithm decides when a word comes back for review. Licence: [Published algorithm, no licence stated](https://super-memory.com/english/ol/sm2.htm). Changes: Adapted for children: gentler intervals and word buckets (new, learning, familiar, mastered, review).
- [Web Speech API](https://wicg.github.io/speech-api/) — Says words aloud with the voices your phone or browser provides, so spelling words are spoken even offline. Licence: [Open web standard](https://wicg.github.io/speech-api/). Changes: None; we add retries and a slower speaking mode.
- [WhatsOnChain](https://whatsonchain.com) — Looks up and broadcasts BSV transactions for the licence and record features. Licence: [WhatsOnChain API terms](https://docs.whatsonchain.com). Changes: None; we call the public API.
- [Claude](https://www.anthropic.com/claude) — The AI model behind the Tutor’s answers, which reach the app through our own factory. Licence: [Anthropic Commercial Terms](https://www.anthropic.com/legal/commercial-terms). Changes: None; we give it instructions and read its answers.
- [Claude Code](https://claude.com/product/claude-code) — Anthropic’s coding assistant wrote and tested much of this app alongside Jonathan. Licence: [Anthropic Commercial Terms](https://www.anthropic.com/legal/commercial-terms). Changes: None; it is a tool we use.
- [Beads](https://github.com/steveyegge/beads) — Steve Yegge’s issue tracker for AI agents is how the work on this app is planned and tracked. Licence: [MIT](https://github.com/steveyegge/beads/blob/main/LICENSE). Changes: None; used as published.
- [Gas Town](https://github.com/steveyegge/gastown) — Steve Yegge’s ideas for running many AI workers shaped the factory that builds this app. Licence: [MIT](https://github.com/steveyegge/gastown/blob/main/LICENSE). Changes: Ideas only; no code copied.
- [Wings of Fire](https://en.wikipedia.org/wiki/Wings_of_Fire_(novel_series)) — Tui T. Sutherland’s dragon books inspired the Dragon Forge theme. Licence: [Inspiration only; no text or art used](https://en.wikipedia.org/wiki/Wings_of_Fire_(novel_series)). Changes: Our dragons are our own drawings.
- [Plus-Plus](https://www.plusplus.com) — The Plus-Plus building toy inspired the Monster Lab theme. Licence: [Inspiration only; no art used](https://www.plusplus.com). Changes: Our creatures are our own drawings.

## License

[MIT](LICENSE) — Copyright (c) 2026 Jonathan White
