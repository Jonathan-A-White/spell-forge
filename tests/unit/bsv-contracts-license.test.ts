// The License covenant, spec v0.13 §3.7 rules (a)-(f) (mw-5wuz6.2). Each call is checked
// twice: the contract's TypeScript (a broken rule rejects with its assert message), then
// the compiled script from the committed artifact, run by scrypt-ts's bsv interpreter
// (a broken rule fails verification). No network, no compiler.
import { describe, it, expect } from 'vitest';
import { callLicense, verifyInput0 } from '../fixtures/bsv/license-contract';
import type { LicenseScenario } from '../fixtures/bsv/license-contract';

// Rules (b) and (c) are enforced by the exact output list output 0 is rebuilt into.
const LAYOUT = 'rules (b), (c), (f): outputs are exactly itself at 1 sat, Fuel, Data';

async function expectRefused(scenario: LicenseScenario, assertMessage: string): Promise<void> {
  await expect(callLicense(scenario)).rejects.toThrow(assertMessage);
  const blind = await callLicense(scenario, { exec: false });
  expect(verifyInput0(blind)).toEqual({ success: false, error: expect.stringContaining('SCRIPT_ERR') });
}

describe('License covenant (spec §3.7)', () => {
  it('verifies a write: [0] itself, [1] Fuel, [2] a W Data output, with a funding input at index 1', async () => {
    const call = await callLicense({ method: 'write' });
    expect(call.tx.inputs).toHaveLength(2);
    expect(call.tx.outputs).toHaveLength(3);
    expect(verifyInput0(call)).toEqual({ success: true, error: '' });
    // Recorded in src/bsv/contracts/SIZES.md: update it when these move.
    expect(call.sizes).toEqual({ lockingBytes: 4307, unlockingBytes: 6012, dataScriptBytes: 216, fuelScriptBytes: 1171 });
  });

  it('verifies a transfer to a new owner key, with a TR Data output and payment and change after it', async () => {
    const call = await callLicense({ method: 'transfer' });
    expect(call.tx.inputs).toHaveLength(3);
    expect(call.tx.outputs).toHaveLength(5);
    expect(verifyInput0(call)).toEqual({ success: true, error: '' });
    expect(call.sizes).toEqual({ lockingBytes: 4307, unlockingBytes: 6153, dataScriptBytes: 217, fuelScriptBytes: 1171 });
  });

  it('refuses a write with four outputs (rule f)', async () => {
    await expectRefused({ method: 'write', extraOutputs: 1 }, LAYOUT);
  });

  it('refuses a write that swaps the owner key (rule c)', async () => {
    await expectRefused({ method: 'write', output0Owner: 'buyer' }, LAYOUT);
  });

  it('refuses output 0 holding 2 satoshis (rule b)', async () => {
    await expectRefused({ method: 'write', output0Satoshis: 2 }, LAYOUT);
  });

  it('refuses a signature by a key that is not the owner (rule d)', async () => {
    // scrypt-ts's own checkSig throws before the assert's message is reached.
    await expectRefused({ method: 'write', signer: 'stranger' }, 'signature check failed');
  });

  it('refuses an owner signature without the SIGHASH_ALL|FORKID flag (rule e)', async () => {
    await expectRefused({ method: 'write', sigHashType: 'ANYONECANPAY_ALL' }, 'rule (e): signature flag is ALL|FORKID');
  });

  it('refuses a write whose Data output is a TR record, and a transfer whose Data output is a W record (rules c, f)', async () => {
    await expectRefused({ method: 'write', recordType: 'TR' }, 'rule (f): output 2 is a W Data output');
    await expectRefused({ method: 'transfer', recordType: 'W' }, 'rule (c): a transfer carries a TR Data output');
  });
});
