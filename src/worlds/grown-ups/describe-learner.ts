// src/worlds/grown-ups/describe-learner.ts: what the tutor knows of a learner, in plain words.

import { valuesOf, type Profile as LearnerProfile } from 'learn-kit/learner';

export const NOTHING_YET = 'The tutor has not learned about them yet.';

/** What the tutor knows of a learner, in one plain line: '7 years old, learns by doing, steady pace'. */
export function describeLearner(learner: LearnerProfile | undefined): string {
  const known = learner ? valuesOf(learner) : {};
  const parts: string[] = [];
  if (known.age !== undefined) parts.push(known.age === 1 ? '1 year old' : `${known.age} years old`);
  if (known.experience) parts.push(known.experience);
  if (known.learnerKind) parts.push(known.learnerKind);
  if (known.speed) parts.push(`${known.speed} pace`);
  return parts.length ? parts.join(', ') : NOTHING_YET;
}
