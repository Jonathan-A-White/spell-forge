// src/shell/licence-gate.ts: the one place that gates. The app is useful with no licence; what needs one is the tutor
// and the grind calls (the AI), and nothing else. Every other world, screen and game opens whatever the licence.
//
// licenceState() is the one function that knows whether a licence is held. No client-side chain check exists yet
// (mw-6ww.111 decides the gate and the issuer key), so it answers from the last bsv-kit licence status handed to
// setLicenceStatus(), and 'unknown' until one is: an unknown licence refuses nothing, the mill still decides (its
// LICENCE_REQUIRED refusal) exactly as before. When .111 decides, the reading of the chain is wired here and only here.
import { door } from 'bsv-kit/bsv';
import type { licence } from 'bsv-kit/bsv';
import { viewRoute } from './worlds';

export type LicenceState = 'licensed' | 'unlicensed' | 'unknown';

/** The one line a gated control shows: short, no blame, nothing a child must read twice (LicenceLine draws it). */
export const NO_LICENCE_LINE = 'The tutor is asleep right now. A grown-up can wake it up.';

let status: licence.LicenceStatus | undefined;
const listeners = new Set<() => void>();

/** Hands over the latest licence reading (bsv-kit's licenceStatus); undefined forgets it. */
export function setLicenceStatus(next: licence.LicenceStatus | undefined): void {
  status = next;
  listeners.forEach((listener) => listener());
}

/** For useSyncExternalStore: tells `listener` when the licence reading changes. */
export function subscribeLicence(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether a licence is held. Only 'held' counts; 'indexing', 'revoked' and 'none' are all without one. */
export function licenceState(): LicenceState {
  if (!status) return 'unknown';
  return status.state === 'held' ? 'licensed' : 'unlicensed';
}

export type Gate = { allowed: true } | { allowed: false; line: string };

const OPEN: Gate = { allowed: true };
const REFUSED: Gate = { allowed: false, line: NO_LICENCE_LINE };

const TUTOR_ROUTE = viewRoute('tutor');

/** Whether the screen at `route` opens: every route does but the tutor's. */
export function gateRoute(route: string): Gate {
  return route === TUTOR_ROUTE && licenceState() === 'unlicensed' ? REFUSED : OPEN;
}

/** Whether a grind (a call to the factory) may be sent. */
export function gateGrind(): Gate {
  return licenceState() === 'unlicensed' ? REFUSED : OPEN;
}

/** A grind refused for want of a licence. It is the door's own refusal, so every screen words it as it words the mill's. */
export class LicenceRequiredError extends door.RefusedError {
  constructor() {
    super(door.LICENCE_REQUIRED, 401);
    this.name = 'LicenceRequiredError';
  }
}
