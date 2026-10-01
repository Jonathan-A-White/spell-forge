// tests/testnet/gated-reading.testnet.test.ts — On-demand testnet e2e for gated reading
// (mw-jeswf.4): the issuer mints a License + Fuel token to holderA whose M record wraps k(0)
// to holderA's wrap key, holderA writes one W encrypted under k(0), and then, reading only
// the chain through a fresh provider, holderA's wrap key opens the W and holderB's cannot.
// k(0) itself must appear in neither transaction's hex; the test holds it only by unwrapping
// the M record's wrap as holderA.
//
// NOT part of `npm test` or `npm run test:bsv` — run by hand with `npm run test:bsv:testnet`
// (vitest.testnet.config.ts), against the REAL WhatsOnChain testnet API with the funded
// harness keys (~/.config/spell-forge/bsv-testnet-keys.json, or $SPELLFORGE_BSV_KEYS).
// Costs one MINT_FUEL (10,000 sat, locked in the token's Fuel) plus a few satoshis of fees
// from the issuer; holderA's write pays its fee from that Fuel. Each step is waited out by
// polling WhatsOnChain for the transaction, not for a block.
//
// Fails fast, rather than skipping, when the harness key file is missing, any of the three
// addresses has a zero balance, or the issuer cannot pay MINT_FUEL.

import { describe, it, expect } from 'vitest';
import { PrivateKey, Transaction, Utils } from '@bsv/sdk';
import { createChainProvider } from '../../src/bsv/chain-provider';
import { chainConfig } from '../../src/bsv/config';
import { buildContractMintTransaction, buildContractTokenRecordTransaction } from '../../src/bsv/license-contract';
import { findTypedRecordsInTransaction } from '../../src/bsv/record';
import { decodeMintRecord, deriveStandInWrapKeyPair, fetchTokenWraps, readGatedWrite } from '../../src/bsv/gated-records';
import { epochCommitment, unwrapEpochKey } from '../../src/bsv/epoch-crypto';
import {
  getSpendableUtxos,
  requireFundedHarness,
  waitForTransactionHex,
  withPacing,
} from '../../src/bsv/node/testnet-e2e-helpers';

/** The License's Data output: output 2 of the mint and of every spend (rule (f)). */
const DATA_OUTPUT_INDEX = 2;

/** Total input satoshis minus total output satoshis — the miner fee a signed transaction actually paid. */
function feeOf(transaction: Transaction): number {
  const inputTotal = transaction.inputs.reduce(
    (sum, input) => sum + (input.sourceTransaction?.outputs[input.sourceOutputIndex]?.satoshis ?? 0),
    0,
  );
  const outputTotal = transaction.outputs.reduce((sum, output) => sum + (output.satoshis ?? 0), 0);
  return inputTotal - outputTotal;
}

function hexOf(bytes: Uint8Array | number[]): string {
  return Utils.toHex(Array.from(bytes));
}

