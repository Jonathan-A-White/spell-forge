// tests/testnet/license-token.testnet.test.ts — On-demand testnet e2e: mint, write,
// transfer, write, then follow the token from its origin, against the REAL WhatsOnChain
// testnet API using the funded harness keys (~/.config/spell-forge/bsv-testnet-keys.json
// by default, or $SPELLFORGE_BSV_KEYS).
//
// NOT part of `npm test` or `npm run test:bsv` — a separate vitest project
// (vitest.testnet.config.ts), run by hand with `npm run test:bsv:testnet`. Costs a few
// thousand testnet satoshis and several minutes every run (mint + 2 writes + 1 transfer,
// each waited out with polling rather than a block confirmation).
//
// Fails fast, rather than skipping, when the harness key file is missing or any of the
// three addresses (issuer, holderA, holderB) has a zero balance — see mw-2rbm.2.

import { describe, it, expect } from 'vitest';
import { createChainProvider } from '../../src/bsv/chain-provider';
import { chainConfig } from '../../src/bsv/config';
import { createEventBus } from '../../src/contracts/events';
import { mintLicenseToken, transferLicenseToken, writeWithToken } from '../../src/bsv/license-token';
import type { LicenseToken, Outpoint, TokenRepository } from '../../src/bsv/license-token';
import { followLicenseToken } from '../../src/bsv/token-lineage';
import { requireFundedHarness, withPacing, pollForUtxo } from '../../src/bsv/node/testnet-e2e-helpers';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { Utxo } from '../../src/contracts/types';

/** This e2e tracks the token's current outpoint itself; the repository just has to satisfy the interface. */
function noopTokenRepository(): TokenRepository {
  return {
    async updateCurrent(): Promise<void> {},
  };
}

/**
 * WhatsOnChain's /tx/{txid}/hex indexes a broadcast slightly after /address/{addr}/unspent
 * lists it — observed live 2026-09-23 (a 404 from getTransactionHex on a txid whose output
 * pollForUtxo had already confirmed as unspent seconds earlier). Every builder here fetches
 * the token's current outpoint by hex before spending it, so wait for that specifically too.
 */
