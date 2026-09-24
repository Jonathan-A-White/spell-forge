// The License bridge (src/bsv/contracts/bridge/license-bridge.ts) is loaded lazily by
// license-contract.ts's loadLicenseBridge; evaluating it pulls in scrypt-ts -> scryptlib,
// which requires rimraf, which reads `process.platform` at module top level. In a real
// browser there is no `process` global, so merely loading the bridge throws "process is not
// defined" (mw-yo97u.11). This test reproduces that by deleting globalThis.process before
// the bridge has ever been loaded, then calling an exported function that triggers
// loadLicenseBridge for the first time.
import { describe, it, expect, afterEach } from 'vitest';
import { Hash, P2PKH, Utils } from '@bsv/sdk';
import { licenseLockingScript } from '../../src/bsv/license-contract';
import type { LicenseState } from '../../src/bsv/license-contract';
import { config, wallet } from '../fixtures/bsv/license-contract-chain';

describe('loadLicenseBridge without a global process (mw-yo97u.11)', () => {
  const originalProcess = globalThis.process;

  afterEach(() => {
    (globalThis as { process?: unknown }).process = originalProcess;
  });

  it('loads the License bridge even when globalThis.process does not exist', async () => {
    const standIn = new P2PKH().lock(wallet.owner.address);
    const state: LicenseState = {
      collectionIdHex: Utils.toHex(Utils.toArray(config.collectionId, 'utf8')),
      fuelScriptHashHex: Utils.toHex(Hash.hash256(standIn.toBinary())),
      ownerPubKeyHex: wallet.owner.pubKey,
    };

    delete (globalThis as { process?: unknown }).process;

    const lockingScriptHex = await licenseLockingScript(state);

    expect(lockingScriptHex).toEqual(expect.any(String));
    expect(lockingScriptHex.length).toBeGreaterThan(0);
  });
});
