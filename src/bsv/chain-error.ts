// src/bsv/chain-error.ts — Error type for readable ChainProvider failures.

export class ChainError extends Error {
  /** The HTTP status that produced this error, when it came from a non-2xx response. */
  readonly status?: number;

  constructor(message: string, options?: { cause?: unknown; status?: number }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ChainError';
    this.status = options?.status;
  }
}
