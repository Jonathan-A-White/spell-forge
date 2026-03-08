// src/accessibility/settings.ts — settings state management & CSS variable mapping

import type { AccessibilitySettings } from '../contracts/types.ts';
import { DEFAULT_SETTINGS } from './defaults.ts';

// ─── Validation / clamping ──────────────────────────────────────

const FONT_WEIGHT_VALUES: Record<AccessibilitySettings['fontWeight'], number> = {
  'normal': 400,
  'bold': 700,
  'extra-bold': 800,
};

const VALID_FONT_WEIGHTS = new Set<string>(['normal', 'bold', 'extra-bold']);
const VALID_CONTRAST_MODES = new Set<string>(['light', 'dark', 'high-contrast']);
const VALID_VOICE_PREFERENCES = new Set<string>(['female', 'male']);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Returns a new settings object with every numeric value clamped to its
 * valid range and every enum value coerced to a legal member.
 */
export function validateSettings(raw: Partial<AccessibilitySettings>): AccessibilitySettings {
  const base = { ...DEFAULT_SETTINGS, ...raw };

  return {
    fontSize: clamp(base.fontSize, 16, 48),
    fontWeight: VALID_FONT_WEIGHTS.has(base.fontWeight)
      ? base.fontWeight
      : DEFAULT_SETTINGS.fontWeight,
    fontFamily: base.fontFamily || DEFAULT_SETTINGS.fontFamily,
    letterSpacing: clamp(base.letterSpacing, 0, 0.3),
    lineHeight: clamp(base.lineHeight, 1.2, 2.5),
    contrastMode: VALID_CONTRAST_MODES.has(base.contrastMode)
      ? base.contrastMode
      : DEFAULT_SETTINGS.contrastMode,
    backgroundColor: base.backgroundColor || DEFAULT_SETTINGS.backgroundColor,
    reducedMotion: Boolean(base.reducedMotion),
    tapTargetSize: clamp(base.tapTargetSize, 48, 72),
    sessionMaxMinutes: Math.max(1, base.sessionMaxMinutes),
    sessionAdaptive: Boolean(base.sessionAdaptive),
    dailyGoalMinutes: Math.max(1, base.dailyGoalMinutes),
    voicePreference: VALID_VOICE_PREFERENCES.has(base.voicePreference)
      ? base.voicePreference
      : DEFAULT_SETTINGS.voicePreference,
  };
}

// ─── CSS custom-property mapping ────────────────────────────────

/**
 * Applies the given settings as CSS custom properties on
 * `document.documentElement` so that every component inherits them.
 */
export function applySettings(settings: AccessibilitySettings): void {
  const el = document.documentElement;

  el.style.setProperty('--sf-font-size', `${settings.fontSize}px`);
  el.style.setProperty('--sf-font-weight', String(FONT_WEIGHT_VALUES[settings.fontWeight]));
  el.style.setProperty('--sf-font-family', settings.fontFamily);
  el.style.setProperty('--sf-letter-spacing', `${settings.letterSpacing}em`);
  el.style.setProperty('--sf-line-height', String(settings.lineHeight));
  el.style.setProperty('--sf-background-color', settings.backgroundColor);
  el.style.setProperty('--sf-tap-target-size', `${settings.tapTargetSize}px`);
  el.style.setProperty(
    '--sf-reduced-motion',
    settings.reducedMotion ? 'reduce' : 'no-preference',
  );

  // Apply color mode via data-theme attribute
  const theme = VALID_CONTRAST_MODES.has(settings.contrastMode)
    ? settings.contrastMode
    : 'light';
  el.setAttribute('data-theme', theme);
}

// ─── Merge helper ───────────────────────────────────────────────

/**
 * Immutably merge a single setting into an existing settings object,
 * re-validating after the merge.
 */
export function mergeSetting<K extends keyof AccessibilitySettings>(
  current: AccessibilitySettings,
  key: K,
  value: AccessibilitySettings[K],
): AccessibilitySettings {
  return validateSettings({ ...current, [key]: value });
}
