// ownerPubKeyFromLicenseLockingScript (mw-5wuz6.5): a pure parser over a compiled License
// locking script's hex, importing nothing from scrypt-ts. Exercised against real locking
// scripts built through the contract-locked builders (which load the committed artifact's
// bridge lazily — never a direct import of it here, so this file stays inside
// tsconfig.app.json's ordinary program, unlike tests/unit/bsv-contracts-license.test.ts).
import { describe, it, expect } from 'vitest';
import { P2PKH } from '@bsv/sdk';
import { buildContractTransferTransaction } from '../../src/bsv/license-contract';
import { ownerPubKeyFromLicenseLockingScript } from '../../src/bsv/license-owner';
import { config, fakeChain, mintOwnersLicense, utxoOf, wallet } from '../fixtures/bsv/license-contract-chain';

describe('ownerPubKeyFromLicenseLockingScript', () => {
  it('reads the owner public key out of a real License locking script from the committed artifact', async () => {
    const mint = await mintOwnersLicense();
    const lockingScriptHex = mint.transaction.outputs[0].lockingScript.toHex();

    expect(ownerPubKeyFromLicenseLockingScript(lockingScriptHex)).toBe(wallet.owner.pubKey);
  });

  it('reads the new owner after a transfer moves the state', async () => {
    const mint = await mintOwnersLicense();
    const transfer = await buildContractTransferTransaction({
      holderKey: wallet.owner.wif,
      token: mint.token,
      feeUtxos: [utxoOf(wallet.transferFundingTx)],
      toPubKey: wallet.buyer.pubKey,
      config,
      provider: fakeChain([mint.transaction]),
    });

    expect(ownerPubKeyFromLicenseLockingScript(transfer.transaction.outputs[0].lockingScript.toHex())).toBe(wallet.buyer.pubKey);
  });

  it('returns null for a plain P2PKH locking script', () => {
    const p2pkhHex = new P2PKH().lock(wallet.owner.address).toHex();
    expect(ownerPubKeyFromLicenseLockingScript(p2pkhHex)).toBeNull();
  });

  it('returns null for garbage hex too short to carry a state suffix', () => {
    expect(ownerPubKeyFromLicenseLockingScript('00')).toBeNull();
  });

  it('returns null for odd-length or non-hex input', () => {
    expect(ownerPubKeyFromLicenseLockingScript('abc')).toBeNull();
    expect(ownerPubKeyFromLicenseLockingScript('zz00')).toBeNull();
  });
});
