// mw-79en7t.52: the Settings home in Grown-ups: a search box over the rows, rows that do not apply hidden, a tap saving through the screen's own handler.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Settings } from '../../src/worlds/grown-ups/Settings';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';

const base = {
  profile: { name: 'Rowan', themeId: 'dragon-forge', gradeGoal: 90 },
  settings: DEFAULT_SETTINGS,
  onContrastModeChange: vi.fn(),
  onPresetApply: vi.fn(),
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('the settings home', () => {
  it('hides the rows the screen has no handler for, and shows them with one', () => {
    const { unmount } = render(<Settings {...base} />);
    expect(screen.queryByRole('heading', { name: 'Grade Goal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Requests to the maker/ })).not.toBeInTheDocument();
    unmount();
    render(<Settings {...base} onGradeGoalChange={vi.fn()} onOpenRequests={vi.fn()} onOpenConversations={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Grade Goal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Requests to the maker/ })).toBeInTheDocument();
  });

  it('the search box narrows the screen to the rows that match, by label', () => {
    render(<Settings {...base} onGradeGoalChange={vi.fn()} onLearningStrategyChange={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), { target: { value: 'grade' } });
    expect(screen.getByRole('heading', { name: 'Grade Goal' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Learning Order' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Appearance' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzqqq' } });
    expect(screen.getByRole('status')).toHaveTextContent('Nothing in Settings matches');
  });

  it('a tap on a choice calls the handler with the value it always did, and the profile’s goal shows pressed', () => {
    const onGradeGoalChange = vi.fn();
    const onLearningStrategyChange = vi.fn();
    render(<Settings {...base} onGradeGoalChange={onGradeGoalChange} onLearningStrategyChange={onLearningStrategyChange} />);
    expect(screen.getByRole('button', { name: /^90%/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /^80%/ }));
    expect(onGradeGoalChange).toHaveBeenCalledWith(80);
    fireEvent.click(screen.getByRole('button', { name: /^Random/ }));
    expect(onLearningStrategyChange).toHaveBeenCalledWith('random');
    fireEvent.click(screen.getByRole('button', { name: /^Dark/ }));
    expect(base.onContrastModeChange).toHaveBeenCalledWith('dark');
  });

  it('a debug switch toggles once per tap', () => {
    const onToggleDebugMode = vi.fn();
    render(<Settings {...base} debugModeEnabled onToggleDebugMode={onToggleDebugMode} />);
    expect(screen.getByRole('button', { name: /Debug Mode/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Debug Mode/ }));
    expect(onToggleDebugMode).toHaveBeenCalledTimes(1);
  });

  it('applies the preset that was tapped', () => {
    render(<Settings {...base} />);
    fireEvent.click(screen.getByRole('button', { name: /Dyslexia Friendly/ }));
    expect(base.onPresetApply).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dyslexia Friendly' }));
  });
});
