import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpellingInput } from '../../src/features/practice/spelling-input';

/** Helper: type a word by clicking keys on the custom keyboard */
function typeOnKeyboard(word: string) {
  for (const ch of word.toLowerCase()) {
    fireEvent.click(screen.getByRole('button', { name: ch }));
  }
}

/** Helper: get the display field (role="textbox") */
function getDisplay(label = 'Type the spelling word') {
  return screen.getByRole('textbox', { name: label });
}

describe('SpellingInput', () => {
  const defaultProps = {
    word: 'cat',
    onComplete: vi.fn(),
    tapTargetSize: 48,
  };

  it('should render custom keyboard and check button', () => {
    render(<SpellingInput {...defaultProps} />);

    // Custom keyboard renders letter keys
    expect(screen.getByRole('button', { name: 'a' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'z' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument();
  });

  it('should disable check button when input is empty', () => {
    render(<SpellingInput {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
  });

  it('should call onComplete with correct=true and mistakes=0 on correct answer', () => {
    const onComplete = vi.fn();
    render(<SpellingInput {...defaultProps} onComplete={onComplete} />);

    typeOnKeyboard('cat');
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(onComplete).toHaveBeenCalledWith(true, expect.any(Number), 0);
  });

  it('should show comparison view on incorrect answer', () => {
    render(<SpellingInput {...defaultProps} />);

    typeOnKeyboard('kat');
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(screen.getByText('Not quite right')).toBeInTheDocument();
    expect(screen.getByText('Your attempt')).toBeInTheDocument();
    expect(screen.getByText('Correct spelling')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Now type it correctly' })).toBeInTheDocument();
  });

  it('should transition to retype phase after viewing comparison', () => {
    render(<SpellingInput {...defaultProps} />);

    // Submit wrong answer
    typeOnKeyboard('kat');
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    // Click to start retyping
    fireEvent.click(screen.getByRole('button', { name: 'Now type it correctly' }));

    // Should show retype UI with the correct word displayed
    expect(screen.getByText(/Type it correctly/)).toBeInTheDocument();
    expect(screen.getByText('cat')).toBeInTheDocument();
  });

  it('should require correct retype to advance', () => {
    render(<SpellingInput {...defaultProps} />);

    // Submit wrong answer
    typeOnKeyboard('kat');
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    // Start retype
    fireEvent.click(screen.getByRole('button', { name: 'Now type it correctly' }));

    // Wrong retype should not advance
    typeOnKeyboard('kat');
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    // Should still be on retype 1 of 2 (input cleared)
    expect(screen.getByText(/Type it correctly/)).toBeInTheDocument();
  });

  it('should call onComplete after two correct retypes', () => {
    const onComplete = vi.fn();
    render(<SpellingInput {...defaultProps} onComplete={onComplete} />);

    // Submit wrong answer
    typeOnKeyboard('kat');
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    // Start retype
    fireEvent.click(screen.getByRole('button', { name: 'Now type it correctly' }));

    // First correct retype
    typeOnKeyboard('cat');
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    // Should still be on retype phase
    expect(screen.getByText(/Type it correctly/)).toBeInTheDocument();

    // Second correct retype
    typeOnKeyboard('cat');
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    // Should complete with correct=false (was incorrect initially), mistakes=1, and userInput="kat"
    expect(onComplete).toHaveBeenCalledWith(false, expect.any(Number), 1, 'kat');
  });

  it('should submit on Enter key via physical keyboard', () => {
    const onComplete = vi.fn();
    render(<SpellingInput {...defaultProps} onComplete={onComplete} />);

    const display = getDisplay();
    // Type via physical keyboard
    fireEvent.keyDown(display, { key: 'c' });
    fireEvent.keyDown(display, { key: 'a' });
    fireEvent.keyDown(display, { key: 't' });
    fireEvent.keyDown(display, { key: 'Enter' });

    expect(onComplete).toHaveBeenCalledWith(true, expect.any(Number), 0);
  });

  it('should show scaffolding hints when provided', () => {
    render(
      <SpellingInput
        {...defaultProps}
        word="example"
        scaffolding={{ chunks: ['ex', 'am', 'ple'], hints: ['Sound it out'] }}
      />,
    );

    expect(screen.getByText('ex')).toBeInTheDocument();
    expect(screen.getByText('am')).toBeInTheDocument();
    expect(screen.getByText('ple')).toBeInTheDocument();
    expect(screen.getByText('Sound it out')).toBeInTheDocument();
  });

  it('should allow backspace via custom keyboard', () => {
    render(<SpellingInput {...defaultProps} />);

    const display = getDisplay();
    typeOnKeyboard('cta');
    expect(display.textContent).toContain('cta');

    // Click backspace to remove 'a' -> "ct"
    fireEvent.click(screen.getByRole('button', { name: 'Backspace' }));
    expect(display.textContent).toContain('ct');

    // Backspace again to remove 't' -> "c"
    fireEvent.click(screen.getByRole('button', { name: 'Backspace' }));
    expect(display.textContent).toContain('c');

    // Now type 'at' to get 'cat'
    typeOnKeyboard('at');
    expect(display.textContent).toContain('cat');
  });
});
