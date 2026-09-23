// tests/features/steps/license-covenant.steps.ts — Reusable step bodies for
// tests/features/bsv/license-covenant.feature, wired in
// tests/features/bsv/license-covenant.test.ts. Each function calls straight into the
// same builders tests/unit/bsv-contracts-license.test.ts uses (no logic beyond that):
// callLicense to build and run the contract's own TypeScript (a broken rule throws),
// then again blind (exec: false) against the compiled artifact via scrypt-ts's bsv
// interpreter (a broken rule fails verification) — exactly like that test's
// expectRefused helper.
import { expect } from 'vitest';
import { callLicense, verifyInput0 } from '../../fixtures/bsv/license-contract';
import type { LicenseScenario } from '../../fixtures/bsv/license-contract';

export interface LicenseSpendContext {
  scenario?: LicenseScenario;
  execError?: unknown;
  blindResult?: { success: boolean; error: string };
}

export function givenScenario(ctx: LicenseSpendContext, scenario: LicenseScenario): void {
  ctx.scenario = scenario;
}

export async function whenSpendIsAttempted(ctx: LicenseSpendContext): Promise<void> {
  const scenario = ctx.scenario as LicenseScenario;
  try {
    await callLicense(scenario);
  } catch (error) {
    ctx.execError = error;
  }
  const blind = await callLicense(scenario, { exec: false });
  ctx.blindResult = verifyInput0(blind);
}

export function thenAccepted(ctx: LicenseSpendContext): void {
  expect(ctx.execError).toBeUndefined();
  expect(ctx.blindResult).toEqual({ success: true, error: '' });
}

export function thenRejected(ctx: LicenseSpendContext): void {
  expect(ctx.execError).toBeInstanceOf(Error);
  expect(ctx.blindResult?.success).toBe(false);
}
