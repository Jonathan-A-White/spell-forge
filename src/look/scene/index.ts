// src/look/scene — the scene behind the front door (WebGL with OGL, a lazy chunk), its still fallback, and the scene clock that every
// requestAnimationFrame loop in the app goes through (docs/motion.md).
export { SceneOrFallback, SceneFallback } from './fallback';
export { clock, animate, markScenePainted, SCENE_PAINTED_MARK } from './clock';
export type { Clock } from './clock';
export { sceneAllowed, webglKnown } from './webgl-support';
