import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { UnscrambleDragDrop } from '../../src/features/practice/unscramble-drag-drop';

// Mock haptics
vi.mock('../../src/core/haptics', () => ({
  hapticTap: vi.fn(),
  hapticError: vi.fn(),
  hapticSuccess: vi.fn(),
}));

// Mock ResizeObserver
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

function renderComponent(props: Partial<Parameters<typeof UnscrambleDragDrop>[0]> = {}) {
  const defaultProps = {
    scrambledLetters: 'tca',
    wordLength: 3,
    onSubmit: vi.fn(),
    tapTargetSize: 48,
    submitLabel: 'Submit',
    ...props,
  };
  return {
    ...render(createElement(UnscrambleDragDrop, defaultProps)),
    onSubmit: defaultProps.onSubmit,
  };
}

describe('UnscrambleDragDrop', () => {
  it('renders all scrambled letters as bank tiles', () => {
    renderComponent({ scrambledLetters: 'tca' });
    expect(screen.getByLabelText('Letter t')).toBeDefined();
    expect(screen.getByLabelText('Letter c')).toBeDefined();
    expect(screen.getByLabelText('Letter a')).toBeDefined();
  });

  it('renders correct number of empty slots', () => {
    renderComponent({ scrambledLetters: 'tca', wordLength: 3 });
    expect(screen.getByLabelText('Empty slot 1')).toBeDefined();
    expect(screen.getByLabelText('Empty slot 2')).toBeDefined();
    expect(screen.getByLabelText('Empty slot 3')).toBeDefined();
  });

  it('places a letter into the first empty slot on tap', () => {
    renderComponent({ scrambledLetters: 'tca' });
    fireEvent.click(screen.getByLabelText('Letter t'));
    // After placing, slot 1 should have the letter
    expect(screen.getByLabelText('Slot 1: t, tap to remove')).toBeDefined();
  });

  it('removes a placed letter when its slot is tapped', () => {
    renderComponent({ scrambledLetters: 'tca' });
    // Place letter
    fireEvent.click(screen.getByLabelText('Letter t'));
    expect(screen.getByLabelText('Slot 1: t, tap to remove')).toBeDefined();
    // Remove by clicking slot
    fireEvent.click(screen.getByLabelText('Slot 1: t, tap to remove'));
    expect(screen.getByLabelText('Empty slot 1')).toBeDefined();
  });

  it('disables submit button when not all letters are placed', () => {
    renderComponent({ scrambledLetters: 'tca' });
    const submitBtn = screen.getByText('Submit');
    expect(submitBtn).toBeDisabled();
  });

  it('calls onSubmit with the arranged answer when all letters are placed and submit clicked', () => {
    const { onSubmit } = renderComponent({ scrambledLetters: 'tca' });
    // Place all letters: t, c, a
    fireEvent.click(screen.getByLabelText('Letter t'));
    fireEvent.click(screen.getByLabelText('Letter c'));
    fireEvent.click(screen.getByLabelText('Letter a'));
    // Submit
    fireEvent.click(screen.getByText('Submit'));
    expect(onSubmit).toHaveBeenCalledWith('tca');
  });

  it('does not allow interaction when disabled', () => {
    renderComponent({ scrambledLetters: 'tca', disabled: true });
    fireEvent.click(screen.getByLabelText('Letter t'));
    // Should still show empty slot 1
    expect(screen.getByLabelText('Empty slot 1')).toBeDefined();
  });

  it('renders drag hint text', () => {
    renderComponent();
    expect(screen.getByText('Drag letters into the slots, or tap to place')).toBeDefined();
  });

  it('supports HTML5 drag and drop to a slot', () => {
    renderComponent({ scrambledLetters: 'ab', wordLength: 2 });
    const letterA = screen.getByLabelText('Letter a');
    const slot1 = screen.getByLabelText('Empty slot 1');

    // Simulate drag start
    fireEvent.dragStart(letterA, {
      dataTransfer: { setData: vi.fn(), effectAllowed: '' },
    });

    // Simulate drop on slot
    fireEvent.dragOver(slot1, {
      dataTransfer: { dropEffect: '' },
    });
    fireEvent.drop(slot1, {
      dataTransfer: { getData: () => 'tile-0' },
    });

    expect(screen.getByLabelText('Slot 1: a, tap to remove')).toBeDefined();
  });
});
