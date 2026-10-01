// src/grist/config.ts — Where the grist client talks to. The only place the backend URL is written.

export interface GristConfig {
  /** The Postern backend (docs/api.md), without a trailing slash. */
  backendUrl: string;
  /** How often the photo-import queue pages for an answer while one is unanswered (protocol §19, Waiting). */
  pollIntervalMs: number;
}

export const gristConfig: GristConfig = {
  backendUrl: 'https://postern.allmymind.org',
  pollIntervalMs: 20000,
};
