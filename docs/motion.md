# Motion

The rules for anything that moves in SpellForge (Kestrel look, story A, mw-79en7t.76). The code is `src/look/motion.ts`
(`DURATION`, `EASING`, `reducedMotion()`, exported from `src/look`); the same numbers are the `@theme static` block of `src/index.css`;
`tests/unit/motion.test.ts` holds the two equal and fails on a raw duration anywhere else under `src/`.

## What moves

Motion tells the child something happened; it never decorates a wait or hides one.

- A press: colour and a small scale (`active:scale-[0.97]`), `instant`.
- A fill (progress bar, the volcano, the relay track): grows to its new width, `base` for a bar, `slow` for a result, `slower` for the volcano.
- A wrong PIN shakes the boxes (`animate-sf-shake`, `deliberate`); a right answer flashes a tick (`animate-sf-success-flash`, `second`).
- Waiting: a spinner (`animate-sf-spin`) or a pulse (`animate-sf-pulse`). Nothing loops longer than the thing it waits for.
- The games' own scenery (Letter Invasion's stars, ship and beam) drifts and breathes (`drift`, `breath`); it is scenery, so it stops first.
- Nothing moves for the first time on a screen after a tap the child has not made: no auto-playing motion on entry beyond a fade.

## How long

| Token | Utility / use | ms |
|---|---|---|
| `instant` | hover and press colour (Tailwind's default, set by `--default-transition-duration`) | 150 |
| `quick` | `sf-duration-quick`: a chevron turning | 200 |
| `base` | `sf-duration-base`: progress bars, a card moving | 300 |
| `deliberate` | the PIN shake, the tick being drawn | 400 |
| `slow` | `sf-duration-slow`: a fill arriving, the explosion | 500 |
| `slower` | `sf-duration-slower`: the volcano; the fast blink | 700 |
| `blink` | a ship's lights | 800 |
| `second` | a spinner turn, a bounce, the success flash | 1000 |
| `drift` | a star, a ship hovering | 1500 |
| `breath` | a pulse, the tractor beam | 2000 |
| `reduced` | what reduced motion shrinks everything to | 1 |

Easings: `ease-sf-out` (arriving), `ease-sf-in-out` (back and forth), `ease-sf-linear` (a spinner). Use the named utilities in
classes (`sf-duration-base`, `ease-sf-out`, `animate-sf-*`) and `DURATION` / `EASING` in code. A timer that must match an animation
(`SuccessFlash`'s) reads `DURATION`. No `duration-300`, `ease-out`, `animate-pulse`, `0.4s` or SVG `dur="1s"` of its own: the sweep test fails.
A new number is a new token in both files, and a row here.

## Reduced motion

`index.css` sets every animation and transition to `reduced` under `prefers-reduced-motion: reduce`, so CSS needs nothing more. Code that
moves with script (a canvas loop, a JS-driven tween, an SVG `<animate>`) asks `reducedMotion()` and stops or jumps to the end. The
accessibility settings' `--sf-reduced-motion` is the app's own switch; a screen that offers one must honour both.

## Pause when hidden

A loop that runs while the page is hidden spends the child's battery for nothing (vault topic 11). A timer-driven loop uses
`setVisibleInterval` (`src/shell/visible-interval.ts`); a `requestAnimationFrame` loop stops on `document.hidden` and restarts on
`visibilitychange`. Known gap: the themed hero's canvas loop (`src/themes/theme-effects.tsx`) does not yet pause when hidden, and the
SVG `<animate>` lights in Letter Invasion do not yet follow `reducedMotion()`; both are for a later look story.

## Native feel (topic 08)

`index.css` gives every control `touch-action: manipulation` (no 300 ms tap delay, no double-tap zoom), a transparent
`-webkit-tap-highlight-color` and `user-select: none` (buttons, summaries and roles that act like them; text fields stay selectable).
`tests/e2e/phone-width.spec.ts` reads the computed styles on a button. A decorative layer that sits over a control (a hover wash) is
`pointer-events-none`, so it can never take a tap.
