// src/bsv/whatsonchain-provider.ts — ChainProvider backed by the WhatsOnChain testnet REST API.

import type { ChainProvider } from './chain-provider';
import type { ChainConfig } from './config';
import type { Utxo, AddressHistoryEntry } from '../contracts/types';
import { ChainError } from './chain-error';

const MAX_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_ERROR_BODY_CHARS = 200;

// WhatsOnChain rate-limits at 3 requests/s per IP without a key. Its 429 reply carries no
// access-control-allow-origin header (its 200s do), so in a real browser a rate-limited
// request never reaches the 429 branch below: cross-origin fetch rejects with TypeError
// before a status is ever seen. The scan and the token-panel lineage walk can fire faster
// than 3/s on a fast connection, so every request from this provider is paced this far
// apart, regardless of source (observed live 2026-09-23, mw-0ym9.17).
const MIN_REQUEST_SPACING_MS = 350;

// WhatsOnChain's /tx/{txid}/hex index lags a few seconds behind /address/{addr}/unspent
// after a broadcast, so a spend right after a mint or write can see a 404 on a txid whose
// output is already spendable (observed live 2026-09-23, mw-b00z.6 and mw-b00z.12).
const TX_HEX_NOT_FOUND_RETRY_DELAY_MS = 1000;
const TX_HEX_NOT_FOUND_RETRY_TIMEOUT_MS = 15000;
const TX_HEX_NOT_FOUND_MAX_ATTEMPTS = Math.ceil(
  TX_HEX_NOT_FOUND_RETRY_TIMEOUT_MS / TX_HEX_NOT_FOUND_RETRY_DELAY_MS,
);

type FetchFn = typeof globalThis.fetch;
type DelayFn = (ms: number) => Promise<void>;

const defaultDelay: DelayFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

interface WhatsOnChainUnspent {
  tx_hash: string;
  tx_pos: number;
  value: number;
  height?: number;
}

interface WhatsOnChainHistoryEntry {
  tx_hash: string;
  height?: number;
}

/** The unconfirmed/history endpoint wraps its entries in a result envelope instead of a bare array. */
interface WhatsOnChainHistoryEnvelope {
  result: WhatsOnChainHistoryEntry[];
}

/** WhatsOnChain testnet implementation of ChainProvider. fetch and the retry delay are injected so tests never touch the network. */
export class WhatsOnChainProvider implements ChainProvider {
  private readonly config: ChainConfig;
  private readonly fetchFn: FetchFn;
  private readonly delay: DelayFn;
  private requestGate: Promise<void> = Promise.resolve();
  private hasSentRequest = false;

  constructor(
    config: ChainConfig,
    // Bound, not a bare reference: a real browser's fetch throws "Illegal invocation"
    // when called detached from `window` (jsdom's fetch, used by every vitest run in
    // this repo, does not enforce that — this only surfaces against a real browser).
    fetchFn: FetchFn = globalThis.fetch.bind(globalThis),
    delay: DelayFn = defaultDelay,
  ) {
    this.config = config;
    this.fetchFn = fetchFn;
    this.delay = delay;
  }

  /**
   * Serializes dispatch across every request this provider instance makes, so no two
   * fire closer together than MIN_REQUEST_SPACING_MS. Called once per public method,
   * not per retry attempt: request()'s own 429/offline retries and getTransactionHex's
   * 404 retries already wait longer than this floor.
   */
  private async waitForRequestSlot(): Promise<void> {
    const myTurn = this.requestGate.then(async () => {
      if (this.hasSentRequest) {
        await this.delay(MIN_REQUEST_SPACING_MS);
      }
      this.hasSentRequest = true;
    });
    this.requestGate = myTurn;
    await myTurn;
  }

  async getUtxos(address: string): Promise<Utxo[]> {
    await this.waitForRequestSlot();
    const path = `/address/${address.trim()}/unspent`;
    const body = await this.getJson<unknown>(path);
    const unspent = this.expectArray<WhatsOnChainUnspent>(path, body);
    return unspent.map((u) => ({
      txid: u.tx_hash,
      vout: u.tx_pos,
      satoshis: u.value,
      height: u.height,
    }));
  }

  async getAddressHistory(address: string): Promise<AddressHistoryEntry[]> {
    await this.waitForRequestSlot();
    const path = `/address/${address.trim()}/history`;
    const body = await this.getJson<unknown>(path);
    const history = this.expectArray<WhatsOnChainHistoryEntry>(path, body);
    return history.map((h) => ({ txid: h.tx_hash, height: h.height }));
  }

