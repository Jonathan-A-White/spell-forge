import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults.ts';
import {
  validateSettings,
  applySettings,
  mergeSetting,
} from '../../src/accessibility/settings.ts';
import { PRESETS, getPreset } from '../../src/accessibility/presets.ts';
import type { AccessibilitySettings } from '../../src/contracts/types.ts';

// ─── Default settings ───────────────────────────────────────────

describe('DEFAULT_SETTINGS', () => {
  it('matches the spec values', () => {
    expect(DEFAULT_SETTINGS.fontSize).toBe(24);
    expect(DEFAULT_SETTINGS.fontWeight).toBe('bold');
    expect(DEFAULT_SETTINGS.fontFamily).toBe('system-ui, sans-serif');
    expect(DEFAULT_SETTINGS.letterSpacing).toBe(0.05);
    expect(DEFAULT_SETTINGS.lineHeight).toBe(1.6);
    expect(DEFAULT_SETTINGS.contrastMode).toBe('light');
    expect(DEFAULT_SETTINGS.backgroundColor).toBe('#FFF8E7');
    expect(DEFAULT_SETTINGS.reducedMotion).toBe(true);
    expect(DEFAULT_SETTINGS.tapTargetSize).toBe(56);
    expect(DEFAULT_SETTINGS.sessionMaxMinutes).toBe(10);
    expect(DEFAULT_SETTINGS.sessionAdaptive).toBe(true);
    expect(DEFAULT_SETTINGS.dailyGoalMinutes).toBe(5);
    expect(DEFAULT_SETTINGS.voicePreference).toBe('female');
  });
});

// ─── CSS variable mapping ───────────────────────────────────────

describe('applySettings', () => {
  let setPropertySpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setPropertySpy = vi.fn();
    // jsdom provides document.documentElement; spy on setProperty
    vi.spyOn(document.documentElement.style, 'setProperty').mockImplementation(
      setPropertySpy as (property: string, value: string | null, priority?: string) => void,
    );
  });

  it('sets --sf-font-size with px suffix', () => {
    applySettings(DEFAULT_SETTINGS);
    expect(setPropertySpy).toHaveBeenCalledWith('--sf-font-size', '24px');
  });

  it('maps fontWeight "bold" to 700', () => {
    applySettings(DEFAULT_SETTINGS);
    expect(setPropertySpy).toHaveBeenCalledWith('--sf-font-weight', '700');
  });

  it('maps fontWeight "normal" to 400', () => {
    applySettings({ ...DEFAULT_SETTINGS, fontWeight: 'normal' });
    expect(setPropertySpy).toHaveBeenCalledWith('--sf-font-weight', '400');
  });

  it('maps fontWeight "extra-bold" to 800', () => {
    applySettings({ ...DEFAULT_SETTINGS, fontWeight: 'extra-bold' });
    expect(setPropertySpy).toHaveBeenCalledWith('--sf-font-weight', '800');
  });

  it('sets --sf-font-family', () => {
    applySettings(DEFAULT_SETTINGS);
    expect(setPropertySpy).toHaveBeenCalledWith(
      '--sf-font-family',
      'system-ui, sans-serif',
    );
  });

  it('sets --sf-letter-spacing with em suffix', () => {
    applySettings(DEFAULT_SETTINGS);
    expect(setPropertySpy).toHaveBeenCalledWith('--sf-letter-spacing', '0.05em');
  });

  it('sets --sf-line-height as plain number', () => {
    applySettings(DEFAULT_SETTINGS);
    expect(setPropertySpy).toHaveBeenCalledWith('--sf-line-height', '1.6');
  });

  it('sets --sf-background-color', () => {
    applySettings(DEFAULT_SETTINGS);
    expect(setPropertySpy).toHaveBeenCalledWith(
      '--sf-background-color',
      '#FFF8E7',
    );
  });

  it('sets --sf-tap-target-size with px suffix', () => {
    applySettings(DEFAULT_SETTINGS);
    expect(setPropertySpy).toHaveBeenCalledWith('--sf-tap-target-size', '56px');
  });

  it('sets --sf-reduced-motion to "reduce" when true', () => {
    applySettings(DEFAULT_SETTINGS);
    expect(setPropertySpy).toHaveBeenCalledWith(
      '--sf-reduced-motion',
      'reduce',
    );
  });

  it('sets --sf-reduced-motion to "no-preference" when false', () => {
    applySettings({ ...DEFAULT_SETTINGS, reducedMotion: false });
    expect(setPropertySpy).toHaveBeenCalledWith(
      '--sf-reduced-motion',
      'no-preference',
    );
  });
});

// ─── Validation / clamping ──────────────────────────────────────

