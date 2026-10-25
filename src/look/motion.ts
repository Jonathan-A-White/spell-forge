// src/look/motion.ts — the motion rules in code (docs/motion.md): every duration and easing the app moves with, by name.
// The same numbers sit in index.css's `@theme static` block (--sf-duration-*, --ease-sf-*); tests/unit/motion.test.ts holds the two equal
// and fails on a raw duration anywhere else under src/. A timer that must match a CSS animation reads DURATION here, never a literal.

/** Milliseconds. Keys are the camelCase of the --sf-duration-* token names. */
export const DURATION = {
  /** A hover or press changing colour; Tailwind's own default. */
  instant: 150,
  /** A small control easing open or turning. */
  quick: 200,
  /** A progress bar growing, a card moving a step. */
  base: 300,
  /** A deliberate shake or a tick being drawn. */
  deliberate: 400,
  /** A fill that should be seen arriving. */
  slow: 500,
  /** A big fill (the volcano), the fast blink of a ship's lights. */
  slower: 700,
  /** The slow blink of a ship's lights. */
  blink: 800,
  /** One full turn of a spinner, a bounce, the success flash. */
  second: 1000,
  /** A slow drift: a star twinkling, a ship hovering. */
  drift: 1500,
  /** A slow breath: a pulse, a tractor beam. */
  breath: 2000,
  /** What reduced motion shrinks every animation and transition to (index.css). */
  reduced: 1,
} as const;

export type DurationName = keyof typeof DURATION;

/** CSS timing functions. Keys are the camelCase of the --ease-sf-* token names. */
export const EASING = {
  out: 'cubic-bezier(0, 0, 0.2, 1)',
  inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  linear: 'linear',
} as const;

export type EasingName = keyof typeof EASING;

/** True when the phone asks for less motion. False when it does not, or cannot say (no matchMedia). */
export function reducedMotion(): boolean {
  if (typeof matchMedia !== 'function') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
