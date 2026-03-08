// src/accessibility/defaults.ts — conservative defaults optimised for double vision

import type { AccessibilitySettings } from '../contracts/types.ts';

/**
 * Conservative default settings designed for users with double vision.
 * Large text, bold weight, generous spacing, reduced motion, and
 * a warm cream background to minimise glare.
 */
export const DEFAULT_SETTINGS: Readonly<AccessibilitySettings> = {
  fontSize: 24,
  fontWeight: 'bold',
  fontFamily: 'system-ui, sans-serif',
  letterSpacing: 0.05,
  lineHeight: 1.6,
  contrastMode: 'light',
  backgroundColor: '#FFF8E7',
  reducedMotion: true,
  tapTargetSize: 56,
  sessionMaxMinutes: 10,
  sessionAdaptive: true,
  dailyGoalMinutes: 5,
  voicePreference: 'female',
} as const;
