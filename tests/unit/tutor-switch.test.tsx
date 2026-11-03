// mw-bhvxcn.12, mw-79en7t.82: Settings has no 'Tutor (preview)' switch any more (the door is the landing for everyone), and a preset keeps tutorStrictness.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SettingsPanel } from '../../src/features/settings/settings-panel';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { PRESETS, presetToSettings } from '../../src/accessibility';

const settingsProps = {
  profile: { name: 'Rowan', themeId: 'dragon-forge' },
  settings: DEFAULT_SETTINGS,
  onContrastModeChange: vi.fn(),
  onPresetApply: vi.fn(),
  onBack: vi.fn(),
  onToggleDebugMode: vi.fn(),
};

beforeEach(() => {
  localStorage.clear();
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
});
afterEach(cleanup);

describe("Settings' Developer section", () => {
  it("has no 'Tutor (preview)' row", () => {
    render(<SettingsPanel {...settingsProps} />);
    expect(screen.queryByRole('button', { name: /Tutor \(preview\)/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Debug Mode/ })).toBeInTheDocument();
  });
});

describe('applying an accessibility preset', () => {
  const highVisibility = PRESETS.find((p) => p.name === 'High Visibility')!;

  it("keeps the child's tutorStrictness", () => {
    const current = { ...DEFAULT_SETTINGS, tutorStrictness: 'precision' as const };
    const next = presetToSettings(highVisibility, current);
    expect(next.tutorStrictness).toBe('precision');
    expect(next.fontSize).toBe(highVisibility.settings.fontSize);
  });

  it('leaves tutorStrictness unset when the child never chose one', () => {
    expect(presetToSettings(highVisibility, DEFAULT_SETTINGS).tutorStrictness).toBeUndefined();
  });

  it('keeps the current contrast mode unless the preset names one', () => {
    const dark = { ...DEFAULT_SETTINGS, contrastMode: 'dark' as const };
    expect(presetToSettings(PRESETS[0], dark).contrastMode).toBe('dark');
  });
});