  async getUnconfirmedAddressHistory(address: string): Promise<AddressHistoryEntry[]> {
    await this.waitForRequestSlot();
    const path = `/address/${address.trim()}/unconfirmed/history`;
    const body = await this.getJson<unknown>(path);
    const history = this.expectArray<WhatsOnChainHistoryEntry>(path, body);
    return history.map((h) => ({ txid: h.tx_hash, height: h.height }));
  }

  /**
   * WhatsOnChain returns a bare array from most list endpoints, but wraps the
   * unconfirmed/history endpoint in `{ address, script, result, error }`. Accept
   * either shape and reject anything else with a message naming the endpoint and
   * the body, rather than letting a bare `.map` throw an opaque TypeError.
   */
  private expectArray<T>(path: string, body: unknown): T[] {
    if (Array.isArray(body)) return body as T[];
    if (
      body &&
      typeof body === 'object' &&
      Array.isArray((body as Partial<WhatsOnChainHistoryEnvelope>).result)
    ) {
      return (body as WhatsOnChainHistoryEnvelope).result as unknown as T[];
    }
    const bodyText = JSON.stringify(body).slice(0, MAX_ERROR_BODY_CHARS);
    throw new ChainError(`WhatsOnChain ${path} returned an unexpected response shape: ${bodyText}`);
  }

  /**
   * Retries a 404 for up to TX_HEX_NOT_FOUND_RETRY_TIMEOUT_MS: WhatsOnChain's hex index can
   * lag its own unspent-list index by a few seconds right after broadcast (see the constants
   * above). Any other status or error propagates immediately, same as before.
   */
  async getTransactionHex(txid: string): Promise<string> {
    await this.waitForRequestSlot();
    const path = `/tx/${txid.trim()}/hex`;

    for (let attempt = 1; attempt <= TX_HEX_NOT_FOUND_MAX_ATTEMPTS; attempt++) {
      try {
        const response = await this.request(path);
        return (await response.text()).trim();
      } catch (error) {
        const isRetryableNotFound = error instanceof ChainError && error.status === 404;
        if (!isRetryableNotFound || attempt === TX_HEX_NOT_FOUND_MAX_ATTEMPTS) throw error;
        await this.delay(TX_HEX_NOT_FOUND_RETRY_DELAY_MS);
      }
    }

    // Unreachable: the loop above always returns or throws on its last attempt.
    throw new ChainError(`WhatsOnChain ${path} kept 404ing`);
  }

  async broadcast(txHex: string): Promise<string> {
    await this.waitForRequestSlot();
    const response = await this.request('/tx/raw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txhex: txHex }),
    });
    const body = (await response.text()).trim();
    return body.replace(/^"|"$/g, '');
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.request(path);
    return (await response.json()) as T;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.config.providerBaseUrl}${path}`;
    let retryDelayMs = INITIAL_RETRY_DELAY_MS;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let response: Response;
      try {
        response = await this.fetchFn(url, init);
      } catch (error) {
        // A rejected fetch is indistinguishable here from a 429: WhatsOnChain's rate-limit
        // reply carries no CORS header, so a real browser sees a cross-origin network error
        // (TypeError) rather than a status 429 (mw-0ym9.17). Retry it the same way.
        if (attempt === MAX_ATTEMPTS) {
          throw new ChainError(
            'Could not reach WhatsOnChain after 3 tries (offline, or rate-limited: its 429 reply carries no CORS header)',
            { cause: error },
          );
        }
        await this.delay(retryDelayMs);
        retryDelayMs *= 2;
        continue;
      }

      if (response.status === 429) {
        if (attempt === MAX_ATTEMPTS) {
          throw new ChainError('WhatsOnChain rate-limited the request (429) after retries');
        }
        await this.delay(retryDelayMs);
        retryDelayMs *= 2;
        continue;
      }

      if (!response.ok) {
        const bodyText = (await response.text()).trim().slice(0, MAX_ERROR_BODY_CHARS);
        const suffix = bodyText ? `: ${bodyText}` : '';
        throw new ChainError(`WhatsOnChain said ${response.status}${suffix}`, { status: response.status });
      }

      return response;
    }

    throw new ChainError('WhatsOnChain rate-limited the request (429) after retries');
  }
}
