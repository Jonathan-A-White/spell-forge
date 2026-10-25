// src/worlds/spelling/spelling-report.ts — What the Spelling world tells the tutor about where the child is (M37): the screen's name and a few
// short facts, the node and why it is being asked. Never the words, never the answer.
import type { SpellingStage, SpellingTurn } from './spelling-flow';

export const SPELLING_SCREEN_NAME = 'Spelling';

/** How often a world with nothing to ask looks again for a review that has come due. */
export const IDLE_LOOK_MS = 60_000;

const STAGE_FACT: Record<SpellingStage, string> = {
  placement: 'Finding out what the child already knows',
  list: 'Practising the words on a spelling list',
  frontier: 'Learning something new',
  due: 'Going over something learned before',
};

/** The facts of the screen as the tutor is told of it (src/shell/report-screen.ts adds the name). Never the words, never the answer. */
export function screenFacts(turn: SpellingTurn | null): string[] {
  if (!turn) return ['Nothing to ask just now: all done for today'];
  return [`Working on: ${turn.nodeName}`, STAGE_FACT[turn.stage]];
}
