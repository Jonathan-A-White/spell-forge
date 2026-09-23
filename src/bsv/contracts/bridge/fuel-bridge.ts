// The scrypt-ts side of the Fuel(C) covenant for the contract-locked builders (mw-yo97u.3),
// in the shape of license-bridge.ts: @bsv/sdk builds the transaction (src/bsv/license-contract.ts);
// this module only makes Fuel(C)'s locking script and the Fuel input's unlocking script from
// the committed artifact. Loaded lazily (import.meta.glob), never by the app's tsc.

import { bsv, toByteString } from 'scrypt-ts';
import type { Artifact } from 'scrypt-ts';
import { Fuel } from '../fuel';
import artifact from '../artifacts/fuel.json';
import { toBsvTransaction, verifyInput } from './bsv-transaction';
import type { FuelBridge, FuelUnlockParams } from './fuel-bridge-types';

Fuel.loadArtifact(artifact as unknown as Artifact);

const SIGHASH_SINGLE_FORKID = bsv.crypto.Signature.SIGHASH_SINGLE | bsv.crypto.Signature.SIGHASH_FORKID;

function fuelAt(lockingScriptHex: string): Fuel {
  let fuel: Fuel;
  try {
    fuel = Fuel.fromLockingScript(lockingScriptHex) as Fuel;
  } catch (error) {
    throw new Error(`Not a Fuel locking script of artifact ${artifact.md5}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (fuel.lockingScript.toHex() !== lockingScriptHex) {
    throw new Error(`Not a Fuel locking script of artifact ${artifact.md5}`);
  }
  return fuel;
}

function unlockingScript(params: FuelUnlockParams): string {
  const { tx, inputIndex, sourceLockingScriptHex, sourceSatoshis, preimageHex, fuelValue, blind } = params;

  // Only the Fuel's own source output enters its preimage.
  const bsvTx = toBsvTransaction(tx, { [inputIndex]: { scriptHex: sourceLockingScriptHex, satoshis: sourceSatoshis } });
  const ownPreimageHex = bsvTx.getPreimage(inputIndex, SIGHASH_SINGLE_FORKID);
  if (ownPreimageHex !== preimageHex) {
    throw new Error('Sighash preimage mismatch: the preimage @bsv/sdk formatted is not the one the Fuel checks');
  }

  const fuel = fuelAt(sourceLockingScriptHex);
  const value = BigInt(fuelValue);
  if (blind) {
    // As license-bridge.ts's blind path: serialize the call without running Fuel.spend's
    // assertions, so a deliberately broken spend still yields a script to reject.
    const delegated = fuel as unknown as {
      to: { tx: bsv.Transaction; inputIndex: number };
      callDelegatedMethod: (methodName: string, ...args: unknown[]) => { publicMethodCall: { toScript: () => bsv.Script } };
    };
    delegated.to = { tx: bsvTx, inputIndex };
    return delegated.callDelegatedMethod('spend', value).publicMethodCall.toScript().toHex();
  }

  const script = fuel.getUnlockingScript((self) => {
    self.to = { tx: bsvTx, inputIndex };
    self.spend(value);
  });
  return script.toHex();
}

export const fuelBridge: FuelBridge = {
  artifactVersion: artifact.md5,
  feeCapSatoshis: Number(Fuel.FEE_CAP),
  lockingScript: (collectionIdHex) => new Fuel(toByteString(collectionIdHex)).lockingScript.toHex(),
  unlockingScript,
  verifyInput,
};
