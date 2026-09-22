// src/bsv/chain-error.ts — Error type for readable ChainProvider failures.

export class ChainError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ChainError';
  }
}
