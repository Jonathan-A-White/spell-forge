// M9 (story 12c, mw-79en7t.34): the page never scrolls: one scroll box inside #root, a scroll guard that puts the
// document back at the top, and a focus that does not scroll. A screen drawn in the Shell has exactly one scrolling element.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { focusOnMount, focusWithoutScroll, installScrollGuard, resetPageScroll } from '../../src/shell/focus';
import { Shell } from '../../src/shell/Shell';
import { AppProvider } from '../../src/shell/app-context';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';

const css = readFileSync('src/index.css', 'utf-8').replace(/@import[^;]*;/g, '');

let style: HTMLStyleElement;

beforeEach(async () => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
  await db.delete();
  await db.open();
  await profileRepo.create({
    name: 'Rowan',
    avatar: 'dragon-forge-1',
    themeId: 'dragon-forge',
    createdAt: new Date(),
    settings: { ...DEFAULT_SETTINGS },
    status: 'active',
  });
  style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
});

afterEach(() => {
  style.remove();
  cleanup();
});

const scrolls = (el: Element): boolean => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY);

describe('one scroll box per screen', () => {
  it('draws a screen in the Shell with exactly one scrolling element, and the page around it clipped', async () => {
    const { container } = render(
      <AppProvider>
        <Shell />
      </AppProvider>,
    );
    await screen.findByText(/Hey, Rowan!/);

    const boxes = container.querySelectorAll('[data-scroll-box]');
    expect(boxes).toHaveLength(1);
    expect(screen.getByText(/Hey, Rowan!/).closest('[data-scroll-box]')).toBe(boxes[0]);

    const scrolling = [...container.querySelectorAll('*')].filter(scrolls);
    expect(scrolling).toEqual([boxes[0]]);

    // the page around it is clipped, not hidden (script, focus and the keyboard can still move a hidden box); jsdom does not know `clip`, so the stylesheet is read
    const sheet = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const selector of ['html', 'body', '#root', '.sf-shell']) {
      const rules = [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selectors]) => selectors.split(',').some((s) => s.trim() === selector));
      expect(rules.map(([, , body]) => body).join('\n'), selector).toMatch(/overflow:\s*clip/);
    }
    expect(container.querySelector('[data-shell]')).toHaveClass('sf-shell');
  });
});

describe('focusWithoutScroll', () => {
  it('focuses with preventScroll: true', () => {
    const el = document.createElement('input');
    const focus = vi.spyOn(el, 'focus');
    focusWithoutScroll(el);
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it('takes a missing box (a ref not set yet) without a word', () => {
    expect(() => focusWithoutScroll(null)).not.toThrow();
    expect(() => focusOnMount(null)).not.toThrow();
  });

  it('focusOnMount is the ref that focuses a field when it appears', () => {
    render(<input aria-label="name" ref={focusOnMount} />);
    expect(screen.getByLabelText('name')).toHaveFocus();
  });
});

describe('the scroll guard', () => {
  let stop: () => void;
  beforeEach(() => {
    stop = installScrollGuard();
  });
  afterEach(() => stop());

  it('puts a scrolled page, body and shell back at the top', () => {
    const shell = document.createElement('div');
    shell.setAttribute('data-shell', '');
    document.body.appendChild(shell);
    for (const el of [document.documentElement, document.body, shell]) el.scrollTop = 120;
    resetPageScroll();
    for (const el of [document.documentElement, document.body, shell]) expect(el.scrollTop).toBe(0);
    shell.remove();
  });

  it('does it on pageshow, and on a scroll of the body, but leaves the scroll box alone', () => {
    const box = document.createElement('div');
    box.setAttribute('data-scroll-box', '');
    document.body.append(box);
    box.scrollTop = 80;
    document.body.scrollTop = 50;
    fireEvent.scroll(box);
    expect(box.scrollTop).toBe(80);

    fireEvent.scroll(document.body);
    expect(document.body.scrollTop).toBe(0);

    document.body.scrollTop = 50;
    window.dispatchEvent(new Event('pageshow'));
    expect(document.body.scrollTop).toBe(0);
    box.remove();
  });
});

describe('autoFocus', () => {
  // Plain focus scrolls the page under the status bar; a ref through src/shell/focus.ts does not. The two that stay
  // are the grown-ups' boxes: the profile's name at setup and a word list's word being edited.
  const GROWN_UPS_BOXES = [
    'src/features/onboarding/first-run.tsx',
    'src/features/word-lists/word-list-detail.tsx',
  ];

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it('is found nowhere in src outside the grown-ups boxes', () => {
    const found = sources('src').filter((path) => /\bautoFocus\b/.test(readFileSync(path, 'utf-8')));
    expect(found.filter((path) => !GROWN_UPS_BOXES.includes(path))).toEqual([]);
  });
});
