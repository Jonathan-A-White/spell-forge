// src/bsv/fuel-status.ts — A License-locked token's live Fuel(C) value and the writes-left
// range it implies (mw-yo97u.4). The value is always read from the chain through the
// provider — output 1 of the token's LATEST transaction — never a stored number. Kept free
// of the scrypt-ts bridges (license-contract.ts's import.meta.glob, Vite-only) so
// scripts/bsv-balance.ts can import this module directly under plain tsx.

import { Transaction } from '@bsv/sdk';
import type { ChainProvider } from './chain-provider';

/** Fuel(C) is always output 1 of the transaction that made it (license-contract.ts's FUEL_INDEX). */
const FUEL_OUTPUT_INDEX = 1;

/** new P2PKH().lock(address) is always exactly this many bytes (OP_DUP OP_HASH160 <20> OP_EQUALVERIFY
 * OP_CHECKSIG); a real Fuel(C) locking script is far longer (1,204 B measured, SIZES.md), so output
 * 1's script length alone tells a step 2 token's P2PKH stand-in apart from a real Fuel(C). */
const STAND_IN_SCRIPT_LENGTH = 25;

export type FuelValue = { kind: 'stand-in' } | { kind: 'fuel'; satoshis: number };

/**
 * Reads txid's output 1 through the provider and classifies it: 'stand-in' for a step 2
 * token's P2PKH stand-in, or the Fuel's live satoshis.
 */
export async function readFuelValue(txid: string, provider: ChainProvider): Promise<FuelValue> {
  const hex = await provider.getTransactionHex(txid);
  const transaction = Transaction.fromHex(hex);
  const output = transaction.outputs[FUEL_OUTPUT_INDEX];
  if (!output || output.satoshis === undefined) {
    throw new Error(`Output ${FUEL_OUTPUT_INDEX} of ${txid} is not a Fuel or stand-in output`);
  }
  if (output.lockingScript.toBinary().length === STAND_IN_SCRIPT_LENGTH) {
    return { kind: 'stand-in' };
  }
  return { kind: 'fuel', satoshis: output.satoshis };
}

/**
 * Fuel.FEE_CAP (contracts/fuel.ts, spec §3.9): the most one spend may burn from the Fuel.
 * Duplicated here (rather than read from the compiled artifact via the lazy fuel bridge) so
 * this module needs no scrypt-ts toolchain.
 */
export const FEE_CAP_SATOSHIS = 2000;

/**
 * The whole License + Fuel write's measured size (SIZES.md, Fuel(C) §: "The whole License +
 * Fuel write, 200-byte payload"), used for the at-rate writes-left estimate.
 */
export const MEASURED_WRITE_SIZE_BYTES = 13341;

export interface WritesLeftRange {
  /** fuel ÷ FEE_CAP: at least this many writes, even if every one burns the full cap. */
  floor: number;
  /** fuel ÷ (MEASURED_WRITE_SIZE_BYTES's fee at feeRateSatPerKb): about this many at the configured rate. */
  estimate: number;
}

/** Mirrors @bsv/sdk's SatoshisPerKilobyte: ceil(size / 1000 * rate). */
export function writesLeftRange(fuelSatoshis: number, feeRateSatPerKb: number): WritesLeftRange {
  const feePerWrite = Math.ceil((MEASURED_WRITE_SIZE_BYTES / 1000) * feeRateSatPerKb);
  return {
    floor: Math.floor(fuelSatoshis / FEE_CAP_SATOSHIS),
    estimate: Math.floor(fuelSatoshis / feePerWrite),
  };
}

export function formatWritesLeftRange(range: WritesLeftRange): string {
  return `>= ${range.floor} writes at cap, ~ ${range.estimate} at the current rate`;
}