describe('validateSettings', () => {
  it('clamps fontSize below minimum to 16', () => {
    const s = validateSettings({ fontSize: 10 });
    expect(s.fontSize).toBe(16);
  });

  it('clamps fontSize above maximum to 48', () => {
    const s = validateSettings({ fontSize: 100 });
    expect(s.fontSize).toBe(48);
  });

  it('clamps letterSpacing below minimum to 0', () => {
    const s = validateSettings({ letterSpacing: -1 });
    expect(s.letterSpacing).toBe(0);
  });

  it('clamps letterSpacing above maximum to 0.3', () => {
    const s = validateSettings({ letterSpacing: 0.5 });
    expect(s.letterSpacing).toBe(0.3);
  });

  it('clamps lineHeight below minimum to 1.2', () => {
    const s = validateSettings({ lineHeight: 0.5 });
    expect(s.lineHeight).toBe(1.2);
  });

  it('clamps lineHeight above maximum to 2.5', () => {
    const s = validateSettings({ lineHeight: 5 });
    expect(s.lineHeight).toBe(2.5);
  });

  it('clamps tapTargetSize below minimum to 48', () => {
    const s = validateSettings({ tapTargetSize: 20 });
    expect(s.tapTargetSize).toBe(48);
  });

  it('clamps tapTargetSize above maximum to 72', () => {
    const s = validateSettings({ tapTargetSize: 100 });
    expect(s.tapTargetSize).toBe(72);
  });

  it('falls back to default fontWeight for invalid value', () => {
    const s = validateSettings({
      fontWeight: 'super-heavy' as AccessibilitySettings['fontWeight'],
    });
    expect(s.fontWeight).toBe('bold');
  });

  it('falls back to default contrastMode for invalid value', () => {
    const s = validateSettings({
      contrastMode: 'neon' as AccessibilitySettings['contrastMode'],
    });
    expect(s.contrastMode).toBe('light');
  });

  it('falls back to default voicePreference for invalid value', () => {
    const s = validateSettings({
      voicePreference: 'robot' as AccessibilitySettings['voicePreference'],
    });
    expect(s.voicePreference).toBe('female');
  });

  it('accepts valid voicePreference values', () => {
    expect(validateSettings({ voicePreference: 'male' }).voicePreference).toBe('male');
    expect(validateSettings({ voicePreference: 'female' }).voicePreference).toBe('female');
  });

  it('fills missing fields from defaults', () => {
    const s = validateSettings({});
    expect(s).toEqual(DEFAULT_SETTINGS);
  });
});

// ─── mergeSetting ───────────────────────────────────────────────

describe('mergeSetting', () => {
  it('updates a single key and re-validates', () => {
    const updated = mergeSetting(DEFAULT_SETTINGS, 'fontSize', 32);
    expect(updated.fontSize).toBe(32);
    // other fields unchanged
    expect(updated.fontWeight).toBe(DEFAULT_SETTINGS.fontWeight);
  });

  it('clamps an out-of-range merge', () => {
    const updated = mergeSetting(DEFAULT_SETTINGS, 'fontSize', 999);
    expect(updated.fontSize).toBe(48);
  });
});

// ─── Presets ────────────────────────────────────────────────────

describe('PRESETS', () => {
  it('contains exactly 4 presets', () => {
    expect(PRESETS).toHaveLength(4);
  });

  it('has a "Default" preset matching DEFAULT_SETTINGS', () => {
    const preset = getPreset('Default');
    expect(preset).toBeDefined();
    expect(preset!.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('High Visibility preset has correct overrides', () => {
    const preset = getPreset('High Visibility');
    expect(preset).toBeDefined();
    expect(preset!.settings.fontSize).toBe(32);
    expect(preset!.settings.fontWeight).toBe('extra-bold');
    expect(preset!.settings.letterSpacing).toBe(0.15);
    expect(preset!.settings.contrastMode).toBe('high-contrast');
    expect(preset!.settings.tapTargetSize).toBe(72);
  });

  it('Dyslexia Friendly preset has correct overrides', () => {
    const preset = getPreset('Dyslexia Friendly');
    expect(preset).toBeDefined();
    expect(preset!.settings.fontFamily).toBe('OpenDyslexic, sans-serif');
    expect(preset!.settings.letterSpacing).toBe(0.1);
    expect(preset!.settings.lineHeight).toBe(2.0);
    expect(preset!.settings.backgroundColor).toBe('#FFFDE7');
  });

  it('Minimal preset has correct overrides', () => {
    const preset = getPreset('Minimal');
    expect(preset).toBeDefined();
    expect(preset!.settings.fontSize).toBe(18);
    expect(preset!.settings.fontWeight).toBe('normal');
    expect(preset!.settings.letterSpacing).toBe(0);
    expect(preset!.settings.reducedMotion).toBe(false);
    expect(preset!.settings.tapTargetSize).toBe(48);
  });

  it('getPreset is case-insensitive', () => {
    expect(getPreset('high visibility')).toBeDefined();
    expect(getPreset('HIGH VISIBILITY')).toBeDefined();
  });

  it('getPreset returns undefined for unknown name', () => {
    expect(getPreset('nonexistent')).toBeUndefined();
  });
});

// ─── Preset application overrides current settings ──────────────

describe('Preset application', () => {
  it('applying a preset fully replaces current settings', () => {
    // Start with Minimal
    const minimal = getPreset('Minimal')!.settings;
    // Apply High Visibility
    const highVis = getPreset('High Visibility')!.settings;

    // They should differ on key properties
    expect(minimal.fontSize).not.toBe(highVis.fontSize);
    expect(minimal.fontWeight).not.toBe(highVis.fontWeight);

    // After applying High Visibility, all fields should match exactly
    const applied = validateSettings(highVis);
    expect(applied).toEqual(highVis);
  });
});

// ─── Background color presets ───────────────────────────────────

describe('Background color presets', () => {
  it('Default uses cream (#FFF8E7)', () => {
    expect(getPreset('Default')!.settings.backgroundColor).toBe('#FFF8E7');
  });

  it('Dyslexia Friendly uses pale yellow (#FFFDE7)', () => {
    expect(getPreset('Dyslexia Friendly')!.settings.backgroundColor).toBe(
      '#FFFDE7',
    );
  });

  it('validates custom background colors are preserved', () => {
    const lightBlue = validateSettings({ backgroundColor: '#E3F2FD' });
    expect(lightBlue.backgroundColor).toBe('#E3F2FD');

    const lightGreen = validateSettings({ backgroundColor: '#E8F5E9' });
    expect(lightGreen.backgroundColor).toBe('#E8F5E9');
  });
});
