// The interface between the contract-locked builders (src/bsv/license-contract.ts) and the
// Fuel(C) side of scrypt-ts (fuel-bridge.ts), in raw hex only (mw-yo97u.3), in the shape of
// license-bridge-types.ts. Plain types: the app's tsc reads this file, never fuel-bridge.ts.

import type { BridgeTransaction, LicenseVerifyResult } from './license-bridge-types';

export interface FuelUnlockParams {
  tx: BridgeTransaction;
  /** The Fuel's input: 1 in every spend the builders mean to succeed. */
  inputIndex: number;
  /** The Fuel(C) output being spent. */
  sourceLockingScriptHex: string;
  sourceSatoshis: number;
  /** The SIGHASH_SINGLE|FORKID preimage of the Fuel's input that @bsv/sdk formatted; the bridge refuses one that differs from its own. */
  preimageHex: string;
  /** spend's `fuelValue`: output 1's satoshis. */
  fuelValue: number;
  /** Skips the contract's own TypeScript assertions while building the script, as LicenseUnlockParams.blind does. */
  blind?: boolean;
}

export interface FuelBridge {
  /** The committed Fuel artifact's md5, recorded on every License + Fuel token as `fuelArtifact`. */
  artifactVersion: string;
  /** Fuel.FEE_CAP (spec §3.9), compiled into the artifact: the most one spend may burn. */
  feeCapSatoshis: number;
  /** Fuel(C)'s locking script for a collection: the same on every hop. */
  lockingScript(collectionIdHex: string): string;
  /**
   * The Fuel input's unlocking script: `spend(fuelValue)` plus the hidden Push TX preimage
   * (SIGHASH_SINGLE|FORKID) and the serialised prevouts list scrypt-ts fills in from tx.
   */
  unlockingScript(params: FuelUnlockParams): string;
  /** Runs one input's unlocking script against its source locking script in scrypt-ts's interpreter. */
  verifyInput(txHex: string, inputIndex: number, sourceLockingScriptHex: string, sourceSatoshis: number): LicenseVerifyResult;
}

export interface FuelBridgeModule {
  fuelBridge: FuelBridge;
}
