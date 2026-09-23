// Drives the Fuel(C) covenant (src/bsv/contracts/fuel.ts) beside the License it rides with,
// through scrypt-ts's local verification: both committed artifacts are loaded (no compiler at
// test time), a spec §4.3 write is built around the two calls (License at input 0, Fuel at
// input 1, both created by the same source transaction), and each input is checked by
// scrypt-ts's own bsv script interpreter. No network: the source transaction is built here.
//
// scrypt-ts's bsv library is confined to src/bsv/contracts/ and the contract fixtures (eslint.config.js).

import { bsv, hash256, PubKey, Sig, SigHashPreimage, toByteString } from 'scrypt-ts';
import type { Artifact, ByteString } from 'scrypt-ts';
import { Fuel } from '../../../src/bsv/contracts/fuel';
import { License } from '../../../src/bsv/contracts/license';
import fuelArtifact from '../../../src/bsv/contracts/artifacts/fuel.json';
import licenseArtifact from '../../../src/bsv/contracts/artifacts/license.json';
import { dataScript } from './license-contract';
import keys from './license-contract-keys.json';

Fuel.loadArtifact(fuelArtifact as unknown as Artifact);
License.loadArtifact(licenseArtifact as unknown as Artifact);

const ownerKey = bsv.PrivateKey.fromWIF(keys.owner);
const strangerKey = bsv.PrivateKey.fromWIF(keys.stranger);

export const COLLECTION_ID: ByteString = toByteString('11'.repeat(32));

export const FUEL_IN_SATOSHIS = 100_000;

const SIGHASH_ALL_FORKID = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
const SIGHASH_SINGLE_FORKID = bsv.crypto.Signature.SIGHASH_SINGLE | bsv.crypto.Signature.SIGHASH_FORKID;

/** Fuel(C)'s FEE_CAP (spec §3.9), compiled into the artifact: the most one spend may burn. */
export const FEE_CAP = Number(Fuel.FEE_CAP);

/** The GorillaPool relay policy rate the spec cites for a write's cost (§3.9, §6): 100 sat/kB. */
export const FEE_RATE_SAT_PER_KB = 100;

/**
 * FEE_W: what one write actually costs, derived from a real write's measured serialized
 * size (below) at FEE_RATE_SAT_PER_KB — never typed in from the spec's ≈12.9 KB estimate.
 * Output satoshis fields are fixed-width, so this placeholder value does not move the size
 * the derivation measures (give or take a byte of DER noise in the License's ALL signature).
 */
const { sizes: measuredWrite } = await callFuel({ fuelOutSatoshis: FUEL_IN_SATOSHIS - 1 });
export const FEE_W = Math.ceil((measuredWrite.txBytes / 1000) * FEE_RATE_SAT_PER_KB);

export interface FuelScenario {
  /** Output 1's value; default own value − FEE_W. */
  fuelOutSatoshis?: number;
  /** What input 0 spends: the License created beside the Fuel (default), or an ordinary P2PKH outpoint. */
  input0?: 'same-tx-license' | 'p2pkh';
  /** Output 1's script: Fuel(C) itself (default), or a P2PKH. */
  output1?: 'fuel' | 'p2pkh';
  /** The Fuel's input index: 1 (default), or 2 behind a funding input at 1. */
  fuelInputIndex?: 1 | 2;
  /**
   * Blind only: hand the Fuel a forged prevouts list, the transaction's own with entry 0
   * replaced by (T, 0), instead of the one scrypt-ts fills in from the transaction.
   */
  forgePrevouts?: boolean;
}

export interface FuelCall {
  tx: bsv.Transaction;
  fuelInputIndex: number;
  /** Byte lengths: Fuel's locking script, its unlocking script, the prevouts it carries, input 0's unlocking script, the whole transaction. */
  sizes: { fuelLockingBytes: number; fuelUnlockingBytes: number; prevoutsBytes: number; licenseUnlockingBytes: number; txBytes: number };
}

/** Fuel(C)'s locking script for the test collection, as hex. */
export function fuelLockingScriptHex(): string {
  return new Fuel(COLLECTION_ID).lockingScript.toHex();
}

/** hash256 of that script: the fuelScriptHash a License of the test collection is minted with. */
export function fuelScriptHashHex(): string {
  return hash256(toByteString(fuelLockingScriptHex()));
}

function p2pkhScript(key: bsv.PrivateKey): bsv.Script {
  return bsv.Script.buildPublicKeyHashOut(key.toAddress());
}

function outpointInput(prevTxId: string, outputIndex: number): bsv.Transaction.Input {
  return new bsv.Transaction.Input({ prevTxId, outputIndex, script: bsv.Script.empty() });
}

/** The transaction's prevouts list with entry 0 replaced by (sourceTxId, 0). */
function forgedPrevouts(tx: bsv.Transaction, sourceTxId: string): ByteString {
  const license0 = Buffer.from(sourceTxId, 'hex').reverse().toString('hex') + '00000000';
  return toByteString(license0 + tx.prevouts().slice(72));
}

/**
 * The "blind" unlocking script: scrypt-ts serializes the call without running the
 * contract's TypeScript, as MethodCallOptions.exec: false does (see
 * src/bsv/contracts/bridge/license-bridge.ts), so the interpreter judges a broken call.
 */
