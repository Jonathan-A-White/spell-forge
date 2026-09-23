import { describe, it, expect, vi } from 'vitest';
import { P2PKH, PrivateKey, Transaction, UnlockingScript } from '@bsv/sdk';
import { buildMintTransaction, buildTokenRecordTransaction, buildTransferTransaction } from '../../src/bsv/license-token';
import type { LicenseToken } from '../../src/bsv/license-token';
import { buildContractTokenRecordTransaction, buildContractTransferTransaction } from '../../src/bsv/license-contract';
import type { BuiltContractTransaction } from '../../src/bsv/license-contract';
import { followLicenseToken } from '../../src/bsv/token-lineage';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { ChainConfig } from '../../src/bsv/config';
import type { AddressHistoryEntry, Utxo } from '../../src/contracts/types';
import { fakeChain, mintOwnersLicense, utxoOf, wallet as contractWallet } from '../fixtures/bsv/license-contract-chain';

// Fixed WIFs (testnet), generated once — not derived from any live funds.
const ISSUER_WIF = 'cVrqDHmU8NyhzixQUuwNoy72CpRpS3PgpMtoWDB7BYe4oCNwB9N5';
const HOLDER_A_WIF = 'cRRKfjqDywEvtsG6Xoy4r8RmQPsjeGrETd4ghagSsWRmiKXggB6b';
const HOLDER_B_WIF = 'cSvhy8d9jyEhA9wRyywrQDFfGeXszN7E2BaLjPVYVi8rbXQwtQ9u';

const issuerAddress = PrivateKey.fromWif(ISSUER_WIF).toAddress('testnet');
const holderAAddress = PrivateKey.fromWif(HOLDER_A_WIF).toAddress('testnet');
const holderBAddress = PrivateKey.fromWif(HOLDER_B_WIF).toAddress('testnet');

const config: ChainConfig = {
  network: 'testnet',
  providerBaseUrl: 'https://api.whatsonchain.com/v1/bsv/test',
  anchorAddress: '',
  feeRateSatPerKb: 1,
  collectionId: 'spellforge-leaderboard-testnet',
};

/** A minimal parent transaction whose only purpose is to fund a fee input for one of the builders below. */
function fundingTx(address: string, satoshis = 5000): { hex: string; txid: string; utxo: Utxo } {
  const tx = new Transaction();
  tx.addOutput({ lockingScript: new P2PKH().lock(address), satoshis });
  const txid = tx.id('hex');
  return { hex: tx.toHex(), txid, utxo: { txid, vout: 0, satoshis } };
}

/** A provider that serves exactly the hex map given it — used only to build fixtures, offline. */
function buildTimeProvider(hexByTxid: Record<string, string>, utxos: Utxo[] = []): ChainProvider {
  return {
    getUtxos: vi.fn().mockResolvedValue(utxos),
    getTransactionHex: vi.fn((txid: string) => {
      const hex = hexByTxid[txid];
      return hex ? Promise.resolve(hex) : Promise.reject(new Error(`unexpected txid ${txid}`));
    }),
    broadcast: vi.fn(),
    getAddressHistory: vi.fn().mockResolvedValue([]),
  };
}

interface BuiltHop {
  txid: string;
  hex: string;
}

