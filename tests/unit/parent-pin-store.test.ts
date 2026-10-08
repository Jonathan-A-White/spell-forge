// mw-kuy7rx.2: the device-level parent PIN store. Salted PBKDF2 in localStorage; never the digits.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PARENT_PIN_STORAGE_KEY,
  checkParentPin,
  checkRecoveryAnswer,
  getRecoveryQuestion,
  hasParentPin,
  resetParentPin,
  setParentPin,
} from '../../src/features/tutor/parent-pin';

beforeEach(() => localStorage.clear());

describe('parent PIN store', () => {
  it('has no PIN until one is set', async () => {
    expect(hasParentPin()).toBe(false);
    expect(await checkParentPin('1234')).toBe(false);
  });

  it('accepts the PIN that was set and rejects another', async () => {
    await setParentPin('1234', 'What is the name of your first pet?', 'Rex');
    expect(hasParentPin()).toBe(true);
    expect(await checkParentPin('1234')).toBe(true);
    expect(await checkParentPin('1235')).toBe(false);
    expect(await checkParentPin('')).toBe(false);
  });

  it('rejects a PIN that is not four digits', async () => {
    await expect(setParentPin('12', 'q', 'a')).rejects.toThrow();
    await expect(setParentPin('12ab', 'q', 'a')).rejects.toThrow();
  });

  it('stores neither the PIN nor the answer in the clear', async () => {
    await setParentPin('4827', 'Favourite food?', 'Spaghetti');
    const raw = localStorage.getItem(PARENT_PIN_STORAGE_KEY) ?? '';
    expect(raw).not.toBe('');
    expect(raw).not.toContain('4827');
    expect(raw.toLowerCase()).not.toContain('spaghetti');
    // the question is kept readable: it has to be shown on the pad
    expect(raw).toContain('Favourite food?');
    expect(getRecoveryQuestion()).toBe('Favourite food?');
  });

  it('salts: the same PIN set twice gives different stored values', async () => {
    await setParentPin('4827', 'q', 'a');
    const first = localStorage.getItem(PARENT_PIN_STORAGE_KEY);
    await setParentPin('4827', 'q', 'a');
    expect(localStorage.getItem(PARENT_PIN_STORAGE_KEY)).not.toBe(first);
  });

  it('compares the recovery answer trimmed and case-folded', async () => {
    await setParentPin('1234', 'q', '  Spaghetti ');
    expect(await checkRecoveryAnswer('spaghetti')).toBe(true);
    expect(await checkRecoveryAnswer(' SPAGHETTI  ')).toBe(true);
    expect(await checkRecoveryAnswer('pizza')).toBe(false);
    expect(await checkRecoveryAnswer('')).toBe(false);
  });

  it('resets the PIN only with the right recovery answer', async () => {
    await setParentPin('1234', 'q', 'Rex');
    expect(await resetParentPin('Fido', '9999')).toBe(false);
    expect(await checkParentPin('1234')).toBe(true);
    expect(await checkParentPin('9999')).toBe(false);

    expect(await resetParentPin('rex', '9999')).toBe(true);
    expect(await checkParentPin('9999')).toBe(true);
    expect(await checkParentPin('1234')).toBe(false);
    // the question and answer still stand
    expect(getRecoveryQuestion()).toBe('q');
    expect(await checkRecoveryAnswer('Rex')).toBe(true);
  });

  it('treats a damaged stored value as no PIN', async () => {
    localStorage.setItem(PARENT_PIN_STORAGE_KEY, '{nonsense');
    expect(hasParentPin()).toBe(false);
    expect(await checkParentPin('1234')).toBe(false);
  });
});
