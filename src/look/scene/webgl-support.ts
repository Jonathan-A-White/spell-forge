// src/look/scene/webgl-support.ts — whether the front door's WebGL scene may be drawn, asked without touching a canvas: a phone
// that asks for less motion gets the still fallback, and so does a browser with no WebGL at all. A browser that has WebGL but will
// not give a context (blocklisted GPU, too many contexts) is found when the scene asks, and it falls back then (FrontDoorScene).
import { reducedMotion } from '../motion';

/** True when the browser knows WebGL at all. Never creates a context. */
export function webglKnown(): boolean {
  return typeof WebGLRenderingContext !== 'undefined' || typeof WebGL2RenderingContext !== 'undefined';
}

/** True when the scene may be tried: WebGL is known and the phone does not ask for less motion. */
export function sceneAllowed(): boolean {
  return webglKnown() && !reducedMotion();
}
