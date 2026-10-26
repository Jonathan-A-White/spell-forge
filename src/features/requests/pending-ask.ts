// src/features/requests/pending-ask.ts — the hand-over from Requests to the front door: picking an expected ask there opens the tutor
// already knowing which ask it is, so the greeting names it and the request it comes to files under it (the row then shows where it
// stands). One slot in memory, read once by the door as it opens; a reload forgets it, as it should.
import type { ExpectedAsk } from 'pwa-kit/requests';

export interface PendingAsk {
  ask: ExpectedAsk;
  /** Who picked it: a grown-up here, as Requests is the grown-ups'. */
  who: string;
}

let pending: PendingAsk | undefined;

/** Keeps the pick for the door that opens next. */
export function pickAsk(next: PendingAsk): void {
  pending = next;
}

/** The pick the door should open on, if any (reading it leaves it kept until forgetAsk). */
export function pendingAsk(): PendingAsk | undefined {
  return pending;
}

/** Forgets the pick once the door has taken it. */
export function forgetAsk(): void {
  pending = undefined;
}

/** What the tutor says on opening when an expected ask was picked: spoken and drawn, in words he hears. */
export function askGreeting(ask: ExpectedAsk): string {
  return `You would like ${ask.opening || ask.title.toLowerCase()}. Hold the big button and tell me about it.`;
}