/** Builds mint -> write(A) -> transfer(A to B) -> write(B), all offline, using the real builders. */
async function buildChain(): Promise<{ mint: BuiltHop; write1: BuiltHop; transfer: BuiltHop; write2: BuiltHop }> {
  const issuerFunding = fundingTx(issuerAddress);
  const mintBuilt = await buildMintTransaction({
    issuerKey: ISSUER_WIF,
    utxos: [issuerFunding.utxo],
    holderAddress: holderAAddress,
    config,
    provider: buildTimeProvider({ [issuerFunding.txid]: issuerFunding.hex }),
  });
  const mint: BuiltHop = { txid: mintBuilt.txid, hex: mintBuilt.hex };

  const tokenAfterMint: LicenseToken = {
    origin: { txid: mint.txid, vout: 0 },
    current: { txid: mint.txid, vout: 0 },
    holderAddress: holderAAddress,
    collectionId: config.collectionId,
    lock: 'p2pkh',
  };
  const holderAFunding1 = fundingTx(holderAAddress);
  const write1Built = await buildTokenRecordTransaction({
    holderKey: HOLDER_A_WIF,
    token: tokenAfterMint,
    feeUtxos: [holderAFunding1.utxo],
    payload: { text: 'first write', ts: '2026-01-01T00:00:00.000Z' },
    config,
    provider: buildTimeProvider(
      { [mint.txid]: mint.hex, [holderAFunding1.txid]: holderAFunding1.hex },
      [{ txid: mint.txid, vout: 0, satoshis: 1 }, holderAFunding1.utxo],
    ),
  });
  const write1: BuiltHop = { txid: write1Built.txid, hex: write1Built.hex };

  const tokenAfterWrite1: LicenseToken = { ...tokenAfterMint, current: { txid: write1.txid, vout: 0 } };
  const holderAFunding2 = fundingTx(holderAAddress);
  const transferBuilt = await buildTransferTransaction({
    holderKey: HOLDER_A_WIF,
    token: tokenAfterWrite1,
    feeUtxos: [holderAFunding2.utxo],
    toAddress: holderBAddress,
    config,
    provider: buildTimeProvider(
      { [write1.txid]: write1.hex, [holderAFunding2.txid]: holderAFunding2.hex },
      [{ txid: write1.txid, vout: 0, satoshis: 1 }, holderAFunding2.utxo],
    ),
  });
  const transfer: BuiltHop = { txid: transferBuilt.txid, hex: transferBuilt.hex };

  const tokenAfterTransfer: LicenseToken = {
    origin: tokenAfterMint.origin,
    current: { txid: transfer.txid, vout: 0 },
    holderAddress: holderBAddress,
    collectionId: config.collectionId,
    lock: 'p2pkh',
  };
  const holderBFunding = fundingTx(holderBAddress);
  const write2Built = await buildTokenRecordTransaction({
    holderKey: HOLDER_B_WIF,
    token: tokenAfterTransfer,
    feeUtxos: [holderBFunding.utxo],
    payload: { text: 'second write', ts: '2026-01-02T00:00:00.000Z' },
    config,
    provider: buildTimeProvider(
      { [transfer.txid]: transfer.hex, [holderBFunding.txid]: holderBFunding.hex },
      [{ txid: transfer.txid, vout: 0, satoshis: 1 }, holderBFunding.utxo],
    ),
  });
  const write2: BuiltHop = { txid: write2Built.txid, hex: write2Built.hex };

  return { mint, write1, transfer, write2 };
}

function chainHistoryProvider(
  chain: Awaited<ReturnType<typeof buildChain>>,
  options: { extraHolderAEntry?: AddressHistoryEntry; extraHexByTxid?: Record<string, string> } = {},
): ChainProvider {
  const { mint, write1, transfer, write2 } = chain;
  const hexByTxid: Record<string, string> = {
    [mint.txid]: mint.hex,
    [write1.txid]: write1.hex,
    [transfer.txid]: transfer.hex,
    [write2.txid]: write2.hex,
    ...options.extraHexByTxid,
  };

  const holderAHistory: AddressHistoryEntry[] = [
    { txid: write1.txid, height: 100 },
    { txid: transfer.txid, height: 101 },
  ];
  if (options.extraHolderAEntry) holderAHistory.push(options.extraHolderAEntry);
  const holderBHistory: AddressHistoryEntry[] = [{ txid: write2.txid, height: 102 }];

  const getTransactionHex = vi.fn((txid: string) => {
    const hex = hexByTxid[txid];
    return hex ? Promise.resolve(hex) : Promise.reject(new Error(`unexpected txid ${txid}`));
  });

  const getAddressHistory = vi.fn((address: string) => {
    if (address === holderAAddress) return Promise.resolve(holderAHistory);
    if (address === holderBAddress) return Promise.resolve(holderBHistory);
    return Promise.resolve([]);
  });

  return {
    getUtxos: vi.fn(),
    getTransactionHex,
    broadcast: vi.fn(),
    getAddressHistory,
  };
}

