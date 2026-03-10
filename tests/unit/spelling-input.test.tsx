import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpellingInput } from '../../src/features/practice/spelling-input';

describe('SpellingInput', () => {
  const defaultProps = {
    word: 'cat',
    onComplete: vi.fn(),
    tapTargetSize: 48,
  };

  it('should render text input and check button', () => {
    render(<SpellingInput {...defaultProps} />);

    expect(screen.getByPlaceholderText('Type the word...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument();
  });

  it('should disable check button when input is empty', () => {
    render(<SpellingInput {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
  });

  it('should call onComplete with correct=true and mistakes=0 on correct answer', () => {
    const onComplete = vi.fn();
    render(<SpellingInput {...defaultProps} onComplete={onComplete} />);

    const input = screen.getByPlaceholderText('Type the word...');
    fireEvent.change(input, { target: { value: 'cat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(onComplete).toHaveBeenCalledWith(true, expect.any(Number), 0);
  });

  it('should be case insensitive when checking', () => {
    const onComplete = vi.fn();
    render(<SpellingInput {...defaultProps} onComplete={onComplete} />);

    const input = screen.getByPlaceholderText('Type the word...');
    fireEvent.change(input, { target: { value: 'CAT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(onComplete).toHaveBeenCalledWith(true, expect.any(Number), 0);
  });

  it('should show comparison view on incorrect answer', () => {
    render(<SpellingInput {...defaultProps} />);

    const input = screen.getByPlaceholderText('Type the word...');
    fireEvent.change(input, { target: { value: 'kat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(screen.getByText('Not quite right')).toBeInTheDocument();
    expect(screen.getByText('Your attempt')).toBeInTheDocument();
    expect(screen.getByText('Correct spelling')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Now type it correctly' })).toBeInTheDocument();
  });

  it('should transition to retype phase after viewing comparison', () => {
    render(<SpellingInput {...defaultProps} />);

    // Submit wrong answer
    const input = screen.getByPlaceholderText('Type the word...');
    fireEvent.change(input, { target: { value: 'kat' } });
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
    fireEvent.change(screen.getByPlaceholderText('Type the word...'), { target: { value: 'kat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    // Start retype
    fireEvent.click(screen.getByRole('button', { name: 'Now type it correctly' }));

    // Wrong retype should not advance
    const retypeInput = screen.getByLabelText('Retype the word correctly');
    fireEvent.change(retypeInput, { target: { value: 'kat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    // Should still be on retype 1 of 2 (input cleared)
    expect(screen.getByText(/Type it correctly/)).toBeInTheDocument();
  });

  it('should call onComplete after two correct retypes', () => {
    const onComplete = vi.fn();
    render(<SpellingInput {...defaultProps} onComplete={onComplete} />);

    // Submit wrong answer
    fireEvent.change(screen.getByPlaceholderText('Type the word...'), { target: { value: 'kat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    // Start retype
    fireEvent.click(screen.getByRole('button', { name: 'Now type it correctly' }));

    // First correct retype
    fireEvent.change(screen.getByLabelText('Retype the word correctly'), { target: { value: 'cat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    // Should still be on retype phase
    expect(screen.getByText(/Type it correctly/)).toBeInTheDocument();

    // Second correct retype
    fireEvent.change(screen.getByLabelText('Retype the word correctly'), { target: { value: 'cat' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    // Should complete with mistakes=1 (was incorrect initially)
    expect(onComplete).toHaveBeenCalledWith(true, expect.any(Number), 1);
  });

  it('should submit on Enter key', () => {
    const onComplete = vi.fn();
    render(<SpellingInput {...defaultProps} onComplete={onComplete} />);

    const input = screen.getByPlaceholderText('Type the word...');
    fireEvent.change(input, { target: { value: 'cat' } });
    fireEvent.keyDown(input, { key: 'Enter' });

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

  it('should allow backspace (standard input behavior)', () => {
    render(<SpellingInput {...defaultProps} />);

    const input = screen.getByPlaceholderText('Type the word...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'cta' } });
    expect(input.value).toBe('cta');

    // Simulate backspace by changing value
    fireEvent.change(input, { target: { value: 'ct' } });
    expect(input.value).toBe('ct');

    fireEvent.change(input, { target: { value: 'cat' } });
    expect(input.value).toBe('cat');
  });
});
