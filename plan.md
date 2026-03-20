# Word Progress Tracking - Implementation Plan

## Overview
Add per-word progress tracking with a full-page detail view, and introduce a configurable grade goal that redefines "ready" based on what percentage of words need to be at familiar+ level.

## Scope: Active lists only

---

## Part 1: Grade Goal Setting

### 1A. Add `gradeGoal` to Profile type
**File:** `src/contracts/types.ts`
- Add `gradeGoal: number` to `Profile` interface (default: 100, valid values: 80, 90, 100)
- This is a percentage — 100 means all words must be familiar+, 90 means 90% of words, etc.

### 1B. Update profile repository
**File:** `src/data/repositories/profile-repo.ts`
- Ensure `gradeGoal` defaults to 100 on profile creation
- Add migration or default handling for existing profiles without the field

### 1C. Update readiness calculation
**File:** `src/features/dashboard/progress-view.tsx` and `readiness-indicator.tsx`
- Change readiness from `count(mastered + familiar) / total` to: `count(mastered + familiar) / ceil(total * gradeGoal / 100)`
- Update the "X of Y words ready" label to reflect the goal (e.g., "4 of 9 words ready (90% goal)")
- Also update `home-screen.tsx` readiness calculations

### 1D. Add grade goal to settings
**File:** `src/features/settings/settings-panel.tsx`
- Add a "Grade Goal" selector (80% / 90% / 100%) in settings
- Persist via profile repository update

---

## Part 2: Word Detail View

### 2A. Create WordDetailView component
**New file:** `src/features/dashboard/word-detail-view.tsx`

**Layout (top to bottom):**
1. **Header** — Back button + word text (large) + audio play button
2. **Current Status** — Colored badge showing current bucket (New/Learning/Familiar/Mastered)
3. **Next Level Progress** — Visual progress bars:
   - For New → Learning: "Start practicing this word"
   - For Learning → Familiar: Progress bar for consecutive correct (X/3), show what's needed
   - For Familiar → Mastered: Two progress bars:
     - Consecutive correct answers (X/5)
     - Distinct days with correct answers (X/3)
   - For Mastered: "Mastered! Next review in X days"
4. **Stats Summary** — Row of stat cards:
   - Accuracy % (timesAsked - timesWrong) / timesAsked
   - Total attempts
   - Average response time (from techniqueHistory)
   - Difficulty score (0-1 mapped to Easy/Medium/Hard)
5. **Attempt Timeline** — Chronological list (most recent first):
   - Date/time
   - Correct/incorrect indicator (green check / red X)
   - Technique used
   - Response time
   - Whether scaffolding was used

### 2B. Add navigation route
**File:** `src/App.tsx`
- Add `'word-detail'` to `AppView` type
- Add state for `selectedWordId: string | null`
- Render `WordDetailView` when `view === 'word-detail'`
- Handle back navigation

### 2C. Make words clickable in health categories
**File:** `src/features/dashboard/progress-view.tsx`
- Update the `WordList` component inside expanded health categories
- Each word becomes a tappable element that navigates to `word-detail` view
- Add right-arrow indicator or visual affordance for tappability

---

## Part 3: Tests

### 3A. Unit tests for grade goal readiness calculation
- Test readiness at 80%, 90%, 100% goals with various word distributions

### 3B. Unit tests for word detail data computation
- Test "next level" requirements calculation for each bucket transition
- Test stats computation (accuracy, avg response time)

---

## File Change Summary

| File | Change Type |
|------|-------------|
| `src/contracts/types.ts` | Modify (add gradeGoal to Profile) |
| `src/data/repositories/profile-repo.ts` | Modify (default gradeGoal) |
| `src/features/dashboard/word-detail-view.tsx` | **New file** |
| `src/features/dashboard/progress-view.tsx` | Modify (clickable words, readiness calc) |
| `src/features/dashboard/readiness-indicator.tsx` | Modify (goal-aware label) |
| `src/features/dashboard/home-screen.tsx` | Modify (readiness calc) |
| `src/features/settings/settings-panel.tsx` | Modify (grade goal selector) |
| `src/App.tsx` | Modify (add word-detail route) |
| `src/features/dashboard/index.ts` | Modify (export WordDetailView) |
| `tests/unit/word-progress.test.ts` | **New file** |
