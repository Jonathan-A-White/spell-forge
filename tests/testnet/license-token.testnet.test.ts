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
import { P2PKH, PrivateKey, Transaction } from '@bsv/sdk';
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
  fuelLockingScript,
  verifyFuelInput,
  verifyLicenseInput,
} from '../../src/bsv/license-contract';
import type { BuildContractSpendVariantParams } from '../../src/bsv/license-contract';
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
 * Wraps getUtxos to hide outpoints this run already knows it spent, and to dedupe by
 * outpoint. license-token.ts's builders re-fetch and sweep ALL of a holder's non-token
 * UTXOs on every call (unlike writeRecord/sendSats, they carry no pending-spend exclusion
 * of their own — out of scope to add here). WhatsOnChain's /unspent keeps listing an input
 * as unspent until the spending transaction actually confirms in a block, not just once it
 * is broadcast (observed live 2026-09-23: a fee UTXO spent by write1 was still listed
 * unspent, still unconfirmed, when transfer read the same address seconds later, and the
 * reselected double-spend was rejected as "txn-mempool-conflict"). Tracking our own spends
 * locally sidesteps that lag deterministically, without waiting on a block or touching
 * production coin selection. Separately, /unspent can list the SAME outpoint twice around
 * the moment it confirms — once at height 0, once at its real height (observed live
 * 2026-09-23 on a freshly-funded issuer address) — which would otherwise make a builder add
 * it as two inputs and get "bad-txns-inputs-duplicate" back from the node; deduping here
 * fixes it for every call through this provider, without touching production coin selection.
 */
