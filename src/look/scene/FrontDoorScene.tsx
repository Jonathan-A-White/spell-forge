// src/look/scene/FrontDoorScene.tsx — the live scene behind the front door, drawn with OGL (a lazy chunk: fallback.tsx imports it
// with React.lazy, so OGL is fetched only when the scene may be drawn). One full-screen triangle and one fragment shader: the
// theme's colours drifting like ink through paper, slowly, with a paper grain that does not move. It runs on the scene clock
// (clock.ts), so it asks for no frame while the page is hidden, and draws at most DRAW_EVERY_MS apart to spare the battery
// (vault topic 11). If WebGL will not start, or the phone takes the context away, it hands back to the still fallback (onFail).
import { useEffect, useRef } from 'react';
import { Mesh, Program, Renderer, Triangle, Vec2 } from 'ogl';
import { animate, markScenePainted } from './clock';

export interface FrontDoorSceneProps {
  /** WebGL would not start, or was lost: show the still picture instead. */
  onFail: () => void;
}

/** About thirty frames a second: the ink moves slowly, so more would only spend the battery. */
const DRAW_EVERY_MS = 33;
/** Pixels drawn per CSS pixel, at most: the picture is soft, so the phone's full density is not needed. */
const MAX_DPR = 1;

/** What each colour is when the theme does not say: SpellForge's light paper, its blue and its gold. */
const DEFAULTS = {
  '--sf-color-bg': [0.97, 0.96, 0.93],
  '--sf-color-primary': [0.23, 0.36, 0.85],
  '--sf-color-accent': [0.96, 0.65, 0.14],
} as const satisfies Record<string, readonly [number, number, number]>;

type Rgb = [number, number, number];

/** A CSS colour (#rgb, #rrggbb, rgb() or rgba()) as 0..1 channels, or null for anything else. */
function parseColour(value: string): Rgb | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d) : hex[1].match(/../g)!;
    return digits.map((d) => parseInt(d, 16) / 255) as Rgb;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(text);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(1, Number(n) / 255)) as Rgb;
  return null;
}

/** The theme's colours where the canvas sits (the theme engine sets them as custom properties); the paper is the accessibility
 * settings' own background when one is chosen, as #root's is. */
function themeColours(element: Element): { paper: Rgb; ink: Rgb; gold: Rgb } {
  const style = getComputedStyle(element);
  const read = (name: string): Rgb | null => parseColour(style.getPropertyValue(name));
  return {
    paper: read('--sf-background-color') ?? read('--sf-color-bg') ?? [...DEFAULTS['--sf-color-bg']],
    ink: read('--sf-color-primary') ?? [...DEFAULTS['--sf-color-primary']],
    gold: read('--sf-color-accent') ?? [...DEFAULTS['--sf-color-accent']],
  };
}

const VERTEX = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uGold;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = vec2(vUv.x * uResolution.x / max(uResolution.y, 1.0), vUv.y);
  float t = uTime * 0.00003;
  // ink bleeding through paper: noise bent by noise, drifting
  vec2 q = vec2(fbm(p * 1.4 + vec2(t, 0.3 * t)), fbm(p * 1.4 + vec2(5.2 - t, 1.3)));
  float ink = fbm(p * 2.0 + q * 1.6 + vec2(0.5 * t, -t));
  vec3 colour = uPaper;
  colour = mix(colour, uInk, smoothstep(0.42, 0.86, ink) * 0.26);
  colour = mix(colour, uGold, smoothstep(0.58, 0.92, q.y) * 0.16);
  // light from above, a soft edge below
  colour *= 0.94 + 0.08 * vUv.y;
  float edge = length((vUv - 0.5) * vec2(1.1, 0.9));
  colour *= 1.0 - 0.18 * smoothstep(0.45, 0.95, edge);
  // the paper's grain, still
  colour += (hash(floor(gl_FragCoord.xy)) - 0.5) * 0.03;
  gl_FragColor = vec4(colour, 1.0);
}
`;

export default function FrontDoorScene({ onFail }: FrontDoorSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: Renderer;
    try {
      renderer = new Renderer({ canvas, dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR), alpha: true, depth: false, antialias: false });
    } catch {
      failRef.current();
      return;
    }
    const gl = renderer.gl;
    if (!gl) {
      failRef.current();
      return;
    }

    const colours = themeColours(canvas);
    const resolution = new Vec2(1, 1);
    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: resolution },
        uPaper: { value: colours.paper },
        uInk: { value: colours.ink },
        uGold: { value: colours.gold },
      },
    });
    if (typeof gl.getProgramParameter === 'function' && !gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
      program.remove();
      geometry.remove();
      failRef.current();
      return;
    }
    const mesh = new Mesh(gl, { geometry, program });

    // measured on the scene's box, not the canvas: OGL writes the size it is given into the canvas's own style
    const box = canvas.parentElement ?? canvas;
    const resize = () => {
      const width = Math.max(1, box.clientWidth);
      const height = Math.max(1, box.clientHeight);
      renderer.setSize(width, height);
      // the drawing buffer takes the measured size; the canvas itself keeps scene.css's, so it always fills the box
      canvas.style.removeProperty('width');
      canvas.style.removeProperty('height');
      resolution.set(width, height);
    };
    resize();
    window.addEventListener('resize', resize);

    let lastDraw = -Infinity;
    let started: number | null = null;
    let shown = false;
    const stop = animate((time) => {
      if (time - lastDraw < DRAW_EVERY_MS) return;
      lastDraw = time;
      // the time since the scene opened, so the shader's numbers stay small (a phone's mediump float is coarse)
      started ??= time;
      program.uniforms.uTime.value = time - started;
      renderer.render({ scene: mesh });
      if (!shown) {
        shown = true;
        canvas.dataset.drawn = '';
        markScenePainted();
      }
    });

    const lost = (event: Event) => {
      event.preventDefault();
      stop();
      failRef.current();
    };
    canvas.addEventListener('webglcontextlost', lost);

    return () => {
      stop();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', lost);
      program.remove();
      geometry.remove();
    };
  }, []);

  return (
    <div className="sf-scene sf-scene-still" data-testid="scene-live" aria-hidden="true">
      <canvas ref={canvasRef} className="sf-scene-canvas" data-testid="scene-canvas" />
    </div>
  );
}
