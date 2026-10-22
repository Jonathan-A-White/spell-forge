// src/shell/HearAnyWord.tsx: a long press on any word of prose says it aloud, in the language the page names for it.
// Mounted once by the Shell; it listens on the document. A press of 500 ms under 10 px of movement finds the word under the
// finger (word-at.ts), says it with sayWord (voice-kit's speak()) and marks it while it speaks. Whatever has a long press of
// its own keeps it: buttons, links, fields and the like are skipped. NEVER in a spelling drill, where the word is the test:
// anything inside a [data-drill] box is skipped, and the Shell marks the drill screens' box so. The click that ends a
// spoken press is dropped, so a tap handler round the prose does not cut the word off.
import { useEffect } from 'react';
import { isTtsAvailable, sayWord } from '../audio';
import { LONG_PRESS_MS, LONG_PRESS_SLOP_PX, wordAtPoint } from './word-at';

/** What has a press of its own, or takes typing: the long press leaves it alone. */
const OWN_PRESS = 'button, a, input, textarea, select, label, summary, [role="button"], [role="slider"], [contenteditable="true"]';
/** Where the word is the test: no long press says it. */
const DRILL = '[data-drill]';
/** The name of the page highlight (src/index.css ::highlight). */
const HIGHLIGHT = 'hear-word';

interface HighlightApi {
  highlights?: Map<string, unknown>;
}

/** Marks the range until `done` settles (the CSS Custom Highlight API; a browser without it just does not mark). */
function mark(range: Range, done: Promise<void>): void {
  const registry = (globalThis as unknown as { CSS?: HighlightApi }).CSS?.highlights;
  const Highlight = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (!registry || !Highlight) return;
  registry.set(HIGHLIGHT, new Highlight(range));
  void done.finally(() => registry.delete(HIGHLIGHT));
}

/** Whether a press that begins on `target` is the page's to handle: prose, not a control with a press of its own and not a drill. */
function isProse(target: EventTarget | null): target is Element {
  if (!(target instanceof Element)) return false;
  if (target.closest(DRILL)) return false;
  const owner = target.closest(OWN_PRESS);
  return owner === null || owner.hasAttribute('data-hear-word');
}

export function HearAnyWord(): null {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let from = { x: 0, y: 0 };
    // the press that has just spoken: its click is dropped
    let spoke = false;
    const cancel = () => clearTimeout(timer);
    const down = (e: PointerEvent) => {
      cancel();
      spoke = false;
      if (e.button !== 0 || !isProse(e.target)) return;
      const target = e.target;
      from = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        const hit = wordAtPoint(from.x, from.y, target);
        if (!hit || !isTtsAvailable()) return;
        spoke = true;
        navigator.vibrate?.(10);
        window.getSelection()?.removeAllRanges();
        const said = sayWord(hit.word, hit.language);
        mark(hit.range, said);
      }, LONG_PRESS_MS);
    };
    const move = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > LONG_PRESS_SLOP_PX) cancel();
    };
    const click = (e: MouseEvent) => {
      if (!spoke) return;
      spoke = false;
      e.preventDefault();
      e.stopPropagation();
    };
    // the phone's menu on a held word (a field and a link keep theirs, and so does a drill)
    const menu = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof Element && (t.closest(DRILL) || t.closest('input, textarea, a, [contenteditable="true"]'))) return;
      e.preventDefault();
    };
    const forget = () => (spoke = false);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', cancel, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('scroll', cancel, true);
    document.addEventListener('click', click, true);
    document.addEventListener('contextmenu', menu, true);
    document.addEventListener('keydown', forget, true);
    return () => {
      cancel();
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', cancel, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('scroll', cancel, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('contextmenu', menu, true);
      document.removeEventListener('keydown', forget, true);
    };
  }, []);
  return null;
}
