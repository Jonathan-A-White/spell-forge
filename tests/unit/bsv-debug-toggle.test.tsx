import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SettingsPanel } from '../../src/features/settings/settings-panel';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { BSV_DEBUG_STORAGE_KEY } from '../../src/features/bsv-debug/bsv-debug-flag';

const baseProps = {
  profile: { name: 'Rowan', themeId: 'dragon-forge' },
  settings: DEFAULT_SETTINGS,
  onContrastModeChange: vi.fn(),
  onPresetApply: vi.fn(),
  onOpenBsvDebug: vi.fn(),
  onBack: vi.fn(),
};

function tapVersion(times: number) {
  const versionText = screen.getByText(/SpellForge v/);
  for (let i = 0; i < times; i++) {
    fireEvent.click(versionText);
  }
}

describe('BSV debug hidden toggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows no BSV Debug button and shows the version text on a fresh install', () => {
    render(<SettingsPanel {...baseProps} />);

    expect(screen.queryByRole('button', { name: 'BSV Debug' })).not.toBeInTheDocument();
    expect(screen.getByText(/SpellForge v/)).toBeInTheDocument();
  });

  it('flips the flag on after 7 taps within the window, and it survives a fresh render', () => {
    render(<SettingsPanel {...baseProps} />);

    tapVersion(7);

    expect(localStorage.getItem(BSV_DEBUG_STORAGE_KEY)).toBe('1');
    expect(screen.getByRole('button', { name: 'BSV Debug' })).toBeInTheDocument();

    cleanup();
    render(<SettingsPanel {...baseProps} />);

    expect(screen.getByRole('button', { name: 'BSV Debug' })).toBeInTheDocument();
  });

  it('flips the flag off after 7 more taps', () => {
    render(<SettingsPanel {...baseProps} />);

    tapVersion(7);
    expect(screen.getByRole('button', { name: 'BSV Debug' })).toBeInTheDocument();

    tapVersion(7);

    expect(localStorage.getItem(BSV_DEBUG_STORAGE_KEY)).toBe('0');
    expect(screen.queryByRole('button', { name: 'BSV Debug' })).not.toBeInTheDocument();
  });

  it('does not flip the flag if the tap streak is broken by a pause longer than 3 seconds', () => {
    vi.useFakeTimers();
    render(<SettingsPanel {...baseProps} />);

    tapVersion(6);
    vi.advanceTimersByTime(3001);
    tapVersion(1);

    expect(localStorage.getItem(BSV_DEBUG_STORAGE_KEY)).toBeNull();
    expect(screen.queryByRole('button', { name: 'BSV Debug' })).not.toBeInTheDocument();
  });

  it('shows network: testnet on the BSV Debug screen and never calls fetch', () => {
    const fetchSpy = vi.spyOn(global, 'fetch');

    render(<BsvDebugScreen onBack={vi.fn()} />);

    expect(screen.getByText('network: testnet')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
