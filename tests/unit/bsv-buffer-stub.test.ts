// installBufferStub (mw-yo97u.13): the browser-only successor to mw-yo97u.11's process stand-in
// and mw-yo97u.12's events alias. With globalThis.Buffer absent, scrypt-ts's contract.js and
// its scryptlib/@scrypt-inc/bsv dependencies throw "Buffer is not defined" the moment a License
// locking script is deserialized (readLockingScript, called from spendableLicense on every write
// or transfer); with the stand-in installed, the same call succeeds.
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { installBufferStub, BufferStub } from '../../src/bsv/buffer-stub';
import { readLicenseState } from '../../src/bsv/license-contract';
import { mintOwnersLicense } from '../fixtures/bsv/license-contract-chain';
import type { BuiltContractTransaction } from '../../src/bsv/license-contract';

describe('installBufferStub', () => {
  const originalBuffer = globalThis.Buffer;

  afterEach(() => {
    globalThis.Buffer = originalBuffer;
  });

  it('installs nothing when globalThis.Buffer already exists', () => {
    installBufferStub();
    expect(globalThis.Buffer).toBe(originalBuffer);
  });

  it('installs the stand-in when globalThis.Buffer is absent', () => {
    // @ts-expect-error deleting a global that TypeScript otherwise assumes always exists
    delete globalThis.Buffer;

    installBufferStub();

    expect(globalThis.Buffer).toBe(BufferStub);
  });
});

describe('a License locking script deserialized with no Buffer global', () => {
  const originalBuffer = globalThis.Buffer;
  let mint: BuiltContractTransaction;
  let lockingScriptHex: string;

  beforeAll(async () => {
    // Minting (and so first loading the License bridge) happens with a real Buffer present,
    // exactly as every other test in this suite does; this describe block only cares about
    // reproducing readLockingScript's own bare `Buffer.from(...)` calls, which run fresh on
    // every call, not just at module load.
    mint = await mintOwnersLicense();
    lockingScriptHex = mint.transaction.outputs[0].lockingScript.toHex();
  });

  afterEach(() => {
    globalThis.Buffer = originalBuffer;
  });

  it('throws "Buffer is not defined" before installBufferStub runs', async () => {
    // @ts-expect-error deleting a global that TypeScript otherwise assumes always exists
    delete globalThis.Buffer;

    await expect(readLicenseState(lockingScriptHex)).rejects.toThrow('Buffer is not defined');
  });

  it('succeeds once installBufferStub has run', async () => {
    // @ts-expect-error deleting a global that TypeScript otherwise assumes always exists
    delete globalThis.Buffer;
    installBufferStub();

    const state = await readLicenseState(lockingScriptHex);

    expect(state.ownerPubKeyHex).toBeTruthy();
    expect(state.collectionIdHex).toBeTruthy();
  });
});