describe('followLicenseToken', () => {
  it('walks mint -> write -> transfer(A to B) -> write(by B) in order, complete', async () => {
    const chain = await buildChain();
    const provider = chainHistoryProvider(chain);

    const result = await followLicenseToken({ origin: { txid: chain.mint.txid, vout: 0 }, provider });

    expect(result.hops).toHaveLength(4);
    expect(result.hops.map((hop) => hop.kind)).toEqual(['mint', 'write', 'transfer', 'write']);
    expect(result.hops.map((hop) => hop.txid)).toEqual([
      chain.mint.txid,
      chain.write1.txid,
      chain.transfer.txid,
      chain.write2.txid,
    ]);
    expect(result.hops[0].holderAddress).toBe(holderAAddress);
    expect(result.hops[1].holderAddress).toBe(holderAAddress);
    expect(result.hops[2].holderAddress).toBe(holderBAddress);
    expect(result.hops[3].holderAddress).toBe(holderBAddress);
    expect(result.hops[1].text).toBe('first write');
    expect(result.hops[3].text).toBe('second write');
    expect(result.current).toEqual({ txid: chain.write2.txid, vout: 0 });
    expect(result.holderAddress).toBe(holderBAddress);
    expect(result.complete).toBe(true);
    expect(result.brokenAtTxid).toBeUndefined();
  });

  it('stops and reports broken when a hop puts 2 satoshis in output 0', async () => {
    const chain = await buildChain();

    // Hand-built: spends write1's outpoint but leaves 2 sat at output 0 (violates the 1-sat rule).
    const brokenTx = new Transaction();
    brokenTx.addInput({ sourceTXID: chain.write1.txid, sourceOutputIndex: 0, unlockingScript: new UnlockingScript(), sequence: 0xffffffff });
    brokenTx.addOutput({ lockingScript: new P2PKH().lock(holderAAddress), satoshis: 2 });
    const brokenHex = brokenTx.toHex();
    const brokenTxid = brokenTx.id('hex');

    const provider = chainHistoryProvider(chain, {
      extraHolderAEntry: { txid: brokenTxid, height: 105 },
      extraHexByTxid: { [brokenTxid]: brokenHex },
    });
    // Make the broken spend the newest entry for holder A so it is found before the real transfer.
    (provider.getAddressHistory as ReturnType<typeof vi.fn>).mockImplementation((address: string) => {
      if (address === holderAAddress) {
        return Promise.resolve([
          { txid: chain.write1.txid, height: 100 },
          { txid: brokenTxid, height: 106 },
          { txid: chain.transfer.txid, height: 101 },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await followLicenseToken({ origin: { txid: chain.mint.txid, vout: 0 }, provider });

    expect(result.hops).toHaveLength(2);
    expect(result.hops.map((hop) => hop.txid)).toEqual([chain.mint.txid, chain.write1.txid]);
    expect(result.brokenAtTxid).toBe(brokenTxid);
    expect(result.complete).toBe(false);
  });

  it('ignores an unrelated transaction in the holder history that does not spend the token', async () => {
    const chain = await buildChain();

    const unrelatedTx = new Transaction();
    unrelatedTx.addInput({ sourceTXID: 'f'.repeat(64), sourceOutputIndex: 3, unlockingScript: new UnlockingScript(), sequence: 0xffffffff });
    unrelatedTx.addOutput({ lockingScript: new P2PKH().lock(holderAAddress), satoshis: 500 });
    const unrelatedHex = unrelatedTx.toHex();
    const unrelatedTxid = unrelatedTx.id('hex');

    const provider = chainHistoryProvider(chain, {
      extraHolderAEntry: { txid: unrelatedTxid, height: 150 },
      extraHexByTxid: { [unrelatedTxid]: unrelatedHex },
    });

    const result = await followLicenseToken({ origin: { txid: chain.mint.txid, vout: 0 }, provider });

    expect(result.hops.map((hop) => hop.txid)).toEqual([
      chain.mint.txid,
      chain.write1.txid,
      chain.transfer.txid,
      chain.write2.txid,
    ]);
    expect(result.complete).toBe(true);
  });

  it('stops at maxHops with complete: false', async () => {
    const chain = await buildChain();
    const provider = chainHistoryProvider(chain);

    const result = await followLicenseToken({ origin: { txid: chain.mint.txid, vout: 0 }, provider, maxHops: 2 });

    expect(result.hops).toHaveLength(2);
    expect(result.hops.map((hop) => hop.kind)).toEqual(['mint', 'write']);
    expect(result.complete).toBe(false);
  });

  it('calls getTransactionHex at most once per txid', async () => {
    const chain = await buildChain();
    const provider = chainHistoryProvider(chain);

    await followLicenseToken({ origin: { txid: chain.mint.txid, vout: 0 }, provider });

    const calls = (provider.getTransactionHex as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
    const uniqueCalls = new Set(calls);
    expect(calls.length).toBe(uniqueCalls.size);
  });
});

/** A License-locked chain: mint (owner) -> write (owner) -> transfer (owner to buyer). */
async function buildLicenseChain(): Promise<{ mint: BuiltContractTransaction; write: BuiltContractTransaction; transfer: BuiltContractTransaction }> {
  const mint = await mintOwnersLicense();
  const write = await buildContractTokenRecordTransaction({
    holderKey: contractWallet.owner.wif,
    token: mint.token,
    feeUtxos: [utxoOf(contractWallet.writeFundingTx)],
    payload: { text: 'license write', ts: '2026-01-01T00:00:00.000Z' },
    config,
    provider: fakeChain([mint.transaction]),
  });
  const transfer = await buildContractTransferTransaction({
    holderKey: contractWallet.owner.wif,
    token: write.token,
    feeUtxos: [utxoOf(contractWallet.transferFundingTx)],
    toPubKey: contractWallet.buyer.pubKey,
    config,
    provider: fakeChain([mint.transaction, write.transaction]),
  });
  return { mint, write, transfer };
}

function licenseChainHistoryProvider(chain: Awaited<ReturnType<typeof buildLicenseChain>>): ChainProvider {
  const { mint, write, transfer } = chain;
  const hexByTxid: Record<string, string> = {
    [mint.txid]: mint.hex,
    [write.txid]: write.hex,
    [transfer.txid]: transfer.hex,
  };
  const ownerHistory: AddressHistoryEntry[] = [
    { txid: write.txid, height: 200 },
    { txid: transfer.txid, height: 201 },
  ];

  return {
    getUtxos: vi.fn(),
    getTransactionHex: vi.fn((txid: string) => {
      const hex = hexByTxid[txid];
      return hex ? Promise.resolve(hex) : Promise.reject(new Error(`unexpected txid ${txid}`));
    }),
    broadcast: vi.fn(),
    getAddressHistory: vi.fn((address: string) => {
      if (address === contractWallet.owner.address) return Promise.resolve(ownerHistory);
      return Promise.resolve([]);
    }),
  };
}

describe('followLicenseToken over a License-locked (contract) chain', () => {
  it('crosses mint -> write -> transfer unchanged, reporting each hop’s owner from the contract’s state', async () => {
    const chain = await buildLicenseChain();
    const provider = licenseChainHistoryProvider(chain);

    const result = await followLicenseToken({ origin: { txid: chain.mint.txid, vout: 0 }, provider });

    // classifyHop only reads format-0x01 (plaintext) Data outputs; the contract-locked
    // builders write format 0x02 (typed), so mint and write fall back to 'unknown' here —
    // a pre-existing gap named in mw-5wuz6.3's closing comment, out of scope for this
    // story. transfer is still detected because it changes the holder address.
    expect(result.hops).toHaveLength(3);
    expect(result.hops.map((hop) => hop.kind)).toEqual(['unknown', 'unknown', 'transfer']);
    expect(result.hops.map((hop) => hop.txid)).toEqual([chain.mint.txid, chain.write.txid, chain.transfer.txid]);
    expect(result.hops[0].holderAddress).toBe(contractWallet.owner.address);
    expect(result.hops[1].holderAddress).toBe(contractWallet.owner.address);
    expect(result.hops[2].holderAddress).toBe(contractWallet.buyer.address);
    expect(result.current).toEqual({ txid: chain.transfer.txid, vout: 0 });
    expect(result.holderAddress).toBe(contractWallet.buyer.address);
    expect(result.complete).toBe(true);
    expect(result.brokenAtTxid).toBeUndefined();
  });
});
