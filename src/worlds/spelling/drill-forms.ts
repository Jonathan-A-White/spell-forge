// src/worlds/spelling/drill-forms.ts — The games of src/features/practice as learn-kit drill forms: each is registered under its id and
// opens, with a node's items, as the game it always was. No change of behaviour: a game still plays its own words and the coins are
// still paid by the practice screen through src/core/spaced-rep/coin-service.ts.

import { createElement, useState, type ReactElement } from 'react';
import { createForms, type Forms, type MadeItem } from 'learn-kit/drill';
import type { ActivityType } from '../../contracts/types';
import { shuffle } from '../../core/shuffle';
import { SpellCatcher, type SpellCatcherResults, type SpellCatcherSavedState } from '../../features/practice/spell-catcher';
import { SpellingQuiz, type QuizResults, type QuizSavedState } from '../../features/practice/spelling-quiz';
import { UnscrambleDragDrop } from '../../features/practice/unscramble-drag-drop';
import { WordRelayRace, type RelayRaceResults, type RelayRaceSavedState } from '../../features/practice/word-relay-race';
import { WordSearch, type WordSearchSavedState } from '../../features/practice/word-search';
import type { WordSearchDifficulty } from '../../features/practice/word-search-difficulty';
import { WordVolcano, type WordVolcanoResults, type WordVolcanoSavedState } from '../../features/practice/word-volcano';
import { LetterInvasion, type LetterInvasionResults, type LetterInvasionSavedState } from '../../features/practice/letter-invasion';

/** The seven games, in the order the practice screen offers them (the last two are not on its hub: the quiz has its own screen). */
export const DRILL_FORM_IDS = [
  'spell-catcher',
  'word-volcano',
  'word-relay-race',
  'letter-invasion',
  'word-search',
  'unscramble',
  'quiz',
] as const;

export type DrillFormId = (typeof DRILL_FORM_IDS)[number];

/** What a game needs of an item. A node's SpellingItem (src/learn/spelling/items.ts) is one; so is a bare word of a child's list. */
export interface GameItem {
  word: string;
}

/** How a game ended, the same for every game: `correct` of `total` words. A game that times itself says how long it took. */
export interface GameResult {
  correct: number;
  total: number;
  totalTimeMs?: number;
}

/** What the screen hands a game besides the items. */
export interface GameContext {
  tapTargetSize: number;
  onComplete: (result: GameResult) => void;
  onSpeak?: (word: string) => void;
  audioBusy?: boolean;
  /** Word Search only. */
  difficulty?: WordSearchDifficulty;
  /** Word Relay Race only. */
  themeId?: string;
  /** The game's own saved state, as it handed it to onProgress. */
  savedState?: unknown;
  onProgress?: (state: unknown) => void;
}

/** The render contract of a game form: how to put a node's items to the child as this game. */
export interface GameForm {
  /** The activity its progress is kept under, or null for a game that keeps none. */
  activityType: ActivityType | null;
  /** The prefix of the session log id when the phone cannot make a uuid. */
  idPrefix: string;
  open: (items: readonly GameItem[], ctx: GameContext) => ReactElement;
}

const words = (items: readonly GameItem[]): string[] => items.map((i) => i.word);