async function waitForTransactionHex(
  provider: Pick<ChainProvider, 'getTransactionHex'>,
  txid: string,
  intervalMs = 3000,
  timeoutMs = 60000,
): Promise<void> {
  const maxAttempts = Math.max(1, Math.floor(timeoutMs / intervalMs));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await provider.getTransactionHex(txid);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Timed out after ${timeoutMs}ms waiting for WhatsOnChain to serve /tx/${txid}/hex: ${reason}`);
}

async function waitUntilReady(
  provider: ChainProvider,
  address: string,
  outpoint: { txid: string; vout: number },
): Promise<void> {
  await pollForUtxo({ provider, address, outpoint });
  await waitForTransactionHex(provider, outpoint.txid);
}

function outpointKey(u: { txid: string; vout: number }): string {
  return `${u.txid}:${u.vout}`;
}

/**
 * Wraps getUtxos to hide outpoints this run already knows it spent. license-token.ts's
 * builders re-fetch and sweep ALL of a holder's non-token UTXOs on every call (unlike
 * writeRecord/sendSats, they carry no pending-spend exclusion of their own — out of scope
 * to add here). WhatsOnChain's /unspent keeps listing an input as unspent until the
 * spending transaction actually confirms in a block, not just once it is broadcast
 * (observed live 2026-09-23: a fee UTXO spent by write1 was still listed unspent, still
 * unconfirmed, when transfer read the same address seconds later, and the reselected
 * double-spend was rejected as "txn-mempool-conflict"). Tracking our own spends locally
 * sidesteps that lag deterministically, without waiting on a block or touching production
 * coin selection.
 */
function withSpentTracking(provider: ChainProvider): { provider: ChainProvider; markSpent: (utxos: Utxo[]) => void } {
  const spent = new Set<string>();
  const wrapped: ChainProvider = {
    ...provider,
    getUtxos: async (address: string) => {
      const utxos = await provider.getUtxos(address);
      return utxos.filter((u) => !spent.has(outpointKey(u)));
    },
  };
  return {
    provider: wrapped,
    markSpent: (utxos: Utxo[]) => {
      for (const u of utxos) spent.add(outpointKey(u));
    },
  };
}

describe('testnet license token e2e', () => {
  it('mints, writes, transfers, writes, then the lineage confirms four hops with B as current holder', async () => {
    const { provider, markSpent } = withSpentTracking(withPacing(createChainProvider(chainConfig)));
    const harness = await requireFundedHarness(provider);
    const eventBus = createEventBus();
    const repository = noopTokenRepository();

    const holderAAddress = harness.holderA.address;
    const holderBAddress = harness.holderB.address;

    const txids: { mint: string; write1: string; transfer: string; write2: string } = {
      mint: '',
      write1: '',
      transfer: '',
      write2: '',
    };

    // Diagnostic only, ahead of spending anything: the rig memory notes this route was
    // never checked against the live API. followLicenseToken calls it internally on every
    // hop below, so a failure here predicts a failure there too.
    let unconfirmedHistoryAnswered: string;
    try {
      await provider.getUnconfirmedAddressHistory!(holderAAddress);
      unconfirmedHistoryAnswered = 'yes';
    } catch (error) {
      unconfirmedHistoryAnswered = `no: ${error instanceof Error ? error.message : String(error)}`;
    }
    console.log('WhatsOnChain /address/{addr}/unconfirmed/history answered:', unconfirmedHistoryAnswered);

    const issuerFeeUtxos = await provider.getUtxos(harness.issuer.address);
    const token: LicenseToken = await mintLicenseToken({
      issuerKey: harness.issuer.entry.wif,
      holderAddress: holderAAddress,
      provider,
      config: chainConfig,
      eventBus,
    });
    markSpent(issuerFeeUtxos);
    txids.mint = token.origin.txid;
    await waitUntilReady(provider, holderAAddress, token.current);

    const holderAFeeUtxosBeforeWrite1 = (await provider.getUtxos(holderAAddress)).filter((u) => u.satoshis !== 1);
    const ts1 = new Date().toISOString();
    const write1 = await writeWithToken({
      holderKey: harness.holderA.entry.wif,
      token,
      payload: { text: `e2e write 1 ${ts1}`, ts: ts1 },
      provider,
      config: chainConfig,
      eventBus,
      repository,
    });
    markSpent(holderAFeeUtxosBeforeWrite1);
    markSpent([{ txid: token.current.txid, vout: token.current.vout, satoshis: 1 }]);
    txids.write1 = write1.txid;
    token.current = { txid: write1.txid, vout: 0 };
    await waitUntilReady(provider, holderAAddress, token.current);

    const holderAFeeUtxosBeforeTransfer = (await provider.getUtxos(holderAAddress)).filter((u) => u.satoshis !== 1);
    const transfer = await transferLicenseToken({
      holderKey: harness.holderA.entry.wif,
      token,
      toAddress: holderBAddress,
      provider,
      config: chainConfig,
      eventBus,
      repository,
    });
    markSpent(holderAFeeUtxosBeforeTransfer);
    markSpent([{ txid: token.current.txid, vout: token.current.vout, satoshis: 1 }]);
    txids.transfer = transfer.txid;
    token.current = { txid: transfer.txid, vout: 0 } satisfies Outpoint;
    token.holderAddress = holderBAddress;
    await waitUntilReady(provider, holderBAddress, token.current);

    const holderBFeeUtxosBeforeWrite2 = (await provider.getUtxos(holderBAddress)).filter((u) => u.satoshis !== 1);
    const ts2 = new Date().toISOString();
    const write2 = await writeWithToken({
      holderKey: harness.holderB.entry.wif,
      token,
      payload: { text: `e2e write 2 ${ts2}`, ts: ts2 },
      provider,
      config: chainConfig,
      eventBus,
      repository,
    });
    markSpent(holderBFeeUtxosBeforeWrite2);
    markSpent([{ txid: token.current.txid, vout: token.current.vout, satoshis: 1 }]);
    txids.write2 = write2.txid;
    token.current = { txid: write2.txid, vout: 0 };
    await waitUntilReady(provider, holderBAddress, token.current);

    const lineage = await followLicenseToken({ origin: token.origin, provider });

    // No sats leave the three-wallet system except as miner fees (the token's 1 sat
    // stays inside it throughout) — so the drop in the three addresses' combined balance
    // (reading through the same spent-tracking filter, so a not-yet-confirmed spend from
    // this run isn't miscounted as still-spendable) is exactly the total fees this run spent.
    const initialTotalSatoshis = harness.issuer.satoshis + harness.holderA.satoshis + harness.holderB.satoshis;
    const finalUtxosByAddress = await Promise.all(
      [harness.issuer.address, holderAAddress, holderBAddress].map((address) => provider.getUtxos(address)),
    );
    const finalTotalSatoshis = finalUtxosByAddress.flat().reduce((sum, utxo) => sum + utxo.satoshis, 0);
    const totalSpentSatoshis = initialTotalSatoshis - finalTotalSatoshis;

    console.log('=== testnet e2e result ===');
    console.log('origin:', `${token.origin.txid}:${token.origin.vout}`);
    console.log('mint txid:', txids.mint);
    console.log('write1 txid:', txids.write1);
    console.log('transfer txid:', txids.transfer);
    console.log('write2 txid:', txids.write2);
    console.log('lineage complete:', lineage.complete);
    console.log('lineage current holder:', lineage.holderAddress);
    console.log('lineage hops:', JSON.stringify(lineage.hops, null, 2));
    console.log('total satoshis spent (fees):', totalSpentSatoshis);

    expect(lineage.brokenAtTxid).toBeUndefined();
    expect(lineage.complete).toBe(true);
    expect(lineage.hops).toHaveLength(4);
    expect(lineage.hops.map((hop) => hop.kind)).toEqual(['mint', 'write', 'transfer', 'write']);
    expect(lineage.hops.map((hop) => hop.holderAddress)).toEqual([
      holderAAddress,
      holderAAddress,
      holderBAddress,
      holderBAddress,
    ]);
    expect(lineage.hops.map((hop) => hop.txid)).toEqual([txids.mint, txids.write1, txids.transfer, txids.write2]);
    expect(lineage.current).toEqual({ txid: txids.write2, vout: 0 });
    expect(lineage.holderAddress).toBe(holderBAddress);
  });
});
