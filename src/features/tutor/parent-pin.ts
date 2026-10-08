// src/features/tutor/parent-pin.ts — The grown-ups' PIN: one per device, in localStorage (no Dexie row, no Profile).
// The PIN and the recovery answer are kept only as salted PBKDF2 hashes; the recovery question stays readable
// because the pad has to show it (mw-kuy7rx.2).

export const PARENT_PIN_STORAGE_KEY = 'sf-parent-pin';

const ITERATIONS = 100_000;
const PIN_PATTERN = /^\d{4}$/;

interface StoredPin {
  v: 1;
  iterations: number;
  pinSalt: string;
  pinHash: string;
  question: string;
  answerSalt: string;
  answerHash: string;
}

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function hash(secret: string, saltHex: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex) as BufferSource, iterations },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

const newSalt = (): string => toHex(crypto.getRandomValues(new Uint8Array(16)));

/** The answer as it is compared: trimmed and case-folded. */
const foldAnswer = (answer: string): string => answer.trim().toLowerCase();

function read(): StoredPin | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PARENT_PIN_STORAGE_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const s = parsed as Partial<StoredPin>;
    const ok =
      typeof s.iterations === 'number' &&
      typeof s.pinSalt === 'string' &&
      typeof s.pinHash === 'string' &&
      typeof s.question === 'string' &&
      typeof s.answerSalt === 'string' &&
      typeof s.answerHash === 'string';
    return ok ? (s as StoredPin) : null;
  } catch {
    return null;
  }
}

function write(stored: StoredPin): void {
  localStorage.setItem(PARENT_PIN_STORAGE_KEY, JSON.stringify(stored));
}

/** Whether this device has a PIN yet. */
export function hasParentPin(): boolean {
  return read() !== null;
}

/** The recovery question chosen with the PIN, or null before any PIN is set. */
export function getRecoveryQuestion(): string | null {
  return read()?.question ?? null;
}

/** Set (or replace) the PIN together with its recovery question and answer. */
export async function setParentPin(pin: string, question: string, answer: string): Promise<void> {
  if (!PIN_PATTERN.test(pin)) throw new Error('The PIN must be four digits.');
  const pinSalt = newSalt();
  const answerSalt = newSalt();
  write({
    v: 1,
    iterations: ITERATIONS,
    pinSalt,
    pinHash: await hash(pin, pinSalt, ITERATIONS),
    question: question.trim(),
    answerSalt,
    answerHash: await hash(foldAnswer(answer), answerSalt, ITERATIONS),
  });
}

/** True when a PIN is set and `pin` is it. */
export async function checkParentPin(pin: string): Promise<boolean> {
  const stored = read();
  if (!stored || !PIN_PATTERN.test(pin)) return false;
  return (await hash(pin, stored.pinSalt, stored.iterations)) === stored.pinHash;
}

/** True when a PIN is set and `answer` is its recovery answer (trimmed, case-folded). */
export async function checkRecoveryAnswer(answer: string): Promise<boolean> {
  const stored = read();
  const folded = foldAnswer(answer);
  if (!stored || !folded) return false;
  return (await hash(folded, stored.answerSalt, stored.iterations)) === stored.answerHash;
}

/** Choose a new PIN, but only when the recovery answer is right. The question and answer stand. */
export async function resetParentPin(answer: string, newPin: string): Promise<boolean> {
  const stored = read();
  if (!stored || !PIN_PATTERN.test(newPin) || !(await checkRecoveryAnswer(answer))) return false;
  const pinSalt = newSalt();
  write({ ...stored, pinSalt, pinHash: await hash(newPin, pinSalt, stored.iterations) });
  return true;
}