const GAME_FORMS: { id: DrillFormId; render: GameForm }[] = [
  {
    id: 'spell-catcher',
    render: {
      activityType: 'spell-catcher',
      idPrefix: 'sc',
      open: (items, ctx) =>
        createElement(SpellCatcher, {
          words: words(items),
          onComplete: (r: SpellCatcherResults) => ctx.onComplete({ correct: r.wordsCompleted, total: r.totalWords }),
          onSpeak: ctx.onSpeak,
          audioBusy: ctx.audioBusy,
          tapTargetSize: ctx.tapTargetSize,
          savedState: ctx.savedState as SpellCatcherSavedState | undefined,
          onProgress: ctx.onProgress,
        }),
    },
  },
  {
    id: 'word-volcano',
    render: {
      activityType: 'word-volcano',
      idPrefix: 'wv',
      open: (items, ctx) =>
        createElement(WordVolcano, {
          words: words(items),
          onComplete: (r: WordVolcanoResults) => ctx.onComplete({ correct: r.wordsCompleted, total: r.totalWords }),
          onSpeak: ctx.onSpeak,
          audioBusy: ctx.audioBusy,
          tapTargetSize: ctx.tapTargetSize,
          savedState: ctx.savedState as WordVolcanoSavedState | undefined,
          onProgress: ctx.onProgress,
        }),
    },
  },
  {
    id: 'word-relay-race',
    render: {
      activityType: 'relay-race',
      idPrefix: 'rr',
      open: (items, ctx) =>
        createElement(WordRelayRace, {
          words: words(items),
          onComplete: (r: RelayRaceResults) => ctx.onComplete({ correct: r.wordsCorrect, total: r.totalWords, totalTimeMs: r.totalTimeMs }),
          onSpeak: ctx.onSpeak,
          audioBusy: ctx.audioBusy,
          tapTargetSize: ctx.tapTargetSize,
          savedState: ctx.savedState as RelayRaceSavedState | undefined,
          onProgress: ctx.onProgress,
          themeId: ctx.themeId,
        }),
    },
  },
  {
    id: 'letter-invasion',
    render: {
      activityType: 'letter-invasion',
      idPrefix: 'li',
      open: (items, ctx) =>
        createElement(LetterInvasion, {
          words: words(items),
          onComplete: (r: LetterInvasionResults) => ctx.onComplete({ correct: r.wavesCleared, total: r.totalWords }),
          onSpeak: ctx.onSpeak,
          audioBusy: ctx.audioBusy,
          tapTargetSize: ctx.tapTargetSize,
          savedState: ctx.savedState as LetterInvasionSavedState | undefined,
          onProgress: ctx.onProgress,
        }),
    },
  },
  {
    id: 'word-search',
    render: {
      activityType: 'word-search',
      idPrefix: 'ws',
      open: (items, ctx) =>
        createElement(WordSearch, {
          words: words(items),
          difficulty: ctx.difficulty ?? 'medium',
          onComplete: (found: number, total: number) => ctx.onComplete({ correct: found, total }),
          tapTargetSize: ctx.tapTargetSize,
          savedState: ctx.savedState as WordSearchSavedState | undefined,
          onProgress: ctx.onProgress,
        }),
    },
  },
  {
    id: 'unscramble',
    render: {
      activityType: null,
      idPrefix: 'us',
      open: (items, ctx) => createElement(UnscrambleRound, { items, ctx }),
    },
  },
  {
    id: 'quiz',
    render: {
      activityType: 'quiz',
      idPrefix: 'qz',
      open: (items, ctx) =>
        createElement(SpellingQuiz, {
          words: words(items),
          onComplete: (r: QuizResults) => ctx.onComplete({ correct: r.correctAnswers, total: r.totalQuestions }),
          onSpeak: ctx.onSpeak,
          audioBusy: ctx.audioBusy,
          tapTargetSize: ctx.tapTargetSize,
          savedState: ctx.savedState as QuizSavedState | undefined,
          onProgress: ctx.onProgress,
        }),
    },
  },
];

/** The registry of the seven games, for learn-kit's drill (a plan's items must name one of these). */
export const drillForms: Forms<GameForm> = createForms(GAME_FORMS);

/** A node's items as drill items of one game form, one for each: the kit's checkItems accepts them against drillForms. */
export function gameItems<T extends GameItem>(nodeId: string, formId: DrillFormId, items: readonly T[]): MadeItem<T>[] {
  return items.map((item, i) => ({ key: `${nodeId}:${formId}:${i}`, form: formId, payload: item }));
}

/** Opens a game form with a node's items: the game, drawn as the practice screen draws it. */
export function openGame(formId: DrillFormId, items: readonly GameItem[], ctx: GameContext): ReactElement {
  return drillForms.get(formId).render.open(items, ctx);
}

// ─── Unscramble ──────────────────────────────────────────────

function scrambleWord(word: string): string {
  const letters = word.split('');
  let scrambled: string;
  let attempts = 0;
  do {
    scrambled = shuffle(letters).join('');
    attempts++;
  } while (scrambled === word && attempts < 10);
  return scrambled;
}

/** The unscramble game: each word's letters scrambled for the child to put in order, one word after another. */
function UnscrambleRound({ items, ctx }: { items: readonly GameItem[]; ctx: GameContext }): ReactElement {
  const [order] = useState(() => items.map((item) => ({ word: item.word.toLowerCase(), scrambled: scrambleWord(item.word.toLowerCase()) })));
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const current = order[index];
  if (!current) return createElement('div');

  const submit = (answer: string) => {
    const right = correct + (answer.toLowerCase() === current.word ? 1 : 0);
    setCorrect(right);
    if (index + 1 < order.length) setIndex(index + 1);
    else ctx.onComplete({ correct: right, total: order.length });
  };

  return createElement(UnscrambleDragDrop, {
    key: index,
    scrambledLetters: current.scrambled,
    wordLength: current.word.length,
    onSubmit: submit,
    tapTargetSize: ctx.tapTargetSize,
    submitLabel: index + 1 < order.length ? 'Next' : 'Done',
  });
}
