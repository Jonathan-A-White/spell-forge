import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemedHero } from '../../src/features/dashboard/themed-hero';
import { rewardTracker } from '../../src/features/rewards/reward-tracker';
import { themeEngine } from '../../src/themes/engine';

// ─── Setup ──────────────────────────────────────────────────

beforeEach(() => {
  rewardTracker.resetAll();
});

// ─── Rendering ──────────────────────────────────────────────

describe('ThemedHero', () => {
  it('renders the themed hero container', () => {
    render(<ThemedHero profileId="p1" themeId="dragon-forge" />);
    expect(screen.getByTestId('themed-hero')).toBeInTheDocument();
  });

  it('displays the theme name', () => {
    render(<ThemedHero profileId="p1" themeId="dragon-forge" />);
    expect(screen.getByText('Dragon Forge')).toBeInTheDocument();
  });

  it('displays the reward unit name', () => {
    render(<ThemedHero profileId="p1" themeId="dragon-forge" />);
    expect(screen.getByText('scales')).toBeInTheDocument();
  });

  it('renders the mascot SVG', () => {
    render(<ThemedHero profileId="p1" themeId="dragon-forge" />);
    expect(screen.getByTestId('theme-mascot')).toBeInTheDocument();
  });

  it('shows a progress bar with 0% at start', () => {
    render(<ThemedHero profileId="p1" themeId="dragon-forge" />);
    expect(screen.getByTestId('progress-percent')).toHaveTextContent('0%');
  });

  it('shows next milestone hint at start', () => {
    render(<ThemedHero profileId="p1" themeId="dragon-forge" />);
    expect(screen.getByTestId('next-milestone')).toHaveTextContent('10 scales to Hatching');
  });

  it('displays progress bar with correct ARIA attributes', () => {
    render(<ThemedHero profileId="p1" themeId="dragon-forge" />);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '50');
  });
});

// ─── Theme Variations ───────────────────────────────────────

describe('ThemedHero theme variations', () => {
  it('renders Dragon Forge theme message', () => {
    render(<ThemedHero profileId="p1" themeId="dragon-forge" />);
    expect(screen.getByTestId('theme-message')).toHaveTextContent('Growing your dragon');
  });

  it('renders Monster Lab theme message', () => {
    render(<ThemedHero profileId="p1" themeId="monster-lab" />);
    expect(screen.getByTestId('theme-message')).toHaveTextContent('Building creature');
  });

  it('renders Star Trail theme message', () => {
    render(<ThemedHero profileId="p1" themeId="star-trail" />);
    expect(screen.getByTestId('theme-message')).toHaveTextContent('Exploring space');
  });

  it('shows Monster Lab unit name (blocks)', () => {
    render(<ThemedHero profileId="p1" themeId="monster-lab" />);
    expect(screen.getByText('blocks')).toBeInTheDocument();
  });

  it('shows Star Trail unit name (stars)', () => {
    render(<ThemedHero profileId="p1" themeId="star-trail" />);
    expect(screen.getByText('stars')).toBeInTheDocument();
  });
});

// ─── Progress Tracking ──────────────────────────────────────

describe('ThemedHero progress', () => {
  it('reflects accumulated progress', () => {
    rewardTracker.setProgress('p1', 'dragon-forge', 25);
    render(<ThemedHero profileId="p1" themeId="dragon-forge" />);
    expect(screen.getByTestId('progress-percent')).toHaveTextContent('50%');
  });

  it('shows correct next milestone after progress', () => {
    rewardTracker.setProgress('p1', 'dragon-forge', 15);
    render(<ThemedHero profileId="p1" themeId="dragon-forge" />);
    // At 15, current = Hatching, next = Baby Dragon, 5 to go
    expect(screen.getByTestId('next-milestone')).toHaveTextContent('5 scales to Baby Dragon');
  });

  it('shows completion message at max progress', () => {
    const maxProgress = themeEngine.getMaxProgress('dragon-forge');
    rewardTracker.setProgress('p1', 'dragon-forge', maxProgress);
    render(<ThemedHero profileId="p1" themeId="dragon-forge" />);
    expect(screen.getByTestId('theme-message')).toHaveTextContent('Your dragon is fully grown!');
  });

  it('hides next milestone hint when at max', () => {
    const maxProgress = themeEngine.getMaxProgress('dragon-forge');
    rewardTracker.setProgress('p1', 'dragon-forge', maxProgress);
    render(<ThemedHero profileId="p1" themeId="dragon-forge" />);
    expect(screen.queryByTestId('next-milestone')).not.toBeInTheDocument();
  });

  it('shows 100% at max progress', () => {
    const maxProgress = themeEngine.getMaxProgress('monster-lab');
    rewardTracker.setProgress('p1', 'monster-lab', maxProgress);
    render(<ThemedHero profileId="p1" themeId="monster-lab" />);
    expect(screen.getByTestId('progress-percent')).toHaveTextContent('100%');
  });

  it('shows Monster Lab completion message', () => {
    const maxProgress = themeEngine.getMaxProgress('monster-lab');
    rewardTracker.setProgress('p1', 'monster-lab', maxProgress);
    render(<ThemedHero profileId="p1" themeId="monster-lab" />);
    expect(screen.getByTestId('theme-message')).toHaveTextContent('Your creature is complete!');
  });

  it('shows Star Trail completion message', () => {
    const maxProgress = themeEngine.getMaxProgress('star-trail');
    rewardTracker.setProgress('p1', 'star-trail', maxProgress);
    render(<ThemedHero profileId="p1" themeId="star-trail" />);
    expect(screen.getByTestId('theme-message')).toHaveTextContent('You mapped the universe!');
  });
});
