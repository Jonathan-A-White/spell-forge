import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HomeScreen } from '../../src/features/dashboard/home-screen';
import { PracticeCalendar } from '../../src/features/dashboard/practice-calendar';
import { db } from '../../src/data/db';
import { paulProfile } from '../fixtures/profiles';
import { paulStreak } from '../fixtures/session-histories';
import { week12List, sampleWords, createWordStats } from '../fixtures/word-lists';

// Mock canvas getContext for ThemeEffects (jsdom doesn't support it)
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
});

// ─── HomeScreen: flame button navigates to practice-calendar ────

describe('HomeScreen — flame button', () => {
  it('renders the flame button with current streak count', () => {
    const onNavigate = vi.fn();
    const activeWords = sampleWords.filter((w) => w.listId === week12List.id);
    const stats = activeWords.map((w) => createWordStats(w.id, paulProfile.id));

    render(
      <HomeScreen
        profile={paulProfile}
        wordLists={[week12List]}
        allWords={activeWords}
        allStats={stats}
        streakData={paulStreak}
        coinBalance={null}
        learningProgress={[]}
        onNavigate={onNavigate}
        onSwitchProfile={vi.fn()}
        hasMultipleProfiles={false}
      />,
    );

    // The flame emoji and streak count should be visible
    expect(screen.getByText('🔥')).toBeInTheDocument();
    expect(screen.getByText(String(paulStreak.currentStreak))).toBeInTheDocument();
  });

  it('navigates to practice-calendar when flame button is tapped', () => {
    const onNavigate = vi.fn();
    const activeWords = sampleWords.filter((w) => w.listId === week12List.id);
    const stats = activeWords.map((w) => createWordStats(w.id, paulProfile.id));

    render(
      <HomeScreen
        profile={paulProfile}
        wordLists={[week12List]}
        allWords={activeWords}
        allStats={stats}
        streakData={paulStreak}
        coinBalance={null}
        learningProgress={[]}
        onNavigate={onNavigate}
        onSwitchProfile={vi.fn()}
        hasMultipleProfiles={false}
      />,
    );

    // Click the flame button (find button containing the fire emoji)
    const flameButton = screen.getByText('🔥').closest('button')!;
    fireEvent.click(flameButton);

    expect(onNavigate).toHaveBeenCalledWith('practice-calendar');
  });

  it('shows streak of 0 when no streak data', () => {
    const onNavigate = vi.fn();
    const activeWords = sampleWords.filter((w) => w.listId === week12List.id);
    const stats = activeWords.map((w) => createWordStats(w.id, paulProfile.id));

    render(
      <HomeScreen
        profile={paulProfile}
        wordLists={[week12List]}
        allWords={activeWords}
        allStats={stats}
        streakData={null}
        coinBalance={null}
        learningProgress={[]}
        onNavigate={onNavigate}
        onSwitchProfile={vi.fn()}
        hasMultipleProfiles={false}
      />,
    );

    const flameButton = screen.getByText('🔥').closest('button')!;
    expect(flameButton).toBeInTheDocument();
    // The streak count "0" should appear within the flame button
    expect(flameButton).toHaveTextContent('0');
  });
});

// ─── PracticeCalendar: renders streak and session data ──────────

describe('PracticeCalendar — rendering', () => {
  beforeEach(async () => {
    await db.sessionLogs.clear();
  });

  it('displays current streak count', async () => {
    render(
      <PracticeCalendar
        profileId={paulProfile.id}
        streakData={paulStreak}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText(String(paulStreak.currentStreak))).toBeInTheDocument();
    expect(screen.getByText('day streak')).toBeInTheDocument();
  });

  it('displays longest streak', () => {
    render(
      <PracticeCalendar
        profileId={paulProfile.id}
        streakData={paulStreak}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText(String(paulStreak.longestStreak))).toBeInTheDocument();
    expect(screen.getByText('Longest streak')).toBeInTheDocument();
  });

  it('renders day-of-week headers', () => {
    render(
      <PracticeCalendar
        profileId={paulProfile.id}
        streakData={paulStreak}
        onBack={vi.fn()}
      />,
    );

    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    render(
      <PracticeCalendar
        profileId={paulProfile.id}
        streakData={paulStreak}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByText('Back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('renders the flame emoji in the header', () => {
    render(
      <PracticeCalendar
        profileId={paulProfile.id}
        streakData={paulStreak}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText('🔥')).toBeInTheDocument();
  });

  it('shows legend section', () => {
    render(
      <PracticeCalendar
        profileId={paulProfile.id}
        streakData={paulStreak}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText('Legend')).toBeInTheDocument();
  });

  it('handles null streak data gracefully', () => {
    render(
      <PracticeCalendar
        profileId={paulProfile.id}
        streakData={null}
        onBack={vi.fn()}
      />,
    );

    // Should show 0 for both streaks
    expect(screen.getByText('day streak')).toBeInTheDocument();
  });
});
