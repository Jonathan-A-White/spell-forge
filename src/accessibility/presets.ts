// src/accessibility/presets.ts — named accessibility presets

import type { AccessibilitySettings } from '../contracts/types.ts';
import { DEFAULT_SETTINGS } from './defaults.ts';
import { validateSettings } from './settings.ts';

export interface NamedPreset {
  name: string;
  description: string;
  settings: AccessibilitySettings;
}

/**
 * Built-in presets. Each one spreads from the conservative defaults and
 * overrides only the properties relevant to the use case.
 */
export const PRESETS: readonly NamedPreset[] = [
  {
    name: 'Default',
    description: 'Conservative defaults for double vision',
    settings: { ...DEFAULT_SETTINGS },
  },
  {
    name: 'High Visibility',
    description: 'Extra-large, extra-bold text with maximum contrast',
    settings: validateSettings({
      ...DEFAULT_SETTINGS,
      fontSize: 32,
      fontWeight: 'extra-bold',
      letterSpacing: 0.15,
      contrastMode: 'high-contrast',
      tapTargetSize: 72,
    }),
  },
  {
    name: 'Dyslexia Friendly',
    description: 'OpenDyslexic font with generous spacing',
    settings: validateSettings({
      ...DEFAULT_SETTINGS,
      fontFamily: 'OpenDyslexic, sans-serif',
      letterSpacing: 0.1,
      lineHeight: 2.0,
      backgroundColor: '#FFFDE7',
    }),
  },
  {
    name: 'Minimal',
    description: 'Smaller text, standard weight, no motion restrictions',
    settings: validateSettings({
      ...DEFAULT_SETTINGS,
      fontSize: 18,
      fontWeight: 'normal',
      letterSpacing: 0,
      reducedMotion: false,
      tapTargetSize: 48,
    }),
  },
] as const;

/**
 * Look up a preset by name (case-insensitive).
 * Returns `undefined` when no preset matches.
 */
export function getPreset(name: string): NamedPreset | undefined {
  const lower = name.toLowerCase();
  return PRESETS.find((p) => p.name.toLowerCase() === lower);
}
