// tests/features/steps/fuel-covenant.steps.ts — Reusable step bodies for
// tests/features/bsv/fuel-covenant.feature, wired in tests/features/bsv/fuel-covenant.test.ts.
// Each function calls straight into the same builders tests/unit/bsv-contracts-fuel.test.ts
// uses (no logic beyond that): callFuel to build and run the contract's own TypeScript (a
// broken rule throws), then again blind (exec: false) against the compiled artifact via
// scrypt-ts's bsv interpreter (a broken rule fails verification) — exactly like that test's
// expectFuelRefused helper.
import { expect } from 'vitest';
import { callFuel, FEE_W, FUEL_IN_SATOSHIS, verifyInput } from '../../fixtures/bsv/fuel-contract';
import type { FuelCall, FuelScenario } from '../../fixtures/bsv/fuel-contract';

export interface FuelSpendContext {
  scenario?: FuelScenario;
  call?: FuelCall;
  execError?: unknown;
  blindResult?: { success: boolean; error: string };
}

export function givenScenario(ctx: FuelSpendContext, scenario: FuelScenario): void {
  ctx.scenario = scenario;
}

export async function whenFuelSpendIsAttempted(ctx: FuelSpendContext): Promise<void> {
  const scenario = ctx.scenario as FuelScenario;
  try {
    ctx.call = await callFuel(scenario);
  } catch (error) {
    ctx.execError = error;
  }
  const blind = await callFuel(scenario, { exec: false });
  ctx.blindResult = verifyInput(blind, blind.fuelInputIndex);
}

export function thenAccepted(ctx: FuelSpendContext): void {
  expect(ctx.execError).toBeUndefined();
  expect(ctx.blindResult).toEqual({ success: true, error: '' });
}

export function thenMatchesRecordedLayoutAndSizes(ctx: FuelSpendContext): void {
  const call = ctx.call as FuelCall;
  expect(call.tx.inputs).toHaveLength(2);
  expect(call.tx.outputs).toHaveLength(3);
  expect(call.tx.outputs[1].satoshis).toBe(FUEL_IN_SATOSHIS - FEE_W);
  expect(verifyInput(call, 1)).toEqual({ success: true, error: '' });
  expect(verifyInput(call, 0)).toEqual({ success: true, error: '' });
  // Recorded in src/bsv/contracts/SIZES.md: update it when these move.
  expect(call.sizes).toEqual({
    fuelLockingBytes: 1204,
    fuelUnlockingBytes: 1443,
    prevoutsBytes: 72,
    licenseUnlockingBytes: 6044,
    txBytes: 13341,
  });
}

export function thenRejected(ctx: FuelSpendContext, assertMessage: string): void {
  expect(ctx.execError).toBeInstanceOf(Error);
  expect((ctx.execError as Error).message).toContain(assertMessage);
  expect(ctx.blindResult).toEqual({ success: false, error: expect.stringContaining('SCRIPT_ERR') });
}

export async function thenLicenseAlsoRefusesRuleF(ctx: FuelSpendContext): Promise<void> {
  const scenario = ctx.scenario as FuelScenario;
  await expect(callFuel(scenario, { execFuel: false })).rejects.toThrow('rule (f): output 1 is Fuel(C)');
}
