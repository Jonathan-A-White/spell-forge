// src/bsv/whatsonchain-provider.ts — ChainProvider backed by the WhatsOnChain testnet REST API.

import type { ChainProvider } from './chain-provider';
import type { ChainConfig } from './config';
import type { Utxo, AddressHistoryEntry } from '../contracts/types';
import { ChainError } from './chain-error';

const MAX_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_ERROR_BODY_CHARS = 200;

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

  async getUtxos(address: string): Promise<Utxo[]> {
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
    const path = `/address/${address.trim()}/history`;
    const body = await this.getJson<unknown>(path);
    const history = this.expectArray<WhatsOnChainHistoryEntry>(path, body);
    return history.map((h) => ({ txid: h.tx_hash, height: h.height }));
  }

  async getUnconfirmedAddressHistory(address: string): Promise<AddressHistoryEntry[]> {
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

  async getTransactionHex(txid: string): Promise<string> {
    const response = await this.request(`/tx/${txid.trim()}/hex`);
    return (await response.text()).trim();
  }

  async broadcast(txHex: string): Promise<string> {
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
        throw new ChainError('Could not reach WhatsOnChain (offline?)', { cause: error });
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
        throw new ChainError(`WhatsOnChain said ${response.status}${suffix}`);
      }

      return response;
    }

    throw new ChainError('WhatsOnChain rate-limited the request (429) after retries');
  }
}
