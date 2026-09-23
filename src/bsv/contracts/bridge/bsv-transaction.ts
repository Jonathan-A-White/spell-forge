// What the License and Fuel bridges share (mw-yo97u.3): turning the builders' plain
// BridgeTransaction into scrypt-ts's bsv transaction, and running one input through scrypt-ts's
// script interpreter. scrypt-ts side only: loaded with the bridges, never by the app's tsc.

import { bsv } from 'scrypt-ts';
import type { BridgeTransaction, LicenseVerifyResult } from './license-bridge-types';

/** The source output of an input whose preimage the bridge rebuilds. */
export interface BridgeSourceOutput {
  scriptHex: string;
  satoshis: number;
}

/**
 * The transaction as scrypt-ts's bsv sees it. Only the inputs in `sources` carry their source
 * output (the ones whose preimage is rebuilt); the others need an outpoint and a sequence.
 */
export function toBsvTransaction(tx: BridgeTransaction, sources: Record<number, BridgeSourceOutput>): bsv.Transaction {
  // bsv's typings omit `version`, which its Transaction has and serializes.
  const bsvTx = new bsv.Transaction() as bsv.Transaction & { version: number };
  bsvTx.version = tx.version;
  bsvTx.nLockTime = tx.lockTime;
  tx.inputs.forEach((input, index) => {
    const bsvInput = new bsv.Transaction.Input({
      prevTxId: input.txid,
      outputIndex: input.vout,
      script: bsv.Script.empty(),
      sequenceNumber: input.sequence,
    });
    const source = sources[index];
    if (source) {
      bsvTx.addInput(bsvInput, bsv.Script.fromHex(source.scriptHex), source.satoshis);
    } else {
      bsvTx.addInput(bsvInput, bsv.Script.empty(), 0);
    }
  });
  for (const output of tx.outputs) {
    bsvTx.addOutput(new bsv.Transaction.Output({ script: bsv.Script.fromHex(output.scriptHex), satoshis: output.satoshis }));
  }
  return bsvTx;
}

/** Runs one input's unlocking script against its source locking script in scrypt-ts's interpreter. */
export function verifyInput(txHex: string, inputIndex: number, sourceLockingScriptHex: string, sourceSatoshis: number): LicenseVerifyResult {
  const bsvTx = new bsv.Transaction(txHex);
  bsvTx.inputs[inputIndex].output = new bsv.Transaction.Output({
    script: bsv.Script.fromHex(sourceLockingScriptHex),
    satoshis: sourceSatoshis,
  });
  const { success, error } = bsvTx.verifyScript(inputIndex);
  return { success, error };
}
