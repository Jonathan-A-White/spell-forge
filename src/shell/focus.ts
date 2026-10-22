// src/shell/focus.ts: the page never scrolls. A focus() that is allowed to scroll can push the whole page up under the
// status bar, so every focus goes through focusWithoutScroll and no screen uses the autofocus prop (a test greps for it). The
// page itself is clipped (src/index.css) and screens scroll in the Shell's one scroll box, but the viewport still moves
// for a keyboard or a focus, and Android Chrome can leave it moved when the keyboard closes or the app comes back: the
// scroll guard puts it back at the top.

/** Focuses the box and leaves the scroll position alone. */
export function focusWithoutScroll(el: HTMLElement | null | undefined): void {
  el?.focus({ preventScroll: true });
}

/** A ref callback that focuses the box when it mounts: auto-focus, minus the scroll. */
export function focusOnMount(el: HTMLElement | null): void {
  focusWithoutScroll(el);
}

/** What the guard keeps at the top: the Shell's root. The scroll box ([data-scroll-box]) is meant to scroll. */
const GUARDED = '[data-shell]';

function moved(): HTMLElement[] {
  const found: Array<Element | null> = [
    document.scrollingElement,
    document.documentElement,
    document.body,
    ...document.querySelectorAll(GUARDED),
  ];
  return found.filter((el): el is HTMLElement => el instanceof HTMLElement && el.scrollTop !== 0);
}

/** Puts the document, body and Shell root back at scrollTop 0. */
export function resetPageScroll(): void {
  for (const el of moved()) el.scrollTop = 0;
  if (window.scrollY !== 0) window.scrollTo(0, 0);
}

/** Starts the guard on every event known to leave the page moved; the returned function stops it. */
export function installScrollGuard(): () => void {
  const onScroll = (event: Event) => {
    const target = event.target;
    if (
      target === document ||
      target === window ||
      target === document.scrollingElement ||
      (target instanceof Element && (target === document.body || target.matches(GUARDED)))
    ) {
      resetPageScroll();
    }
  };
  const onChange = () => {
    resetPageScroll();
    // the keyboard finishes closing a frame or two after the event
    requestAnimationFrame(resetPageScroll);
  };
  const windowEvents = ['resize', 'focusout', 'pageshow'] as const;
  document.addEventListener('scroll', onScroll, true);
  document.addEventListener('visibilitychange', onChange);
  for (const name of windowEvents) window.addEventListener(name, onChange);
  window.visualViewport?.addEventListener('resize', onChange);
  return () => {
    document.removeEventListener('scroll', onScroll, true);
    document.removeEventListener('visibilitychange', onChange);
    for (const name of windowEvents) window.removeEventListener(name, onChange);
    window.visualViewport?.removeEventListener('resize', onChange);
  };
}
