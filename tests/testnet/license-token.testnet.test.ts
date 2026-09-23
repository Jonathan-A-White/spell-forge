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
import { PrivateKey, Transaction } from '@bsv/sdk';
import { createChainProvider } from '../../src/bsv/chain-provider';
import { chainConfig } from '../../src/bsv/config';
import { createEventBus } from '../../src/contracts/events';
import { mintLicenseToken, transferLicenseToken, writeWithToken } from '../../src/bsv/license-token';
import type { LicenseToken, Outpoint, TokenRepository } from '../../src/bsv/license-token';
import {
  buildContractMintTransaction,
  buildContractTokenRecordTransaction,
  buildContractTransferTransaction,
  buildContractSpendVariant,
  verifyLicenseInput,
} from '../../src/bsv/license-contract';
import { followLicenseToken } from '../../src/bsv/token-lineage';
import { requireFundedHarness, withPacing, pollForUtxo } from '../../src/bsv/node/testnet-e2e-helpers';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { PendingSpendRepository } from '../../src/bsv/pending-spends';
import type { Utxo } from '../../src/contracts/types';

/** This e2e tracks the token's current outpoint itself; the repository just has to satisfy the interface. */
function noopTokenRepository(): TokenRepository {
  return {
    async updateCurrent(): Promise<void> {},
  };
}

/**
 * This e2e tracks its own already-spent outpoints via withSpentTracking below, ahead of
 * WhatsOnChain's confirmation lag; the repository here just has to satisfy the interface
 * license-token.ts's builders now require (mw-b00z.11).
 */
