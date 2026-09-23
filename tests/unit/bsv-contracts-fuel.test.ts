// The Fuel(C) covenant, spec v0.13 §3.2/§3.7 `spend` (mw-yo97u.2), spent beside the License
// in a §4.3 write. Each call is checked twice: the contract's TypeScript (a broken rule
// rejects with its assert message), then the compiled script from the committed artifact,
// run by scrypt-ts's bsv interpreter (a broken rule fails verification). No network, no compiler.
// The happy spend and the under-conservation, FB-1, wrong-output-1-script and Fuel-at-input-2
// negatives are covered by tests/features/bsv/fuel-covenant.feature instead.
import { describe, it, expect } from 'vitest';
import { callFuel, fuelLockingScriptHex, fuelScriptHashHex, verifyInput } from '../fixtures/bsv/fuel-contract';

const REFUSED = { success: false, error: expect.stringContaining('SCRIPT_ERR') };

describe('Fuel(C) covenant, spend (spec §3.7)', () => {
  it('has one script per collection, embedding only the collection id: its hash is what a License of that collection pins', () => {
    const script = fuelLockingScriptHex();
    expect(script).toContain('20' + '11'.repeat(32));
    expect(fuelScriptHashHex()).toBe('7ba46c59bfc88ef4f8be195a548f4a308425e068ae3596b3018861154d92413e');
  });

  it('refuses a forged prevouts list claiming the License at input 0: hash256(prevouts) must equal hashPrevouts', async () => {
    // Blind only: the contract's TypeScript never sees a prevouts list other than the transaction's.
    // Control: passed the same way, a list that is the transaction's own verifies.
    const control = await callFuel({ forgePrevouts: true }, { exec: false });
    expect(verifyInput(control, 1)).toEqual({ success: true, error: '' });
    const forged = await callFuel({ input0: 'p2pkh', forgePrevouts: true }, { exec: false });
    expect(verifyInput(forged, 1)).toEqual(REFUSED);
  });
});
