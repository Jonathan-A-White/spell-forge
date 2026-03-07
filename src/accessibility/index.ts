// src/accessibility/index.ts — barrel export

export { DEFAULT_SETTINGS } from './defaults.ts';
export { validateSettings, applySettings, mergeSetting } from './settings.ts';
export { PRESETS, getPreset } from './presets.ts';
export type { NamedPreset } from './presets.ts';
