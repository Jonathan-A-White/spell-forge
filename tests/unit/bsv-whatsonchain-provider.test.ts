import { describe, it, expect, vi } from 'vitest';
import { WhatsOnChainProvider } from '../../src/bsv/whatsonchain-provider';
import { ChainError } from '../../src/bsv/chain-error';
import type { ChainConfig } from '../../src/bsv/config';
import unspentFixture from '../fixtures/bsv/unspent.json';
import historyFixture from '../fixtures/bsv/history.json';

const testConfig: ChainConfig = {
  network: 'testnet',
  providerBaseUrl: 'https://api.whatsonchain.com/v1/bsv/test',
  anchorAddress: 'mpHF9jLctkpJfgBkksYVbdVvhqcYm5MS2b',
  feeRateSatPerKb: 1,
};

const address = 'mpHF9jLctkpJfgBkksYVbdVvhqcYm5MS2b';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function noopDelay() {
  return vi.fn().mockResolvedValue(undefined);
}

describe('WhatsOnChainProvider', () => {
  it('getUtxos returns typed UTXOs from a URL under the configured base', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(unspentFixture));
    const provider = new WhatsOnChainProvider(testConfig, fetchFn, noopDelay());

    const utxos = await provider.getUtxos(address);

    expect(utxos).toEqual([
      { txid: unspentFixture[0].tx_hash, vout: 0, satoshis: 600, height: 2432624 },
      { txid: unspentFixture[1].tx_hash, vout: 1, satoshis: 400, height: 2432700 },
    ]);

    const [requestedUrl] = fetchFn.mock.calls[0];
    expect(String(requestedUrl)).toMatch(/^https:\/\/api\.whatsonchain\.com\/v1\/bsv\/test/);
    expect(String(requestedUrl)).toContain(`/address/${address}/unspent`);
  });

  it('retries once after a 429 then returns the result on 200, waiting via the injected delay', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(jsonResponse(unspentFixture));
    const delay = noopDelay();
    const provider = new WhatsOnChainProvider(testConfig, fetchFn, delay);

    const utxos = await provider.getUtxos(address);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledTimes(1);
    expect(utxos).toHaveLength(2);
  });

  it('throws a ChainError after three consecutive 429s, calling fetch exactly three times', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    const provider = new WhatsOnChainProvider(testConfig, fetchFn, noopDelay());

    await expect(provider.getUtxos(address)).rejects.toThrow(ChainError);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('throws a ChainError with a readable offline message when fetch rejects', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('network error'));
    const provider = new WhatsOnChainProvider(testConfig, fetchFn, noopDelay());

    await expect(provider.getUtxos(address)).rejects.toThrow(/Could not reach WhatsOnChain \(offline\?\)/);
  });

  it('throws a readable ChainError on a non-2xx response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const provider = new WhatsOnChainProvider(testConfig, fetchFn, noopDelay());

    await expect(provider.getUtxos(address)).rejects.toThrow(/WhatsOnChain said 500/);
  });

  it('getAddressHistory returns txids with heights from the history fixture', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(historyFixture));
    const provider = new WhatsOnChainProvider(testConfig, fetchFn, noopDelay());

    const history = await provider.getAddressHistory(address);

    expect(history).toEqual([
      { txid: historyFixture[0].tx_hash, height: 2432624 },
      { txid: historyFixture[1].tx_hash, height: 0 },
    ]);

    const [requestedUrl] = fetchFn.mock.calls[0];
    expect(String(requestedUrl)).toContain(`/address/${address}/history`);
  });

  it('getTransactionHex returns the trimmed hex body from the tx/{txid}/hex route', async () => {
    const txid = 'a1b2c3d4';
    const fetchFn = vi.fn().mockResolvedValue(new Response('  deadbeef00\n', { status: 200 }));
    const provider = new WhatsOnChainProvider(testConfig, fetchFn, noopDelay());

    const hex = await provider.getTransactionHex(txid);

    expect(hex).toBe('deadbeef00');
    const [requestedUrl] = fetchFn.mock.calls[0];
    expect(String(requestedUrl)).toContain(`/tx/${txid}/hex`);
  });

  it('broadcast posts the tx hex to tx/raw and returns the unquoted txid', async () => {
    const txHex = 'deadbeef00';
    const fetchFn = vi.fn().mockResolvedValue(new Response('"resulttxid123"', { status: 200 }));
    const provider = new WhatsOnChainProvider(testConfig, fetchFn, noopDelay());

    const txid = await provider.broadcast(txHex);

    expect(txid).toBe('resulttxid123');
    const [requestedUrl, requestInit] = fetchFn.mock.calls[0];
    expect(String(requestedUrl)).toContain('/tx/raw');
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(requestInit?.body as string)).toEqual({ txhex: txHex });
  });

  it('broadcast throws a readable ChainError when the node rejects the transaction', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('tx has no inputs', { status: 400 }));
    const provider = new WhatsOnChainProvider(testConfig, fetchFn, noopDelay());

    await expect(provider.broadcast('deadbeef')).rejects.toThrow(/WhatsOnChain said 400/);
  });

  it('carries the response body text after the status when the node rejects a broadcast', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('bad-txns-inputs-missingorspent', { status: 400 }));
    const provider = new WhatsOnChainProvider(testConfig, fetchFn, noopDelay());

    let caught: unknown;
    try {
      await provider.broadcast('deadbeef');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ChainError);
    expect((caught as Error).message).toBe('WhatsOnChain said 400: bad-txns-inputs-missingorspent');
  });

  it('omits the body suffix when a non-OK response has an empty body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    const provider = new WhatsOnChainProvider(testConfig, fetchFn, noopDelay());

    let caught: unknown;
    try {
      await provider.getUtxos(address);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ChainError);
    expect((caught as Error).message).toBe('WhatsOnChain said 404');
  });

  it('truncates a long response body to at most 200 characters', async () => {
    const longBody = 'x'.repeat(500);
    const fetchFn = vi.fn().mockResolvedValue(new Response(longBody, { status: 400 }));
    const provider = new WhatsOnChainProvider(testConfig, fetchFn, noopDelay());

    let caught: unknown;
    try {
      await provider.getUtxos(address);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ChainError);
    expect((caught as Error).message).toBe(`WhatsOnChain said 400: ${'x'.repeat(200)}`);
  });

  it('getTransactionHex trims surrounding whitespace and newlines from the txid before building the URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('deadbeef00', { status: 200 }));
    const provider = new WhatsOnChainProvider(testConfig, fetchFn, noopDelay());

    await provider.getTransactionHex('  a1b2c3d4\n');

    const [requestedUrl] = fetchFn.mock.calls[0];
    expect(String(requestedUrl)).toContain('/tx/a1b2c3d4/hex');
    expect(String(requestedUrl)).not.toMatch(/\s|%0A/i);
  });

  it('getAddressHistory trims surrounding whitespace and newlines from the address before building the URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(historyFixture));
    const provider = new WhatsOnChainProvider(testConfig, fetchFn, noopDelay());

    await provider.getAddressHistory(`  ${address}\n`);

    const [requestedUrl] = fetchFn.mock.calls[0];
    expect(String(requestedUrl)).toContain(`/address/${address}/history`);
    expect(String(requestedUrl)).not.toMatch(/\s|%0A/i);
  });
});
