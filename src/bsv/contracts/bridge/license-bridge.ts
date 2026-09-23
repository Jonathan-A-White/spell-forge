// The scrypt-ts side of the contract-locked builders (mw-5wuz6.3). @bsv/sdk builds, funds
// and signs the transaction (src/bsv/license-contract.ts); this module only turns hex into
// the License's locking script, reads one back, and makes input 0's unlocking script from
// the committed artifact. It is loaded lazily (import.meta.glob) and never by the app's
// tsc, whose decorator settings license.ts cannot use: see license-bridge-types.ts.

import { bsv, PubKey, Sig, toByteString, Utils } from 'scrypt-ts';
import type { Artifact, ByteString } from 'scrypt-ts';
import { License } from '../license';
import artifact from '../artifacts/license.json';
import { toBsvTransaction, verifyInput } from './bsv-transaction';
import type { LicenseBridge, LicenseState, LicenseUnlockParams } from './license-bridge-types';

License.loadArtifact(artifact as unknown as Artifact);

const SIGHASH_ALL_FORKID = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;

function licenseFor(state: LicenseState): License {
  return new License(
    toByteString(state.collectionIdHex),
    toByteString(state.fuelScriptHashHex),
    PubKey(state.ownerPubKeyHex),
  );
}

function stateOf(license: License): LicenseState {
  return {
    collectionIdHex: license.collectionId,
    fuelScriptHashHex: license.fuelScriptHash,
    ownerPubKeyHex: license.ownerPubKey,
  };
}

function licenseAt(lockingScriptHex: string): License {
  let license: License;
  try {
    license = License.fromLockingScript(lockingScriptHex) as License;
  } catch (error) {
    throw new Error(`Not a License locking script of artifact ${artifact.md5}: ${error instanceof Error ? error.message : String(error)}`);
  }
  // fromLockingScript matches the code part loosely; a round trip proves it is this artifact's.
  if (license.lockingScript.toHex() !== lockingScriptHex) {
    throw new Error(`Not a License locking script of artifact ${artifact.md5}`);
  }
  return license;
}

function nextLockingScript(currentLockingScriptHex: string, newOwnerPubKeyHex?: string): string {
  const next = licenseAt(currentLockingScriptHex).next();
  if (newOwnerPubKeyHex) next.ownerPubKey = PubKey(newOwnerPubKeyHex);
  return next.lockingScript.toHex();
}

function unlockingScript(params: LicenseUnlockParams): string {
  const { method, tx, sourceLockingScriptHex, sourceSatoshis, preimageHex, ownerSigHex, newOwnerPubKeyHex, blind } = params;
  if (tx.outputs.length < 3) {
    throw new Error(`A License ${method} needs at least three outputs (itself, Fuel, Data), got ${tx.outputs.length}`);
  }

  // Only input 0's source output enters its preimage.
  const bsvTx = toBsvTransaction(tx, { 0: { scriptHex: sourceLockingScriptHex, satoshis: sourceSatoshis } });
  const ownPreimageHex = bsvTx.getPreimage(0, SIGHASH_ALL_FORKID);
  if (ownPreimageHex !== preimageHex) {
    throw new Error('Sighash preimage mismatch: the preimage @bsv/sdk signed is not the one the License checks');
  }

  const license = licenseAt(sourceLockingScriptHex);
  const [, fuel, data, ...rest] = tx.outputs;
  const fuelScript: ByteString = toByteString(fuel.scriptHex);
  const fuelValue = BigInt(fuel.satoshis);
  const dataScript: ByteString = toByteString(data.scriptHex);
  const sig = Sig(toByteString(ownerSigHex));

  if (blind) {
    // The same "blind" mechanism scrypt-ts's own MethodCallOptions.exec: false uses
    // internally (contract.js's signSingleCallTx): callDelegatedMethod serializes the
    // method call into a script without running License.write/transfer's TypeScript
    // assertions, so a deliberately invalid call (e.g. a wrong-key signature) still
    // produces a real script for the interpreter — and a real node — to reject, instead
    // of throwing here before either ever sees it. Declared `private` in scrypt-ts's own
    // types (internal API, called here the same way contract.js calls it on itself), so
    // reached through a cast naming only the two members this uses.
    const delegated = license as unknown as {
      to: { tx: bsv.Transaction; inputIndex: number };
      callDelegatedMethod: (methodName: string, ...args: unknown[]) => { publicMethodCall: { toScript: () => bsv.Script } };
    };
    delegated.to = { tx: bsvTx, inputIndex: 0 };
    const args =
      method === 'write'
        ? [sig, fuelScript, fuelValue, dataScript]
        : (() => {
            if (!newOwnerPubKeyHex) throw new Error('A License transfer needs the new owner key');
            const restOutputs = toByteString(
              rest.map((output) => Utils.buildOutput(toByteString(output.scriptHex), BigInt(output.satoshis))).join(''),
            );
            return [sig, PubKey(newOwnerPubKeyHex), fuelScript, fuelValue, dataScript, restOutputs];
          })();
    const { publicMethodCall } = delegated.callDelegatedMethod(method, ...args);
    return publicMethodCall.toScript().toHex();
  }

  const script = license.getUnlockingScript((self) => {
    self.to = { tx: bsvTx, inputIndex: 0 };
    if (method === 'write') {
      self.write(sig, fuelScript, fuelValue, dataScript);
    } else {
      if (!newOwnerPubKeyHex) throw new Error('A License transfer needs the new owner key');
      const restOutputs = toByteString(
        rest.map((output) => Utils.buildOutput(toByteString(output.scriptHex), BigInt(output.satoshis))).join(''),
      );
      self.transfer(sig, PubKey(newOwnerPubKeyHex), fuelScript, fuelValue, dataScript, restOutputs);
    }
  });
  return script.toHex();
}

export const licenseBridge: LicenseBridge = {
  artifactVersion: artifact.md5,
  lockingScript: (state) => licenseFor(state).lockingScript.toHex(),
  readLockingScript: (lockingScriptHex) => stateOf(licenseAt(lockingScriptHex)),
  nextLockingScript,
  unlockingScript,
  verifyInput,
};