function withSpentTracking(provider: ChainProvider): { provider: ChainProvider; markSpent: (utxos: Utxo[]) => void } {
  const spent = new Set<string>();
  const wrapped: ChainProvider = {
    ...provider,
    getUtxos: async (address: string) => {
      const utxos = await provider.getUtxos(address);
      const seen = new Set<string>();
      return utxos.filter((u) => {
        const key = outpointKey(u);
        if (spent.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
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
  it('mints, writes, transfers, writes a p2pkh token (lineage: four hops); then mints (MINT_FUEL 10,000 sat), writes with no holder coin and transfers a License + Fuel(C) contract token, with the Governor\'s four Fuel negatives failing local verify and the under-conservation one rejected on broadcast', async () => {
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

    // === Contract run (mw-yo97u.5): the same three wallets, now minting and spending a
    // License-locked token backed by a real Fuel(C) at MINT_FUEL = 10,000 sat (two FEE_CAP
    // burns plus headroom, spec §3.9/§6) instead of the step 2 P2PKH stand-in. Shares this
    // test's provider and markSpent (rather than a fresh withSpentTracking) so this run's
    // own fee UTXOs are correctly excluded — WhatsOnChain still lists the p2pkh flow's spent
    // UTXOs above as unspent for a while after broadcast (mw-b00z.6), and a fresh
    // spent-tracker here would reselect one of them and collide with it as
    // "txn-mempool-conflict". Neither the License covenant (output 0) nor Fuel(C) (output 1)
    // is a P2PKH, so address-history-based lineage discovery (token-lineage.ts) does not
    // apply here — this run confirms each hop directly from the built and refetched
    // transactions instead. ===
    const MINT_FUEL = 10_000; // two FEE_CAP burns (write, transfer) plus headroom
    const FEE_CAP = 2_000; // Fuel(C)'s FEE_CAP, spec §3.9
    const holderAPubKeyHex = PrivateKey.fromWif(harness.holderA.entry.wif).toPublicKey().toString();
    const holderBPubKeyHex = PrivateKey.fromWif(harness.holderB.entry.wif).toPublicKey().toString();

    // --- Mint: issuer -> holder A, a genuinely different party (buildContractMintTransaction
    // directly: mintContractLicenseToken only mints to the issuer's own key). ---
    const issuerUtxos = await provider.getUtxos(harness.issuer.address);
    const mintBuilt = await buildContractMintTransaction({
      issuerKey: harness.issuer.entry.wif,
      utxos: issuerUtxos,
      holderPubKey: holderAPubKeyHex,
      mintFuelSatoshis: MINT_FUEL,
      config: chainConfig,
      provider,
    });
    markSpent(issuerUtxos);
    const mintTxid = await provider.broadcast(mintBuilt.hex);
    expect(mintTxid).toBe(mintBuilt.txid);
    let contractToken: LicenseToken = mintBuilt.token;
    await waitUntilContractReady(provider, mintTxid, 120000);

    // Output 1's value and script hash, read back from the confirmed tx (not just the
    // locally built one): exactly MINT_FUEL, exactly Fuel(C) for this collection.
    const mintTx = Transaction.fromHex(await provider.getTransactionHex(mintTxid));
    const expectedFuelScript = await fuelLockingScript(chainConfig);
    expect(mintTx.outputs[1].satoshis).toBe(MINT_FUEL);
    expect(mintTx.outputs[1].lockingScript.toHex()).toBe(expectedFuelScript.toHex());

    // --- Write: holder A writes a record, spend-and-recreate to itself, with NO holder coin
    // — a License + Fuel token pays the write's fee from its own Fuel(C) at input 1, so no
    // feeUtxos are fetched or passed at all. ---
    const contractTs1 = new Date().toISOString();
    const writeBuilt = await buildContractTokenRecordTransaction({
      holderKey: harness.holderA.entry.wif,
      token: contractToken,
      payload: { text: `contract e2e write ${contractTs1}`, ts: contractTs1 },
      config: chainConfig,
      provider,
    });
    const writeTxid = await provider.broadcast(writeBuilt.hex);
    expect(writeTxid).toBe(writeBuilt.txid);
    contractToken = writeBuilt.token;
    await waitUntilContractReady(provider, writeTxid, 120000);

    expect(writeBuilt.transaction.inputs).toHaveLength(2);
    expect([writeBuilt.transaction.inputs[0].sourceTXID, writeBuilt.transaction.inputs[0].sourceOutputIndex]).toEqual([
      mintTxid,
      0,
    ]);
    expect([writeBuilt.transaction.inputs[1].sourceTXID, writeBuilt.transaction.inputs[1].sourceOutputIndex]).toEqual([
      mintTxid,
      1,
    ]);
    const writeFuelOutput = writeBuilt.transaction.outputs[1].satoshis ?? 0;
    expect(writeFuelOutput).toBeGreaterThanOrEqual(MINT_FUEL - FEE_CAP);
    const writeFeeSatoshis = feeOf(writeBuilt.transaction);

    // --- The Governor's four Fuel negatives, built against the write-stage token (still
    // holder A's) via buildContractSpendVariant — which does not verify its own result, so
    // the caller checks it and decides whether to broadcast — mirroring the unit tests'
    // Fuel negatives (tests/unit/bsv-license-contract-write.test.ts) against a real token. ---
    const holderAFeeUtxosForNegatives = (await provider.getUtxos(holderAAddress)).filter((u) => u.satoshis !== 1);
    const negativePayload = { text: 'invalid Fuel spend probe', ts: new Date().toISOString() };

    function fuelVariant(overrides: Partial<BuildContractSpendVariantParams>) {
      return buildContractSpendVariant({
        holderKey: harness.holderA.entry.wif,
        token: contractToken,
        feeUtxos: holderAFeeUtxosForNegatives,
        payload: negativePayload,
        config: chainConfig,
        provider,
        ...overrides,
      });
    }

    // 1) Under-conservation: output 1 keeps own − 2,001 sat, one under FEE_CAP's floor. The
    // License accepts any Fuel value, so only the Fuel fails — this is the one broadcast
    // below (built blind: buildContractSpendVariant sets fuelBlind whenever a Fuel override
    // is set, since Fuel's own TypeScript assertions would otherwise throw while building).
    const underConservation = await fuelVariant({ fuelOutputSatoshis: writeFuelOutput - FEE_CAP - 1 });
    const underConservationFuelResult = await verifyFuelInput(underConservation.transaction, 1);
    const underConservationLicenseResult = await verifyLicenseInput(underConservation.transaction, 0);
    console.log('negative (under-conservation, output 1 = own - 2,001) Fuel local verify:', JSON.stringify(underConservationFuelResult));
    expect(underConservationFuelResult.success).toBe(false);
    expect(underConservationLicenseResult.success).toBe(true);

    // 2) FB-1: input 0 is an ordinary P2PKH outpoint (the holder's own fee UTXO), not the
    // License — the Fuel's own prevouts[0] == (T, 0) check fails.
    const ordinaryInput0 = await fuelVariant({ ordinaryInput0: true });
    const ordinaryInput0Result = await verifyFuelInput(ordinaryInput0.transaction, 1);
    console.log('negative (FB-1, ordinary outpoint at input 0) Fuel local verify:', JSON.stringify(ordinaryInput0Result));
    expect(ordinaryInput0Result.success).toBe(false);

    // 3) Output 1 carries a different script: both covenants fail (Fuel's own hashOutputs
    // check, and the License's rule (f), hash256(output 1) == fuelScriptHash).
    const strangerScript = new P2PKH().lock(harness.holderB.address).toHex();
    const differentOutputScript = await fuelVariant({ fuelOutputScriptHex: strangerScript });
    const differentOutputScriptFuelResult = await verifyFuelInput(differentOutputScript.transaction, 1);
    const differentOutputScriptLicenseResult = await verifyLicenseInput(differentOutputScript.transaction, 0);
    console.log(
      'negative (output 1, a different script) Fuel local verify:',
      JSON.stringify(differentOutputScriptFuelResult),
      'License local verify:',
      JSON.stringify(differentOutputScriptLicenseResult),
    );
    expect(differentOutputScriptFuelResult.success).toBe(false);
    expect(differentOutputScriptLicenseResult.success).toBe(false);

    // 4) The Fuel at input 2, behind a funding input at 1, not input 1 — Fuel's own
    // "prevouts[1] == its own outpoint" check fails; the License (which only cares about
    // input 0) still verifies.
    const fuelAtInput2 = await fuelVariant({ fuelInputIndex: 2 });
    const fuelAtInput2Result = await verifyFuelInput(fuelAtInput2.transaction, 2);
    const fuelAtInput2LicenseResult = await verifyLicenseInput(fuelAtInput2.transaction, 0);
    console.log('negative (Fuel at input 2, not 1) Fuel local verify:', JSON.stringify(fuelAtInput2Result));
    expect(fuelAtInput2Result.success).toBe(false);
    expect(fuelAtInput2LicenseResult.success).toBe(true);

    // --- Broadcast exactly one (the under-conservation spend): everything about this
    // transaction — funding, layout, the License's own signature — is exactly as valid as
    // the real write above, so the node can only reject it because of Fuel(C)'s own value
    // rule (the Governor's Q3). ---
    let broadcastError: unknown;
    try {
      await provider.broadcast(underConservation.hex);
    } catch (error) {
      broadcastError = error;
    }
    expect(broadcastError).toBeInstanceOf(Error);
    const rejectionMessage = broadcastError instanceof Error ? broadcastError.message : String(broadcastError);
    console.log('attempted txid (under-conservation, rejected by the node):', underConservation.txid);
    console.log('node rejection text:', rejectionMessage);
    expect(rejectionMessage.length).toBeGreaterThan(0);

    // --- Transfer: holder A -> holder B. The rejected negative above never touched the
    // chain, so the write's outpoint is still there to spend; the transfer, like the write,
    // pays its fee from the Fuel it recreates, with no holder coin. ---
    const transferBuilt = await buildContractTransferTransaction({
      holderKey: harness.holderA.entry.wif,
      token: contractToken,
      toPubKey: holderBPubKeyHex,
      config: chainConfig,
      provider,
    });
    const transferTxid = await provider.broadcast(transferBuilt.hex);
    expect(transferTxid).toBe(transferBuilt.txid);
    contractToken = transferBuilt.token;
    await waitUntilContractReady(provider, transferTxid, 120000);
    const transferFeeSatoshis = feeOf(transferBuilt.transaction);

    // --- Measured sizes of the real write and transfer's Fuel input, for SIZES.md beside
    // the spec-comparison estimates: the Fuel unlocking script (input 1) on each, and the
    // write's full transaction size and the fee it actually paid. ---
    const writeFuelUnlockingBytes = writeBuilt.transaction.inputs[1].unlockingScript!.toBinary().length;
    const transferFuelUnlockingBytes = transferBuilt.transaction.inputs[1].unlockingScript!.toBinary().length;
    const writeFullSizeBytes = writeBuilt.transaction.toBinary().length;

    console.log('=== testnet Fuel-backed contract e2e result ===');
    console.log('mint txid:', mintTxid);
    console.log('write txid:', writeTxid);
    console.log('transfer txid:', transferTxid);
    console.log(
      'write inputs:',
      writeBuilt.transaction.inputs.map((input) => [input.sourceTXID, input.sourceOutputIndex]),
    );
    console.log('write output 1 (Fuel) satoshis:', writeFuelOutput);
    console.log('write fee paid (sat):', writeFeeSatoshis, 'transfer fee paid (sat):', transferFeeSatoshis);
    console.log(
      'measured Fuel unlocking sizes (real tx, bytes): write',
      writeFuelUnlockingBytes,
      'transfer',
      transferFuelUnlockingBytes,
    );
    console.log('write full tx size (bytes):', writeFullSizeBytes);
  }, 9 * 60 * 1000);
});