describe('testnet gated reading e2e', () => {
  it('mints a License + Fuel token to holderA with a wrap of k(0), holderA writes an encrypted W; read from the chain, holderA gets the text and holderB "cannot read", and k(0) is in neither transaction', async () => {
    const provider = withPacing(createChainProvider(chainConfig));
    const harness = await requireFundedHarness(provider);
    const mintFuel = chainConfig.mintFuelSatoshis ?? 0;

    // The issuer pays MINT_FUEL plus the mint's fee (a few sat at this app's 1 sat/kB).
    const issuerUtxos = await getSpendableUtxos(provider, harness.issuer.address);
    const issuerSpendable = issuerUtxos.reduce((sum, u) => sum + u.satoshis, 0);
    const mintMargin = 100;
    if (issuerSpendable < mintFuel + mintMargin) {
      throw new Error(
        `Harness key 'issuer' (${harness.issuer.address}) has ${issuerSpendable} sat spendable; a License + Fuel mint needs ` +
          `${mintFuel} (MINT_FUEL) plus fees — fund it with at least ${mintFuel + mintMargin - issuerSpendable} sat more.`,
      );
    }

    const holderAWrap = await deriveStandInWrapKeyPair(harness.holderA.entry.wif);
    const holderBWrap = await deriveStandInWrapKeyPair(harness.holderB.entry.wif);
    const holderAPubKeyHex = PrivateKey.fromWif(harness.holderA.entry.wif).toPublicKey().toString();

    // --- Mint: issuer -> holderA, the M record wrapping a fresh k(0) to holderA's wrap key. ---
    const mintBuilt = await buildContractMintTransaction({
      issuerKey: harness.issuer.entry.wif,
      utxos: issuerUtxos,
      holderPubKey: holderAPubKeyHex,
      holderWrapPubKey: holderAWrap.publicKey,
      mintFuelSatoshis: mintFuel,
      config: chainConfig,
      provider,
    });
    const mintTxid = await provider.broadcast(mintBuilt.hex);
    expect(mintTxid).toBe(mintBuilt.txid);
    await waitForTransactionHex(provider, mintTxid, 3000, 120000);

    // --- Write: holderA writes one W with a known text, encrypted under k(0); the fee comes from the Fuel. ---
    const ts = new Date().toISOString();
    const text = `gated e2e write ${ts}`;
    const writeBuilt = await buildContractTokenRecordTransaction({
      holderKey: harness.holderA.entry.wif,
      token: mintBuilt.token,
      payload: { text, ts },
      wrapPrivateKey: holderAWrap.privateKey,
      config: chainConfig,
      provider,
    });
    const writeTxid = await provider.broadcast(writeBuilt.hex);
    expect(writeTxid).toBe(writeBuilt.txid);
    await waitForTransactionHex(provider, writeTxid, 3000, 120000);

    // --- Read back through a fresh provider: nothing from the builders above, only the chain. ---
    const chain = withPacing(createChainProvider(chainConfig));
    const mintHex = await chain.getTransactionHex(mintTxid);
    const writeHex = await chain.getTransactionHex(writeTxid);
    const writeRecord = findTypedRecordsInTransaction(writeHex).find(
      (record) => record.vout === DATA_OUTPUT_INDEX && record.recordType === 'W',
    );
    if (!writeRecord) throw new Error(`The write ${writeTxid} carries no W record at output ${DATA_OUTPUT_INDEX}`);
    const wraps = await fetchTokenWraps(mintBuilt.token.origin, chain);
    expect(wraps).toHaveLength(1);
    expect(hexOf(wraps[0].publicKey)).toBe(hexOf(holderAWrap.publicKey));

    const holderARead = await readGatedWrite({ record: writeRecord, wraps, wrapPrivateKey: holderAWrap.privateKey });
    const holderBRead = await readGatedWrite({ record: writeRecord, wraps, wrapPrivateKey: holderBWrap.privateKey });

    // k(0), held only by unwrapping the chain's M record as holderA; its c(0) must be the
    // record's (unwrapEpochKey checks it), and its bytes appear in neither transaction.
    const mintRecord = decodeMintRecord(mintHex);
    if (!mintRecord?.wrap || !mintRecord.commitment) throw new Error(`The mint ${mintTxid} carries no gated M record`);
    const epochKey = await unwrapEpochKey(mintRecord.wrap, holderAWrap.privateKey, mintRecord.commitment);
    const epochKeyHex = hexOf(epochKey);
    const textHex = hexOf(Utils.toArray(text, 'utf8'));
    expect(hexOf(await epochCommitment(epochKey))).toBe(hexOf(writeRecord.commitment ?? []));
    const epochKeyInMint = mintHex.toLowerCase().includes(epochKeyHex);
    const epochKeyInWrite = writeHex.toLowerCase().includes(epochKeyHex);
    epochKey.fill(0);

    // --- Sizes and fee, for SIZES.md. ---
    const mintTx = Transaction.fromHex(mintHex);
    const writeTx = Transaction.fromHex(writeHex);
    const mDataBytes = mintTx.outputs[DATA_OUTPUT_INDEX].lockingScript.toBinary().length;
    const wDataBytes = writeTx.outputs[DATA_OUTPUT_INDEX].lockingScript.toBinary().length;
    const writeSizeBytes = writeTx.toBinary().length;
    const writeFeeSatoshis = feeOf(writeBuilt.transaction);
    const mintFeeSatoshis = feeOf(mintBuilt.transaction);

    console.log('=== testnet gated reading e2e result ===');
    console.log('mint txid:', mintTxid);
    console.log('write txid:', writeTxid);
    console.log('holderA read:', JSON.stringify(holderARead));
    console.log('holderB read:', JSON.stringify(holderBRead));
    console.log('k(0) in mint chain hex:', epochKeyInMint, '| k(0) in write chain hex:', epochKeyInWrite);
    console.log('text in write chain hex:', writeHex.includes(textHex));
    console.log('gated M Data output (bytes):', mDataBytes, '| gated W Data output (bytes):', wDataBytes);
    console.log('mint tx size (bytes):', mintTx.toBinary().length, '| mint fee paid (sat):', mintFeeSatoshis);
    console.log('write tx size (bytes):', writeSizeBytes, '| write fee paid (sat):', writeFeeSatoshis);
    console.log('write output 1 (Fuel) satoshis:', writeTx.outputs[1].satoshis);

    expect(holderARead).toEqual({ readable: true, encrypted: true, text, ts });
    expect(holderBRead.readable).toBe(false);
    if (!holderBRead.readable) expect(holderBRead.message.startsWith('cannot read')).toBe(true);
    expect(epochKeyInMint).toBe(false);
    expect(epochKeyInWrite).toBe(false);
    expect(writeHex).not.toContain(textHex);
    expect(writeFeeSatoshis).toBeGreaterThan(0);
  }, 6 * 60 * 1000);
});
