// mw-kuy7rx.2: the PIN pad and the gate in front of the Grown-ups screen.
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { PinPad } from '../../src/features/tutor/pin-pad';
import { ParentGate } from '../../src/features/tutor/parent-gate';
import { PARENT_PIN_STORAGE_KEY, checkParentPin, setParentPin } from '../../src/features/tutor/parent-pin';

beforeEach(() => localStorage.clear());

const type = (digits: string) => {
  for (const d of digits) fireEvent.click(screen.getByRole('button', { name: d }));
};

describe('PinPad', () => {
  it('shows four boxes and fills them as digits are typed', () => {
    render(<PinPad title="Enter your PIN" onComplete={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Enter your PIN' })).toBeTruthy();
    expect(screen.getAllByTestId('pin-box')).toHaveLength(4);
    type('12');
    expect(screen.getAllByTestId('pin-box').filter((b) => b.getAttribute('data-filled') === 'true')).toHaveLength(2);
  });

  it('delete takes the last digit back', () => {
    const onComplete = vi.fn();
    render(<PinPad title="t" onComplete={onComplete} />);
    type('12');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    type('34');
    expect(onComplete).not.toHaveBeenCalled();
    type('5');
    expect(onComplete).toHaveBeenCalledWith('1345');
  });

  it('calls onComplete with the four digits and clears itself', () => {
    const onComplete = vi.fn();
    render(<PinPad title="t" onComplete={onComplete} />);
    type('4821');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('4821');
    expect(screen.getAllByTestId('pin-box').filter((b) => b.getAttribute('data-filled') === 'true')).toHaveLength(0);
  });

  it('shows an error line and shakes when told the PIN was wrong', () => {
    render(<PinPad title="t" onComplete={() => undefined} error="Try again" />);
    expect(screen.getByRole('alert').textContent).toBe('Try again');
  });
});

describe('ParentGate', () => {
  const open = () => render(<ParentGate profileId="p1" onExit={() => undefined} />);

  it('on first open asks to choose a PIN, then to type it again', async () => {
    open();
    expect(screen.getByRole('heading', { name: 'Choose a 4-digit PIN' })).toBeTruthy();
    type('1234');
    expect(await screen.findByRole('heading', { name: 'Type it again' })).toBeTruthy();
  });

  it('a mismatch on the second typing starts over and does not store a PIN', async () => {
    open();
    type('1234');
    await screen.findByRole('heading', { name: 'Type it again' });
    type('1235');
    expect(await screen.findByRole('heading', { name: 'Choose a 4-digit PIN' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/did not match/i);
    expect(localStorage.getItem(PARENT_PIN_STORAGE_KEY)).toBeNull();
  });

  async function firstOpen(pin = '1234', answer = 'Rex') {
    const view = open();
    type(pin);
    await screen.findByRole('heading', { name: 'Type it again' });
    type(pin);
    await screen.findByRole('heading', { name: 'Pick a question' });
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: answer } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    return view;
  }

  it('after choosing a PIN and a recovery question, the Grown-ups screen opens', async () => {
    await firstOpen();
    expect(await screen.findByRole('heading', { name: 'Grown-ups' })).toBeTruthy();
    for (const section of ['This week', 'Sessions', 'Ask the tutor', 'Tutor settings']) {
      expect(screen.getByRole('heading', { name: section })).toBeTruthy();
    }
    expect(await checkParentPin('1234')).toBe(true);
  });

  it('the recovery question can be one of your own', async () => {
    open();
    type('1234');
    await screen.findByRole('heading', { name: 'Type it again' });
    type('1234');
    await screen.findByRole('heading', { name: 'Pick a question' });
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: '__own__' } });
    fireEvent.change(screen.getByLabelText('Write your question'), { target: { value: 'Where were we married?' } });
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Paris' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'Grown-ups' });
    expect(localStorage.getItem(PARENT_PIN_STORAGE_KEY)).toContain('Where were we married?');
  });

  it('will not save without an answer', async () => {
    open();
    type('1234');
    await screen.findByRole('heading', { name: 'Type it again' });
    type('1234');
    await screen.findByRole('heading', { name: 'Pick a question' });
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('with a PIN set, a wrong PIN keeps the screen closed and the right one opens it', async () => {
    await setParentPin('1234', 'Favourite food?', 'Pizza');
    open();
    expect(screen.getByRole('heading', { name: 'Enter your PIN' })).toBeTruthy();
    type('9999');
    expect((await screen.findByRole('alert')).textContent).toBe('Try again');
    expect(screen.queryByRole('heading', { name: 'Grown-ups' })).toBeNull();
    type('1234');
    expect(await screen.findByRole('heading', { name: 'Grown-ups' })).toBeTruthy();
  });

  it('Back closes the screen; opening again asks for the PIN again', async () => {
    await setParentPin('1234', 'q', 'a');
    function Host() {
      const [on, setOn] = useState(false);
      return on ? <ParentGate profileId="p1" onExit={() => setOn(false)} /> : <button onClick={() => setOn(true)}>Grown-ups</button>;
    }
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Grown-ups' }));
    type('1234');
    await screen.findByRole('heading', { name: 'Grown-ups' });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Grown-ups' }));
    expect(screen.getByRole('heading', { name: 'Enter your PIN' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Grown-ups' })).toBeNull();
  });

  it('the app being hidden closes the Grown-ups screen again', async () => {
    await setParentPin('1234', 'q', 'a');
    open();
    type('1234');
    await screen.findByRole('heading', { name: 'Grown-ups' });
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    hidden.mockRestore();
    expect(screen.queryByRole('heading', { name: 'Grown-ups' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Enter your PIN' })).toBeTruthy();
  });

  describe('Forgot PIN?', () => {
    beforeEach(async () => {
      await setParentPin('1234', 'Favourite food?', 'Pizza');
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Forgot PIN?' }));
    });

    it('asks the question; the right answer lets a new PIN be set', async () => {
      expect(screen.getByText('Favourite food?')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: ' pizza ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Check' }));
      await screen.findByRole('heading', { name: 'Choose a new PIN' });
      type('5678');
      await screen.findByRole('heading', { name: 'Type it again' });
      type('5678');
      expect(await screen.findByRole('heading', { name: 'Grown-ups' })).toBeTruthy();
      expect(await checkParentPin('5678')).toBe(true);
      expect(await checkParentPin('1234')).toBe(false);
    });

    it('a wrong answer does not', async () => {
      fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'sushi' } });
      fireEvent.click(screen.getByRole('button', { name: 'Check' }));
      expect((await screen.findByRole('alert')).textContent).toMatch(/not the answer/i);
      expect(screen.queryByRole('heading', { name: 'Choose a new PIN' })).toBeNull();
      expect(await checkParentPin('1234')).toBe(true);
    });
  });
});

describe('the Grown-ups button on the Tutor screen', () => {
  it('opens the PIN gate, and Back from the Grown-ups screen returns to the Tutor', async () => {
    const { TutorScreen } = await import('../../src/features/tutor');
    const { paulProfile } = await import('../fixtures/profiles');
    await setParentPin('1234', 'q', 'a');
    render(<TutorScreen profile={paulProfile} onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Grown-ups' }));
    expect(screen.getByRole('heading', { name: 'Enter your PIN' })).toBeTruthy();
    type('1234');
    await screen.findByRole('heading', { name: 'Grown-ups' });
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(await screen.findByRole('heading', { name: 'Tutor' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Grown-ups' }));
    expect(screen.getByRole('heading', { name: 'Enter your PIN' })).toBeTruthy();
  });
});
