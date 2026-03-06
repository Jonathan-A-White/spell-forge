// src/accessibility/hooks.ts — React hook for accessibility settings

import { useState, useCallback, useEffect } from 'react';
import type { AccessibilitySettings } from '../contracts/types.ts';
import { DEFAULT_SETTINGS } from './defaults.ts';
import { applySettings, mergeSetting, validateSettings } from './settings.ts';
import { PRESETS, getPreset } from './presets.ts';
import type { NamedPreset } from './presets.ts';

export interface UseAccessibilityReturn {
  settings: AccessibilitySettings;
  updateSetting: (
    key: keyof AccessibilitySettings,
    value: AccessibilitySettings[keyof AccessibilitySettings],
  ) => void;
  applyPreset: (name: string) => void;
  presets: readonly NamedPreset[];
}

/**
 * Central React hook for reading and writing accessibility settings.
 * On mount (and on every change) the settings are pushed to CSS
 * custom properties via `applySettings()`.
 */
export function useAccessibility(): UseAccessibilityReturn {
  const [settings, setSettings] = useState<AccessibilitySettings>(
    () => validateSettings(DEFAULT_SETTINGS),
  );

  // Push to CSS whenever settings change
  useEffect(() => {
    applySettings(settings);
  }, [settings]);

  const updateSetting = useCallback(
    (
      key: keyof AccessibilitySettings,
      value: AccessibilitySettings[keyof AccessibilitySettings],
    ) => {
      setSettings((prev) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mergeSetting(prev, key, value as any),
      );
    },
    [],
  );

  const applyPresetByName = useCallback((name: string) => {
    const preset = getPreset(name);
    if (preset) {
      setSettings(validateSettings(preset.settings));
    }
  }, []);

  return {
    settings,
    updateSetting,
    applyPreset: applyPresetByName,
    presets: PRESETS,
  };
}
