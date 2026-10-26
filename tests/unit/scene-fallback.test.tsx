// The front door's scene (Kestrel look B, mw-79en7t.77): a WebGL picture behind the door, drawn with OGL in a lazy chunk. With no WebGL
// or with reduced motion the still fallback is drawn instead and no canvas context is ever asked for; when the page is hidden the scene
// asks for no more frames (a hand-turned clock in place of src/look/scene/clock.ts's browser one); and every requestAnimationFrame loop
// under src/ goes through that clock (the sweep). docs/motion.md is the written rule.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// OGL drawn by hand: jsdom has no WebGL. Like the real Renderer, it asks the canvas for a context and has no gl when none comes.
const ogl = vi.hoisted(() => ({ renders: 0, time: 0 }));
vi.mock('ogl', () => {
  class Renderer {
    gl: (WebGLRenderingContext & { canvas: HTMLCanvasElement }) | undefined;
    constructor({ canvas }: { canvas: HTMLCanvasElement }) {
      const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
      this.gl = gl ? Object.assign(gl, { canvas }) : undefined;
    }
    setSize() {}
    render({ scene }: { scene: { program: { uniforms: { uTime: { value: number } } } } }) {
      ogl.renders += 1;
      ogl.time = scene.program.uniforms.uTime.value;
    }
  }
  class Program {
    uniforms: Record<string, { value: unknown }>;
    constructor(_gl: unknown, options: { uniforms: Record<string, { value: unknown }> }) {
      this.uniforms = options.uniforms;
    }
    remove() {}
  }
  class Triangle {
    remove() {}
  }
  class Mesh {
    program: unknown;
    constructor(_gl: unknown, { program }: { program: unknown }) {
      this.program = program;
    }
  }
  class Vec2 {
    x = 0;
    y = 0;
    set(x: number, y: number) {
      this.x = x;
      this.y = y;
      return this;
    }
  }
  return { Renderer, Program, Triangle, Mesh, Vec2 };
});

import { SceneOrFallback, clock, animate } from '../../src/look/scene';
import FrontDoorScene from '../../src/look/scene/FrontDoorScene';
import { ThemeEffects } from '../../src/themes';

/** A clock turned by the test: frames wait until `turn`, and the time moves only when it is turned. */
function handTurnedClock() {
  const saved = { ...clock };
  let time = 0;
  let nextId = 1;
  const frames = new Map<number, (time: number) => void>();
  clock.now = () => time;
  clock.frame = (callback) => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  };
  clock.cancelFrame = (id) => {
    frames.delete(id);
  };
  return {
    /** Frames asked for and not yet given. */
    pending: () => frames.size,
    /** Moves the time on by `ms` and gives every frame asked for. */
    turn(ms = 40) {
      time += ms;
      const due = [...frames.values()];
      frames.clear();
      act(() => due.forEach((callback) => callback(time)));
    },
    restore: () => Object.assign(clock, saved),
  };
}

let visibility: DocumentVisibilityState = 'visible';
function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

const reduceMotion = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion: reduce'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));

/** A browser that has WebGL: the constructor is there and the canvas hands over a (fake) context. */
function haveWebGL(context: object | null = {}) {
  vi.stubGlobal('WebGLRenderingContext', class {});
  return vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((kind: string) =>
    kind === 'webgl2' || kind === 'webgl' ? context : null) as HTMLCanvasElement['getContext']);
}

let hand: ReturnType<typeof handTurnedClock>;

beforeEach(() => {
  ogl.renders = 0;
  ogl.time = 0;
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => visibility === 'hidden' });
  hand = handTurnedClock();
});

