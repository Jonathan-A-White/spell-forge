// src/worlds/maths/maths-report.ts — What the Maths world tells the tutor about where the child is (M37): the screen's name and a few short facts,
// the node and the problem on the screen. Never the answer, never the hint.
import type { MathsQuestion, MathsStage } from './maths-flow';

/** What the world tells the tutor about the screen the child is on (the front door's `screen`, docs/what-the-tutor-is-told.md). */
export interface ScreenReport {
  name: string;
  facts: string[];
}

export const MATHS_SCREEN_NAME = 'Maths';

/** How often a world with nothing to ask looks again for a review that has come due. */
export const IDLE_LOOK_MS = 60_000;

const STAGE_FACT: Record<MathsStage, string> = {
  placement: 'Finding out what the child already knows',
  frontier: 'Learning something new',
  due: 'Going over something learned before',
};

/** The screen as the tutor is told of it: where the child is and the problem on the screen. Never the answer, never the hint. */
export function screenReport(question: MathsQuestion | null): ScreenReport {
  if (!question) return { name: MATHS_SCREEN_NAME, facts: ['Nothing to ask just now: all done for today'] };
  return {
    name: MATHS_SCREEN_NAME,
    facts: [`Working on: ${question.nodeName}`, STAGE_FACT[question.stage], `Problem: ${question.item.problem}`],
  };
}
