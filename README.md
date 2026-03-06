# SpellForge

An offline-first PWA that helps kids hack their own spelling through adaptive techniques, spaced repetition, and rewards they actually care about.

Built for children like Paul — a 3rd grader with double vision who loves creature-building games — but architected to be customizable for any child with any interests.

## Philosophy

1. **Help children hack themselves** — track what works for each child, adapt automatically
2. **Never end in frustration** — gracefully wrap sessions, scaffold struggles, celebrate wins
3. **Offline first, better with WiFi** — core learning works without connectivity
4. **Visual accessibility as default** — every parameter tunable for individual needs
5. **Themes decouple from learning** — dragons, monsters, stars — pick what motivates your child

## Features

### Adaptive Learning Engine
- **Phonics analysis** — breaks words into syllables, phonemes, and grapheme-phoneme mappings; detects patterns like silent-e, vowel teams, and consonant digraphs
- **Spaced repetition** — SM-2 algorithm adapted for children with expanding review intervals (1hr to 60+ days)
- **Difficulty scoring** — per-word difficulty (0.0–1.0) based on error rate, response time, and scaffolding needs
- **Word bucketing** — tracks words through states: `new` → `learning` → `familiar` → `mastered` → `review`

### Engagement Detection
- Detects **fatigue** (increasing response times) and wraps sessions gracefully
- Detects **frustration** (high error rate) and provides scaffolding or easier words
- Detects **boredom** (too-fast answers) and increases difficulty
- Respects configurable max session duration (1–15 minutes)

### Practice Sessions
- **Letter bank interface** — children tap letters to build words
- **Multi-layer audio** — browser TTS (offline), custom recorded audio, dictionary API fallback
- **Phonics scaffolding** — on struggle, words break into colored syllable chunks with audio cues
- **Smart word mix** — ~60% current list, ~30% review, ~10% long-term maintenance
- **Test-day boost** — shifts mix toward current list words as test date approaches

### Themes and Rewards
- **Dragon Forge** — earn scales to build a dragon (Wings of Fire inspired)
- **Monster Lab** — earn Plus-Plus style building blocks for creature assembly
- **Star Trail** — collect stars to fill constellations (universal default)
- Modular theme API decoupled from the learning engine

### Progress Tracking
- Daily streak system with recovery grace period
- Weekly progress visualization
- Test readiness indicator (keep-forging → getting-warmer → almost-there → ready)
- Lifetime stats: total words, mastery counts, slipped words

### Accessibility (First-Class)
- Configurable font size (16–48px), weight, family (dyslexia-friendly options), letter spacing, line height
- Background color presets (cream, blue, green, yellow) and high-contrast mode
- Reduced-motion toggle for vestibular sensitivity
- Configurable tap target size (48–72px), WCAG compliant
- Per-profile accessibility settings

### Data and Offline
- **IndexedDB via Dexie.js** — all data persists locally across browser restarts
- **Multi-child profiles** — independent settings, word lists, and progress per child
- **Import/export** — JSON backups with merge strategies for cross-device sync
- **Sync queue** — queues feedback and analytics for cloud sync when WiFi is available

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18, TypeScript 5.9 |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 |
| Database | Dexie.js 4 (IndexedDB) |
| Routing | React Router DOM 7 |
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

## Development Commands

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
npm run test:ocr         # OCR pipeline
npm run test:themes      # themes and rewards
npm run test:a11y        # accessibility
npm run test:adaptive    # adaptive engine
npm run test:contracts   # type contracts
```

## Project Structure

```
src/
├── contracts/          # Type definitions and event bus
├── core/
│   ├── phonics/        # Phoneme-grapheme analysis, syllabification, patterns
│   ├── spaced-rep/     # SM-2 scheduler, bucket transitions, difficulty scoring
│   ├── word-selection/  # Session word mix algorithm
│   └── adaptive/       # Engagement detection and session adaptation
├── data/
│   ├── db.ts           # Dexie database schema
│   ├── import-export.ts
│   └── repositories/   # Repository pattern for all data access
├── audio/              # Layered audio: TTS, dictionary API, custom recordings
├── ocr/                # Tesseract.js local OCR with remote fallback
├── themes/             # Dragon Forge, Monster Lab, Star Trail
├── accessibility/      # Settings, presets, CSS variable mapping
└── features/
    ├── practice/       # Main practice session UI
    ├── dashboard/      # Progress and readiness views
    ├── profiles/       # Multi-child profile management
    ├── onboarding/     # First-run flow
    ├── word-lists/     # List editor with OCR import
    ├── feedback/       # User feedback form
    └── rewards/        # Reward tracking
```

## CI/CD

- **test.yml** — smart conditional testing using `dorny/paths-filter` to run only affected subsystem tests on each push/PR
- **deploy.yml** — automatic build and deploy to GitHub Pages on push to `main`
- **ci-pass** gate job aggregates all test results for branch protection

## License

[MIT](LICENSE) — Copyright (c) 2026 Jonathan White
