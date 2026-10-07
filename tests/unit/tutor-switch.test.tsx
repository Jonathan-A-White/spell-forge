// mw-bhvxcn.12: the 'Tutor (preview)' switch in Settings' Developer section, and a preset keeping tutorStrictness.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SettingsPanel } from '../../src/features/settings/settings-panel';
import { HomeScreen } from '../../src/features/dashboard/home-screen';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { PRESETS, presetToSettings } from '../../src/accessibility';
import { TUTOR_FLAG_STORAGE_KEY } from '../../src/debug/debug-state';
import { paulProfile } from '../fixtures/profiles';

const settingsProps = {
  profile: { name: 'Rowan', themeId: 'dragon-forge' },
  settings: DEFAULT_SETTINGS,
  onContrastModeChange: vi.fn(),
  onPresetApply: vi.fn(),
  onOpenBsvDebug: vi.fn(),
  onBack: vi.fn(),
  onToggleDebugMode: vi.fn(),
};

const home = () =>
  render(
    <HomeScreen
      profile={paulProfile}
      wordLists={[]}
      allWords={[]}
      allStats={[]}
      streakData={null}
      coinBalance={null}
      learningProgress={[]}
      onNavigate={vi.fn()}
      onSwitchProfile={vi.fn()}
      hasMultipleProfiles={false}
    />,
  );

beforeEach(() => {
  localStorage.clear();
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
});
afterEach(cleanup);

describe("Settings' 'Tutor (preview)' switch", () => {
  it('is in the Developer section, off to begin with', () => {
    render(<SettingsPanel {...settingsProps} />);
    expect(screen.getByRole('button', { name: /Tutor \(preview\)/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('turning it on shows the Home Tutor tile; turning it off hides it again', () => {
    const settings = render(<SettingsPanel {...settingsProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Tutor \(preview\)/ }));
    expect(screen.getByRole('button', { name: /Tutor \(preview\)/ })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(TUTOR_FLAG_STORAGE_KEY)).toBe('1');
    settings.unmount();

    const on = home();
    expect(screen.getByRole('button', { name: /^Tutor/ })).toBeInTheDocument();
    on.unmount();

    render(<SettingsPanel {...settingsProps} />);
    expect(screen.getByRole('button', { name: /Tutor \(preview\)/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Tutor \(preview\)/ }));
    expect(localStorage.getItem(TUTOR_FLAG_STORAGE_KEY)).toBe('0');
    cleanup();

    home();
    expect(screen.queryByRole('button', { name: /^Tutor/ })).not.toBeInTheDocument();
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
