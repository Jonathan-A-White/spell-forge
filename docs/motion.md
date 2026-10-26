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
`setVisibleInterval` (`src/shell/visible-interval.ts`). Every `requestAnimationFrame` loop goes through `animate(step)` in
`src/look/scene/clock.ts`: it asks for no frame while `document.visibilityState` is `hidden`, starts again on `visibilitychange`, and
does not count the hidden time as a step. `clock` there is the seam a test replaces with a hand-turned clock (Legend's
`src/globe/clock.ts` is the model). `tests/unit/scene-fallback.test.tsx` greps `src/` and fails on a `requestAnimationFrame` anywhere
else, bar a known one-shot that asks for a single frame (`src/shell/focus.ts`). The themed hero's canvas (`src/themes/theme-effects.tsx`)
runs on it. Known gap: the SVG `<animate>` lights in Letter Invasion do not yet follow `reducedMotion()`, and the themed hero's
particles still move under reduced motion; both are for a later look story.

## The door's scene (story B, mw-79en7t.77)

Behind the front door is a slow WebGL picture: the theme's colours drifting like ink through paper, with a still paper grain
(`src/look/scene/FrontDoorScene.tsx`, drawn with OGL, one triangle and one fragment shader). It is a lazy chunk: `fallback.tsx`'s
`SceneOrFallback` fetches it only when `sceneAllowed()` (`webgl-support.ts`) says WebGL is known and the phone does not ask for less
motion; otherwise, while the chunk loads, and when WebGL will not start or the context is lost, the still fallback is drawn in CSS from
the same colours (`scene.css`), and no canvas is made. The live picture draws at most every 33 ms at one pixel per CSS pixel, fades in
over the still one (`slow`, `ease-sf-out`), and stops when the page hides. It sits behind the whole shell (`.sf-shell:has(.sf-scene)`
is isolated, the scene fixed at `z-index: -1`), so it never takes a tap. The first paint of either sets the performance mark
`sf-scene-painted`; `tests/e2e/front-door-scene.spec.ts` holds it under 1500 ms at 390x844 (a PROVISIONAL budget).

## The children's worlds (story D, mw-79en7t.79)

The door's Worlds are big cards (`.sf-world-card`: a translucent surface with a blur, so the scene shows through) that rise in over
`slow`; each line of the talk (`.sf-bubble`) and each turn of Spelling or Maths (`.sf-turn`, a card made again by its `key` for each
turn) rises over `base`, `ease-sf-out`: a short rise and a fade, the one motion allowed on entry. The age sets the rest in `index.css`
(`[data-sf-age='young'|'teen']`): the bubbles' corners and size, and voice-kit's hold bar (`--bk-composer-bar-height`, `-radius`).
`tests/e2e/look.spec.ts` part 2 takes the eight shots (the four worlds at 7 and 13), reads these computed styles, checks every element's
rect against the 390 px window, and runs once with reduced motion to find no transition or animation longer than `reduced` (1 ms).

## Native feel (topic 08)

`index.css` gives every control `touch-action: manipulation` (no 300 ms tap delay, no double-tap zoom), a transparent
`-webkit-tap-highlight-color` and `user-select: none` (buttons, summaries and roles that act like them; text fields stay selectable).
`tests/e2e/phone-width.spec.ts` reads the computed styles on a button. A decorative layer that sits over a control (a hover wash) is
`pointer-events-none`, so it can never take a tap.
