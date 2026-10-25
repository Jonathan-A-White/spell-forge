// src/worlds/spelling — The spelling world: the practice games as learn-kit drill forms (drill-forms.ts), the flow over the spelling graph
// (spelling-flow.ts), where its place is kept (spelling-store.ts) and the screen (SpellingWorld.tsx).

export { SpellingWorld } from './SpellingWorld.tsx';
export type { SpellingWorldProps } from './SpellingWorld.tsx';
export { IDLE_LOOK_MS, SPELLING_SCREEN_NAME, screenFacts } from './spelling-report.ts';
export { PICK_FORM, ROUND_WORDS, createSpellingFlow, triesSolid } from './spelling-flow.ts';
export type { SpellingAnswer, SpellingFlow, SpellingFlowDeps, SpellingResult, SpellingStage, SpellingTurn } from './spelling-flow.ts';
export { memoryKeep, storageGraphStore, storageKeep } from './spelling-store.ts';
export type { SpellingKept, SpellingKeep } from './spelling-store.ts';

export { DRILL_FORM_IDS, drillForms, gameItems, openGame } from './drill-forms.ts';
export type { DrillFormId, GameContext, GameForm, GameItem, GameResult } from './drill-forms.ts';
