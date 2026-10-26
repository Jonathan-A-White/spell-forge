// src/look/age-style.ts: which look the app wears for a learner, from the age the tutor has learned: 'young' under 10, 'teen'
// from 10, 'unknown' when no age is known (it wears the middle: neither babyish for an eighth grader nor grown-up for a
// seven-year-old). The Shell sets it as data-sf-age; the theme engine keeps the tokens of each look (docs/motion.md, look C).
import { valuesOf, type Profile as LearnerProfile } from 'learn-kit/learner';

export const AGE_STYLES = ['young', 'teen', 'unknown'] as const;
export type AgeStyle = (typeof AGE_STYLES)[number];

/** The first age that wears the teen look. */
export const TEEN_FROM_AGE = 10;

export function ageStyle(age: number | undefined): AgeStyle {
  if (age === undefined || !Number.isFinite(age) || age < 0) return 'unknown';
  return age < TEEN_FROM_AGE ? 'young' : 'teen';
}

export function ageStyleOf(learner: LearnerProfile | undefined): AgeStyle {
  return ageStyle(learner ? valuesOf(learner).age : undefined);
}