afterEach(() => {
  cleanup();
  hand.restore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the fallback (AC1)', () => {
  it('with no WebGL draws the fallback and never asks a canvas for a context', async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    reduceMotion(false);
    render(<SceneOrFallback />);
    expect(await screen.findByTestId('scene-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('scene-canvas')).toBeNull();
    expect(getContext).not.toHaveBeenCalled();
    expect(hand.pending()).toBe(0);
  });

  it('with prefers-reduced-motion draws the fallback and never asks a canvas for a context, even with WebGL', async () => {
    const getContext = haveWebGL();
    reduceMotion(true);
    render(<SceneOrFallback />);
    expect(await screen.findByTestId('scene-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('scene-canvas')).toBeNull();
    expect(getContext).not.toHaveBeenCalled();
    expect(hand.pending()).toBe(0);
  });

  it('with WebGL and motion loads the scene and draws it on the clock', async () => {
    const getContext = haveWebGL();
    reduceMotion(false);
    render(<SceneOrFallback />);
    expect(await screen.findByTestId('scene-canvas')).toBeInTheDocument();
    // the chunk's effect asks for the context and the first frame once it has run
    await waitFor(() => expect(hand.pending()).toBe(1));
    expect(getContext).toHaveBeenCalled();
    hand.turn();
    expect(ogl.renders).toBeGreaterThan(0);
  });

  it('falls back when the canvas will not give a WebGL context', async () => {
    const getContext = haveWebGL(null);
    reduceMotion(false);
    render(<SceneOrFallback />);
    // the scene was tried (not just the still picture shown while its chunk loads), and gave way
    await waitFor(() => expect(getContext).toHaveBeenCalled());
    expect(await screen.findByTestId('scene-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('scene-canvas')).toBeNull();
    expect(hand.pending()).toBe(0);
  });

  it('falls back when the phone takes the context away', async () => {
    haveWebGL();
    reduceMotion(false);
    render(<SceneOrFallback />);
    const canvas = await screen.findByTestId('scene-canvas');
    await waitFor(() => expect(hand.pending()).toBe(1));
    act(() => {
      canvas.dispatchEvent(new Event('webglcontextlost'));
    });
    expect(await screen.findByTestId('scene-fallback')).toBeInTheDocument();
    expect(hand.pending()).toBe(0);
  });
});

describe('paused when hidden (AC1, a hand-turned clock)', () => {
  it('the scene stops asking for frames while the page is hidden, and starts again when it shows', () => {
    haveWebGL();
    render(<FrontDoorScene onFail={() => {}} />);
    expect(hand.pending()).toBe(1);
    hand.turn();
    hand.turn();
    const drawn = ogl.renders;
    expect(drawn).toBeGreaterThan(0);
    expect(hand.pending()).toBe(1);

    setVisibility('hidden');
    expect(hand.pending()).toBe(0);
    hand.turn();
    hand.turn();
    expect(ogl.renders).toBe(drawn);
    expect(hand.pending()).toBe(0);

    setVisibility('visible');
    expect(hand.pending()).toBe(1);
    hand.turn();
    expect(ogl.renders).toBeGreaterThan(drawn);
  });

  it('the scene picks up where it was after the page was hidden: the hidden time does not move the ink', () => {
    haveWebGL();
    render(<FrontDoorScene onFail={() => {}} />);
    hand.turn();
    hand.turn();
    const before = ogl.time;
    setVisibility('hidden');
    hand.turn(60_000);
    setVisibility('visible');
    hand.turn();
    expect(ogl.time).toBe(before);
    hand.turn();
    expect(ogl.time).toBe(before + 40);
  });

  it('the scene asks for no frame once it is gone', () => {
    haveWebGL();
    const { unmount } = render(<FrontDoorScene onFail={() => {}} />);
    expect(hand.pending()).toBe(1);
    unmount();
    expect(hand.pending()).toBe(0);
  });

  it('animate() steps each frame while the page shows, asks nothing while hidden, and stop() ends it', () => {
    const steps: number[] = [];
    const stop = animate((_time, dt) => steps.push(dt));
    hand.turn(16);
    hand.turn(16);
    expect(steps).toEqual([0, 16]);
    setVisibility('hidden');
    expect(hand.pending()).toBe(0);
    hand.turn(1000);
    expect(steps).toHaveLength(2);
    setVisibility('visible');
    hand.turn(16);
    // the hidden time is not a step: the loop starts again from rest
    expect(steps).toEqual([0, 16, 0]);
    stop();
    expect(hand.pending()).toBe(0);
    setVisibility('hidden');
    setVisibility('visible');
    expect(hand.pending()).toBe(0);
  });

  it('animate() started on a hidden page waits for it to show', () => {
    setVisibility('hidden');
    const stop = animate(() => {});
    expect(hand.pending()).toBe(0);
    setVisibility('visible');
    expect(hand.pending()).toBe(1);
    stop();
  });

  it("the themed hero's canvas loop runs on the clock and stops while hidden", () => {
    const ctx = new Proxy({}, { get: () => () => {} });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    render(<ThemeEffects themeId="star-trail" />);
    expect(hand.pending()).toBe(1);
    hand.turn();
    expect(hand.pending()).toBe(1);
    setVisibility('hidden');
    expect(hand.pending()).toBe(0);
    setVisibility('visible');
    expect(hand.pending()).toBe(1);
  });
});

describe('the sweep: every requestAnimationFrame loop goes through src/look/scene/clock.ts (AC4)', () => {
  const root = join(__dirname, '..', '..');
  // One frame asked for once, not a loop: allowed outside the clock, each with its reason.
  const ONE_SHOTS: Record<string, string> = {
    'src/shell/focus.ts': 'one frame after the keyboard closes, to reset the page scroll; never asks again',
  };

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  }

  const callers = sources(join(root, 'src'))
    .map((path) => ({ rel: relative(root, path).replaceAll('\\', '/'), text: readFileSync(path, 'utf8') }))
    .filter(({ text }) => /\brequestAnimationFrame\s*\(/.test(text));

  it('finds the clock among the callers', () => {
    expect(callers.map((c) => c.rel)).toContain('src/look/scene/clock.ts');
  });

  it.each(callers.filter((c) => c.rel !== 'src/look/scene/clock.ts').map((c) => [c.rel, c.text] as const))(
    '%s asks for a frame only once, and is a known one-shot',
    (rel, text) => {
      expect(ONE_SHOTS[rel], `${rel} calls requestAnimationFrame: a loop goes through animate() in src/look/scene/clock.ts`).toBeDefined();
      expect(text.match(/\brequestAnimationFrame\s*\(/g)).toHaveLength(1);
    },
  );

  it('the clock is the one place a loop asks for frames, and it listens for the page hiding', () => {
    const text = readFileSync(join(root, 'src/look/scene/clock.ts'), 'utf8');
    expect(text).toMatch(/visibilitychange/);
    expect(text.match(/\brequestAnimationFrame\s*\(/g)).toHaveLength(1);
  });

  it('the themed hero and the scene animate through the clock', () => {
    for (const rel of ['src/themes/theme-effects.tsx', 'src/look/scene/FrontDoorScene.tsx']) {
      const text = readFileSync(join(root, rel), 'utf8');
      expect(text, rel).toMatch(/\banimate\(/);
      expect(text, rel).not.toMatch(/\brequestAnimationFrame\b/);
    }
  });
});
