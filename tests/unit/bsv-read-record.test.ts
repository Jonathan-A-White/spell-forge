import { describe, it, expect, vi } from 'vitest';
import { readRecordByTxid } from '../../src/bsv/read-record';
import { createEventBus } from '../../src/contracts/events';
import { ChainError } from '../../src/bsv/chain-error';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import txFixture from '../fixtures/bsv/record-transaction.json';

function fakeProvider(overrides: Partial<ChainProvider> = {}): ChainProvider {
  return {
    getUtxos: vi.fn(),
    getTransactionHex: vi.fn().mockResolvedValue(txFixture.mixedTxHex),
    broadcast: vi.fn(),
    getAddressHistory: vi.fn(),
    ...overrides,
  };
}

describe('readRecordByTxid', () => {
  it('refuses a txid that is not 64 hex, and never calls the provider', async () => {
    const provider = fakeProvider();
    const eventBus = createEventBus();

    await expect(readRecordByTxid(provider, 'not-a-real-txid', eventBus)).rejects.toThrow(/transaction id/i);
    expect(provider.getTransactionHex).not.toHaveBeenCalled();
  });

  it('refuses a 64-character string that is not hex', async () => {
    const provider = fakeProvider();
    const eventBus = createEventBus();
    const notHex = 'z'.repeat(64);

    await expect(readRecordByTxid(provider, notHex, eventBus)).rejects.toThrow(/transaction id/i);
    expect(provider.getTransactionHex).not.toHaveBeenCalled();
  });

  it('fetches the tx hex once and emits bsv:record-read for a good txid', async () => {
    const provider = fakeProvider();
    const eventBus = createEventBus();
    const received: string[] = [];
    eventBus.on('bsv:record-read', (event) => {
      if (event.type === 'bsv:record-read') received.push(event.payload.txid);
    });

    const goodTxid = 'a'.repeat(64);
    const result = await readRecordByTxid(provider, goodTxid, eventBus);

    expect(provider.getTransactionHex).toHaveBeenCalledTimes(1);
    expect(provider.getTransactionHex).toHaveBeenCalledWith(goodTxid);
    expect(received).toEqual([goodTxid]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].decodedPayload).toEqual(txFixture.payload);
  });

  it('decodes a record that sits at output 2, not just output 0', async () => {
    const provider = fakeProvider();
    const eventBus = createEventBus();

    const result = await readRecordByTxid(provider, 'a'.repeat(64), eventBus);

    expect(txFixture.recordVout).toBe(2);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].vout).toBe(txFixture.recordVout);
  });

  it('trims surrounding whitespace and newlines from the txid before validating and fetching', async () => {
    const provider = fakeProvider();
    const eventBus = createEventBus();
    const goodTxid = 'a'.repeat(64);

    const result = await readRecordByTxid(provider, `  ${goodTxid}\n`, eventBus);

    expect(provider.getTransactionHex).toHaveBeenCalledWith(goodTxid);
    expect(result.txid).toBe(goodTxid);
  });

  it('emits bsv:record-read even when the transaction has no matching record', async () => {
    const provider = fakeProvider({ getTransactionHex: vi.fn().mockResolvedValue(txFixture.noRecordTxHex) });
    const eventBus = createEventBus();
    const received: string[] = [];
    eventBus.on('bsv:record-read', (event) => {
      if (event.type === 'bsv:record-read') received.push(event.payload.txid);
    });

    const goodTxid = 'b'.repeat(64);
    const result = await readRecordByTxid(provider, goodTxid, eventBus);

    expect(result.records).toEqual([]);
    expect(received).toEqual([goodTxid]);
  });

  it('explains a fresh 404 instead of passing the raw status through, and names the txid', async () => {
    const goodTxid = 'c'.repeat(64);
    const provider = fakeProvider({
      getTransactionHex: vi.fn().mockRejectedValue(new ChainError('WhatsOnChain said 404')),
    });
    const eventBus = createEventBus();

    let caught: unknown;
    try {
      await readRecordByTxid(provider, goodTxid, eventBus);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ChainError);
    const message = (caught as Error).message;
    expect(message).toContain(goodTxid);
    expect(message).toMatch(/has not seen/i);
    expect(message).not.toContain('404');
  });

  it('still throws other ChainErrors from getTransactionHex unchanged', async () => {
    const goodTxid = 'd'.repeat(64);
    const provider = fakeProvider({
      getTransactionHex: vi.fn().mockRejectedValue(new ChainError('Could not reach WhatsOnChain (offline?)')),
    });
    const eventBus = createEventBus();

    await expect(readRecordByTxid(provider, goodTxid, eventBus)).rejects.toThrow(
      'Could not reach WhatsOnChain (offline?)',
    );
  });
});