function noopPendingSpendRepo(): PendingSpendRepository {
  return {
    async getAll() {
      return [];
    },
    async add() {},
    async removeMany() {},
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
  timeoutMs = 60000,
): Promise<void> {
  await pollForUtxo({ provider, address, outpoint, timeoutMs });
  await waitForTransactionHex(provider, outpoint.txid, 3000, timeoutMs);
}

/**
 * The License-locked equivalent of waitUntilReady, for a hop whose spend the caller is
 * about to fetch by txid only (spendableLicense fetches token.current by txid, not by
 * address): output 0 (the covenant) is never attributable to any address by WhatsOnChain's
 * P2PKH-keyed /unspent index, unlike a p2pkh token's output 0, so there is no address-level
 * signal to poll for it — just the transaction hex (mw-5wuz6.6).
 */
async function waitUntilContractReady(provider: ChainProvider, txid: string, timeoutMs = 60000): Promise<void> {
  await waitForTransactionHex(provider, txid, 3000, timeoutMs);
}

/**
 * The License-locked equivalent of waitUntilReady, for a hop whose Fuel/change output
 * (vout 1, a real P2PKH to the holder — unlike output 0, the covenant) the NEXT step will
 * select as a fee UTXO via that holder's address: waits for vout 1 to show up there too,
 * not just the transaction hex. Skip this (use waitUntilContractReady instead) for a hop
 * nothing downstream spends the change of, e.g. the last op before negatives/lineage.
 * Observed live 2026-09-23: WhatsOnChain's address-level /unspent index and its
 * /tx/{txid}/hex can each lag the other by over a minute, in either order, so a step that
 * actually needs the address-level signal must wait for it explicitly (mw-5wuz6.6).
 */
async function waitUntilContractFeeReady(
  provider: ChainProvider,
  address: string,
  txid: string,
  timeoutMs = 60000,
): Promise<void> {
  await pollForUtxo({ provider, address, outpoint: { txid, vout: 1 }, timeoutMs });
  await waitForTransactionHex(provider, txid, 3000, timeoutMs);
}

/**
 * followLicenseToken finds each hop by searching the current holder's address history for
 * a transaction whose input 0 references the previous hop's outpoint — a third WhatsOnChain
 * index (/address/{addr}/history and /unconfirmed/history), independent of the /unspent and
 * /tx/hex ones, that can lag behind a broadcast just as unpredictably (observed live
 * 2026-09-23: a lineage walk called right after a write and transfer broadcast found only
 * the mint hop and reported the token complete at the origin — not broken, just too early).
 * Waits for a specific txid to show up in address's history before trusting a lineage walk
 * over it (mw-5wuz6.6).
 */
async function waitForAddressHistory(
  provider: ChainProvider,
  address: string,
  txid: string,
  timeoutMs = 60000,
  intervalMs = 3000,
): Promise<void> {
  const maxAttempts = Math.max(1, Math.floor(timeoutMs / intervalMs));
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const [confirmed, unconfirmed] = await Promise.all([
      provider.getAddressHistory(address),
      provider.getUnconfirmedAddressHistory ? provider.getUnconfirmedAddressHistory(address) : Promise.resolve([]),
    ]);
    if ([...confirmed, ...unconfirmed].some((entry) => entry.txid === txid)) return;
    if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${txid} to appear in ${address}'s address history`);
}

function outpointKey(u: { txid: string; vout: number }): string {
  return `${u.txid}:${u.vout}`;
}

/** Total input satoshis minus total output satoshis — the miner fee a signed transaction actually paid. */
function feeOf(transaction: Transaction): number {
  const inputTotal = transaction.inputs.reduce(
    (sum, input) => sum + (input.sourceTransaction?.outputs[input.sourceOutputIndex]?.satoshis ?? 0),
    0,
  );
  const outputTotal = transaction.outputs.reduce((sum, output) => sum + (output.satoshis ?? 0), 0);
  return inputTotal - outputTotal;
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
  it('mints, writes, transfers, writes a p2pkh token (lineage: four hops); then mints, writes and transfers a License-locked contract token (lineage: three hops), and its four invalid spends fail local verify with the non-owner signature rejected on broadcast', async () => {
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
      pendingSpendRepo: noopPendingSpendRepo(),
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
      pendingSpendRepo: noopPendingSpendRepo(),
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
      pendingSpendRepo: noopPendingSpendRepo(),
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
      pendingSpendRepo: noopPendingSpendRepo(),
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

    // === Contract run (mw-5wuz6.6): the same three wallets, now minting and spending a
    // License-locked token instead of a plain P2PKH one. Shares this test's provider and
    // markSpent (rather than a fresh withSpentTracking) so this run's own fee UTXOs are
    // correctly excluded — WhatsOnChain still lists the p2pkh flow's spent UTXOs above as
    // unspent for a while after broadcast (mw-b00z.6), and a fresh spent-tracker here would
    // reselect one of them and collide with it as "txn-mempool-conflict". ===
    const holderAPubKeyHex = PrivateKey.fromWif(harness.holderA.entry.wif).toPublicKey().toString();
    const holderBPubKeyHex = PrivateKey.fromWif(harness.holderB.entry.wif).toPublicKey().toString();

    // --- Mint: issuer -> holder A, a genuinely different party (buildContractMintTransaction
    // directly: mintContractLicenseToken only mints to the issuer's own key). ---
    const issuerUtxos = await provider.getUtxos(harness.issuer.address);
    const mintBuilt = await buildContractMintTransaction({
      issuerKey: harness.issuer.entry.wif,
      utxos: issuerUtxos,
      holderPubKey: holderAPubKeyHex,
      config: chainConfig,
      provider,
    });
    markSpent(issuerUtxos);
    const mintTxid = await provider.broadcast(mintBuilt.hex);
    expect(mintTxid).toBe(mintBuilt.txid);
    let contractToken: LicenseToken = mintBuilt.token;
    await waitUntilContractFeeReady(provider, holderAAddress, mintTxid, 120000);

    // --- Write: holder A writes a record, spend-and-recreate to itself. ---
    const holderAFeeUtxosForWrite = (await provider.getUtxos(holderAAddress)).filter((u) => u.satoshis !== 1);
    const contractTs1 = new Date().toISOString();
    const writeBuilt = await buildContractTokenRecordTransaction({
      holderKey: harness.holderA.entry.wif,
      token: contractToken,
      feeUtxos: holderAFeeUtxosForWrite,
      payload: { text: `contract e2e write ${contractTs1}`, ts: contractTs1 },
      config: chainConfig,
      provider,
    });
    markSpent(holderAFeeUtxosForWrite);
    markSpent([{ txid: contractToken.current.txid, vout: contractToken.current.vout, satoshis: 1 }]);
    const writeTxid = await provider.broadcast(writeBuilt.hex);
    expect(writeTxid).toBe(writeBuilt.txid);
    contractToken = writeBuilt.token;
    await waitUntilContractFeeReady(provider, holderAAddress, writeTxid, 120000);

    // --- The four invalid spends, built against the write-stage token (still holder A's):
    // each fails local verify (rules f, c, b, d). Built from holder A, not holder B — the
    // Fuel stand-in binds the minting holder's own key forever (spendableLicense's check,
    // license-contract.ts), so a later holder cannot spend this token at all under the
    // current stand-in, let alone build a spend deliberately violating one more rule of it;
    // that is a real, separate, already-documented limitation, not this story's rule
    // violations, so it must not be what these four negatives fail on (mw-5wuz6.6).
    //
    // license-bridge.ts's unlockingScript() calls the committed contract's own write()
    // method to build the script (not a "blind" build): rules (b), (c) and (f) are all one
    // assert over the exact rebuilt output list, so a layout violation throws synchronously
    // right there, during buildContractSpendVariant itself — never reaching a transaction to
    // hand to verifyLicenseInput. Only rule (d) (the signature) survives to be built into a
    // real transaction, for verifyLicenseInput's interpreter to reject afterward — so that
    // one is also the one broadcast below. ---
    const holderAFeeUtxosForNegatives = (await provider.getUtxos(holderAAddress)).filter((u) => u.satoshis !== 1);
    const negativePayload = { text: 'invalid spend probe', ts: new Date().toISOString() };
    const LAYOUT_ASSERT = /rules \(b\), \(c\), \(f\)/;

    await expect(
      buildContractSpendVariant({
        holderKey: harness.holderA.entry.wif,
        token: contractToken,
        feeUtxos: holderAFeeUtxosForNegatives,
        payload: negativePayload,
        extraOutputs: [{ address: harness.issuer.address, satoshis: 500 }],
        config: chainConfig,
        provider,
      }),
    ).rejects.toThrow(LAYOUT_ASSERT);
    console.log('negative (four outputs, rule f): the contract\'s own layout assert refused it while building');

    await expect(
      buildContractSpendVariant({
        holderKey: harness.holderA.entry.wif,
        token: contractToken,
        feeUtxos: holderAFeeUtxosForNegatives,
        payload: negativePayload,
        output0OwnerPubKeyHex: holderBPubKeyHex,
        config: chainConfig,
        provider,
      }),
    ).rejects.toThrow(LAYOUT_ASSERT);
    console.log('negative (owner key swapped on a write, rule c): the contract\'s own layout assert refused it while building');

    await expect(
      buildContractSpendVariant({
        holderKey: harness.holderA.entry.wif,
        token: contractToken,
        feeUtxos: holderAFeeUtxosForNegatives,
        payload: negativePayload,
        outputSatoshis: 2,
        config: chainConfig,
        provider,
      }),
    ).rejects.toThrow(LAYOUT_ASSERT);
    console.log('negative (output 0 with 2 satoshis, rule b): the contract\'s own layout assert refused it while building');

    const nonOwnerSig = await buildContractSpendVariant({
      holderKey: harness.holderA.entry.wif,
      token: contractToken,
      feeUtxos: holderAFeeUtxosForNegatives,
      payload: negativePayload,
      signerKey: harness.holderB.entry.wif,
      config: chainConfig,
      provider,
    });
    const nonOwnerSigResult = await verifyLicenseInput(nonOwnerSig.transaction);
    console.log('negative (non-owner signature, rule d) local verify:', JSON.stringify(nonOwnerSigResult));
    expect(nonOwnerSigResult.success).toBe(false);

    // --- Broadcast exactly one (the non-owner signature): everything about this
    // transaction — funding, fee, layout, every other signature — is exactly as valid as
    // the real write above, so the node can only reject it because of the covenant's rule
    // (d) (Governor's Q3). ---
    let broadcastError: unknown;
    try {
      await provider.broadcast(nonOwnerSig.hex);
    } catch (error) {
      broadcastError = error;
    }
    expect(broadcastError).toBeInstanceOf(Error);
    const rejectionMessage = broadcastError instanceof Error ? broadcastError.message : String(broadcastError);
    console.log('attempted txid (non-owner signature, rejected by the node):', nonOwnerSig.txid);
    console.log('node rejection text:', rejectionMessage);
    expect(rejectionMessage.length).toBeGreaterThan(0);

    // --- Transfer: holder A -> holder B. The rejected negative above never touched the
    // chain, so the write's outpoint is still there to spend. ---
    const holderAFeeUtxosForTransfer = (await provider.getUtxos(holderAAddress)).filter((u) => u.satoshis !== 1);
    const transferBuilt = await buildContractTransferTransaction({
      holderKey: harness.holderA.entry.wif,
      token: contractToken,
      feeUtxos: holderAFeeUtxosForTransfer,
      toPubKey: holderBPubKeyHex,
      config: chainConfig,
      provider,
    });
    markSpent(holderAFeeUtxosForTransfer);
    markSpent([{ txid: contractToken.current.txid, vout: contractToken.current.vout, satoshis: 1 }]);
    const transferTxid = await provider.broadcast(transferBuilt.hex);
    expect(transferTxid).toBe(transferBuilt.txid);
    contractToken = transferBuilt.token;
    await waitUntilContractReady(provider, transferTxid, 120000);

    // --- Lineage: three hops (mint, write, transfer), the right owner at each. Both write
    // and transfer are found by searching holder A's address history (the token's holder
    // through both of those hops), so both must show up there first. ---
    await waitForAddressHistory(provider, holderAAddress, writeTxid, 120000);
    await waitForAddressHistory(provider, holderAAddress, transferTxid, 120000);
    const contractLineage = await followLicenseToken({ origin: mintBuilt.token.origin, provider });

    console.log('=== testnet contract e2e result ===');
    console.log('mint txid:', mintTxid);
    console.log('write txid:', writeTxid);
    console.log('transfer txid:', transferTxid);
    console.log('lineage complete:', contractLineage.complete);
    console.log('lineage current holder:', contractLineage.holderAddress);
    console.log('lineage hops:', JSON.stringify(contractLineage.hops, null, 2));

    expect(contractLineage.brokenAtTxid).toBeUndefined();
    expect(contractLineage.complete).toBe(true);
    expect(contractLineage.hops).toHaveLength(3);
    expect(contractLineage.hops.map((hop) => hop.holderAddress)).toEqual([holderAAddress, holderAAddress, holderBAddress]);
    expect(contractLineage.hops.map((hop) => hop.txid)).toEqual([mintTxid, writeTxid, transferTxid]);
    expect(contractLineage.current).toEqual({ txid: transferTxid, vout: 0 });
    expect(contractLineage.holderAddress).toBe(holderBAddress);

    // --- Measured sizes of the real write and transfer, for SIZES.md beside the estimates. ---
    const writeSizes = {
      unlockingBytes: writeBuilt.transaction.inputs[0].unlockingScript!.toBinary().length,
      dataScriptBytes: writeBuilt.transaction.outputs[2].lockingScript.toBinary().length,
      output1Bytes: writeBuilt.transaction.outputs[1].lockingScript.toBinary().length,
      feeSatoshis: feeOf(writeBuilt.transaction),
    };
    const transferSizes = {
      unlockingBytes: transferBuilt.transaction.inputs[0].unlockingScript!.toBinary().length,
      dataScriptBytes: transferBuilt.transaction.outputs[2].lockingScript.toBinary().length,
      output1Bytes: transferBuilt.transaction.outputs[1].lockingScript.toBinary().length,
      feeSatoshis: feeOf(transferBuilt.transaction),
    };
    console.log('measured write sizes (real tx):', JSON.stringify(writeSizes));
    console.log('measured transfer sizes (real tx):', JSON.stringify(transferSizes));
  }, 9 * 60 * 1000);
});
