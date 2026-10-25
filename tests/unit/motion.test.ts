// The motion rules (mw-79en7t.76): src/look/motion.ts names every duration and easing, index.css's @theme holds the same numbers, and
// nothing under src/ carries a raw duration of its own. docs/motion.md is the written rule.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DURATION, EASING, reducedMotion } from '../../src/look';

const root = join(__dirname, '..', '..');
const css = readFileSync(join(root, 'src/index.css'), 'utf8');

/** The `@theme static { ... }` block of index.css, where the motion tokens live. */
function themeBlock(): string {
  const start = css.indexOf('@theme static');
  expect(start, 'index.css has an @theme static block for the motion tokens').toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('\n}', start));
}

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(path);
  }
  return out;
}

const camel = (slug: string): string => slug.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

describe('motion tokens', () => {
  it('motion.ts holds every --sf-duration-* of the @theme block, in milliseconds', () => {
    const tokens = [...themeBlock().matchAll(/--sf-duration-([\w-]+):\s*(\d+)ms;/g)];
    expect(tokens.length).toBeGreaterThan(5);
    for (const [, slug, ms] of tokens) {
      expect(DURATION[camel(slug) as keyof typeof DURATION], `--sf-duration-${slug}`).toBe(Number(ms));
    }
    expect(Object.keys(DURATION).sort()).toEqual(tokens.map(([, slug]) => camel(slug)).sort());
  });

  it('motion.ts holds every --ease-sf-* of the @theme block', () => {
    const tokens = [...themeBlock().matchAll(/--ease-sf-([\w-]+):\s*([^;]+);/g)];
    expect(tokens.length).toBeGreaterThan(1);
    for (const [, slug, value] of tokens) {
      expect(EASING[camel(slug) as keyof typeof EASING], `--ease-sf-${slug}`).toBe(value.trim());
    }
    expect(Object.keys(EASING).sort()).toEqual(tokens.map(([, slug]) => camel(slug)).sort());
  });
});

describe('reducedMotion()', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is true when the phone asks for less motion, false when it does not or cannot say', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    expect(reducedMotion()).toBe(true);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(reducedMotion()).toBe(false);
    vi.stubGlobal('matchMedia', undefined);
    expect(reducedMotion()).toBe(false);
  });
});

describe('the sweep: no raw duration under src/', () => {
  // A raw duration is a Tailwind duration-/delay-/ease-/animate- class that is not one of ours, an inline animation or transition with a
  // number of seconds in it, or an SVG `dur=` with one. The tokens live in src/look/motion.ts and the @theme static block of index.css.
  const RAW: Array<[string, RegExp]> = [
    ['duration-/delay-N or duration-[..]', /(?<![\w-])(?:duration|delay)-(?:\d|\[)/],
    ['ease-keyword', /(?<![\w-])ease-(?!sf-)/],
    ['animate-class that is not animate-sf-*', /(?<![\w-])animate-(?!sf-)[a-z]/],
    ['animation/transition with seconds', /\b(?:animation|transition)(?:-duration|-delay)?\s*:[^;]*\b\d*\.?\d+m?s\b/],
    ['animation/transition inline with seconds', /\b(?:animation|transition)(?:Duration|Delay)?\s*:\s*[`'"][^`'"]*\b\d+\.?\d*m?s\b/],
    ['style animationDuration/animationDelay with seconds', /\banimation(?:Duration|Delay)\s*:\s*[`'"][^`'"]*\d+\.?\d*m?s\b/],
    ['SVG dur="Ns"', /\bdur=["']\d/],
  ];

  it('finds none', () => {
    const found: string[] = [];
    for (const file of sources(join(root, 'src'))) {
      const rel = relative(root, file);
      if (rel.startsWith('src/look/')) continue;
      let text = readFileSync(file, 'utf8');
      if (rel === 'src/index.css') text = text.replace(/@theme static \{[^}]*\}/, '');
      text.split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        for (const [what, pattern] of RAW) if (pattern.test(line)) found.push(`${rel}:${i + 1} (${what}): ${line.trim()}`);
      });
    }
    expect(found, found.join('\n')).toEqual([]);
  });
});

describe('native-feel CSS (topic 08)', () => {
  it('index.css takes the 300 ms out of the tap, the highlight off it and the selection off controls', () => {
    expect(css).toMatch(/touch-action:\s*manipulation/);
    expect(css).toMatch(/-webkit-tap-highlight-color:\s*transparent/);
    expect(css).toMatch(/user-select:\s*none/);
  });

  it("home-screen.tsx's hover layers do not take the pointer", () => {
    const lines = readFileSync(join(root, 'src/features/dashboard/home-screen.tsx'), 'utf8')
      .split('\n')
      .filter((line) => line.includes('group-hover:opacity-100'));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line, line).toContain('pointer-events-none');
  });
});

describe('docs/motion.md', () => {
  it('says what moves, how long, reduced motion and pause when hidden', () => {
    const doc = readFileSync(join(root, 'docs/motion.md'), 'utf8');
    for (const heading of [/what moves/i, /how long/i, /reduced motion/i, /hidden/i]) expect(doc).toMatch(heading);
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toContain('docs/motion.md');
  });
});