function blindUnlock(contract: Fuel | License, tx: bsv.Transaction, inputIndex: number, method: string, args: unknown[]): bsv.Script {
  const delegated = contract as unknown as {
    to: { tx: bsv.Transaction; inputIndex: number };
    callDelegatedMethod: (methodName: string, ...args: unknown[]) => { publicMethodCall: { toScript: () => bsv.Script } };
  };
  delegated.to = { tx, inputIndex };
  // Passing a hidden argument (preimage, prevouts) explicitly stops scrypt-ts filling it in.
  return delegated.callDelegatedMethod(method, ...args).publicMethodCall.toScript();
}

/**
 * Builds a write per the scenario: [0] License (or a P2PKH), [1] Fuel (or a funding input,
 * the Fuel then at [2]); outputs [0] the License recreated, [1] Fuel(C) (or a P2PKH),
 * [2] a W Data output. With exec (the default) each contract's TypeScript runs first, the
 * Fuel's before the License's, and a broken rule rejects with its assert message; without
 * it the unlocking scripts are built blind, for the interpreter to judge; execFuel: false
 * builds only the Fuel's blind, so the License's TypeScript gets to judge the write.
 */
export async function callFuel(
  scenario: FuelScenario = {},
  { exec = true, execFuel = exec }: { exec?: boolean; execFuel?: boolean } = {},
): Promise<FuelCall> {
  const fuel = new Fuel(COLLECTION_ID);
  const fuelScript: ByteString = toByteString(fuel.lockingScript.toHex());
  const license = new License(COLLECTION_ID, hash256(fuelScript), PubKey(ownerKey.publicKey.toHex()));

  // T: the transaction that created both, License at 0 and Fuel at 1 (spec §4.3 layout).
  const source = new bsv.Transaction()
    .addInput(outpointInput('aa'.repeat(32), 0), p2pkhScript(ownerKey), FUEL_IN_SATOSHIS + 10_000)
    .addOutput(new bsv.Transaction.Output({ script: license.lockingScript, satoshis: 1 }))
    .addOutput(new bsv.Transaction.Output({ script: fuel.lockingScript, satoshis: FUEL_IN_SATOSHIS }));
  const sourceTxId = source.id;

  const licenseInput = (scenario.input0 ?? 'same-tx-license') === 'same-tx-license';
  const fuelInputIndex = scenario.fuelInputIndex ?? 1;
  const fuelOutSatoshis = scenario.fuelOutSatoshis ?? FUEL_IN_SATOSHIS - FEE_W;
  const output1Script = (scenario.output1 ?? 'fuel') === 'fuel' ? fuel.lockingScript : p2pkhScript(strangerKey);
  const data = dataScript('W');

  const tx = new bsv.Transaction();
  if (licenseInput) tx.addInput(outpointInput(sourceTxId, 0), license.lockingScript, 1);
  else tx.addInput(outpointInput('dd'.repeat(32), 0), p2pkhScript(ownerKey), 5_000);
  if (fuelInputIndex === 2) tx.addInput(outpointInput('cc'.repeat(32), 0), p2pkhScript(ownerKey), 5_000);
  tx.addInput(outpointInput(sourceTxId, 1), fuel.lockingScript, FUEL_IN_SATOSHIS);
  tx.addOutput(new bsv.Transaction.Output({ script: license.next().lockingScript, satoshis: 1 }));
  tx.addOutput(new bsv.Transaction.Output({ script: output1Script, satoshis: fuelOutSatoshis }));
  tx.addOutput(new bsv.Transaction.Output({ script: bsv.Script.fromHex(data), satoshis: 0 }));

  const fuelValue = BigInt(fuelOutSatoshis);
  const fuelUnlock = execFuel
    ? await fuel.getUnlockingScript((self) => {
        self.to = { tx, inputIndex: fuelInputIndex };
        self.spend(fuelValue);
      })
    : blindUnlock(fuel, tx, fuelInputIndex, 'spend', scenario.forgePrevouts
        ? [fuelValue, SigHashPreimage(tx.getPreimage(fuelInputIndex, SIGHASH_SINGLE_FORKID)), forgedPrevouts(tx, sourceTxId)]
        : [fuelValue]);
  tx.inputs[fuelInputIndex].setScript(fuelUnlock);

  if (licenseInput) {
    // The License's ALL preimage covers the outpoints and outputs, not the Fuel's unlocking script.
    const sig = Sig(toByteString(tx.getSignature(0, ownerKey, SIGHASH_ALL_FORKID) as string));
    const output1: ByteString = toByteString(output1Script.toHex());
    const licenseUnlock = exec
      ? await license.getUnlockingScript((self) => {
          self.to = { tx, inputIndex: 0 };
          self.write(sig, output1, fuelValue, data);
        })
      : blindUnlock(license, tx, 0, 'write', [sig, output1, fuelValue, data]);
    tx.inputs[0].setScript(licenseUnlock);
  }

  return {
    tx,
    fuelInputIndex,
    sizes: {
      fuelLockingBytes: fuel.lockingScript.toBuffer().length,
      fuelUnlockingBytes: tx.inputs[fuelInputIndex].script.toBuffer().length,
      prevoutsBytes: tx.prevouts().length / 2,
      licenseUnlockingBytes: tx.inputs[0].script.toBuffer().length,
      txBytes: tx.toBuffer().length,
    },
  };
}

/** Runs one input's unlocking script against the locking script it spends. */
export function verifyInput(call: FuelCall, inputIndex: number): { success: boolean; error: string } {
  const { success, error } = call.tx.verifyScript(inputIndex);
  return { success, error };
}
