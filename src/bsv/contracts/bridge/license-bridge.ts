// The scrypt-ts side of the contract-locked builders (mw-5wuz6.3). @bsv/sdk builds, funds
// and signs the transaction (src/bsv/license-contract.ts); this module only turns hex into
// the License's locking script, reads one back, and makes input 0's unlocking script from
// the committed artifact. It is loaded lazily (import.meta.glob) and never by the app's
// tsc, whose decorator settings license.ts cannot use: see license-bridge-types.ts.

import { bsv, PubKey, Sig, toByteString, Utils } from 'scrypt-ts';
import type { Artifact, ByteString } from 'scrypt-ts';
import { License } from '../license';
import artifact from '../artifacts/license.json';
import type {
  BridgeTransaction,
  LicenseBridge,
  LicenseState,
  LicenseUnlockParams,
  LicenseVerifyResult,
} from './license-bridge-types';

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

/** The transaction as scrypt-ts's bsv sees it, input 0 carrying the License it spends. */
function toBsvTransaction(tx: BridgeTransaction, sourceLockingScriptHex: string, sourceSatoshis: number): bsv.Transaction {
  // bsv's typings omit `version`, which its Transaction has and serializes.
  const bsvTx = new bsv.Transaction() as bsv.Transaction & { version: number };
  bsvTx.version = tx.version;
  bsvTx.nLockTime = tx.lockTime;
  tx.inputs.forEach((input, index) => {
    const bsvInput = new bsv.Transaction.Input({
      prevTxId: input.txid,
      outputIndex: input.vout,
      script: bsv.Script.empty(),
      sequenceNumber: input.sequence,
    });
    if (index === 0) {
      bsvTx.addInput(bsvInput, bsv.Script.fromHex(sourceLockingScriptHex), sourceSatoshis);
    } else {
      // Only input 0's source output enters its preimage; the others need an outpoint and a sequence.
      bsvTx.addInput(bsvInput, bsv.Script.empty(), 0);
    }
  });
  for (const output of tx.outputs) {
    bsvTx.addOutput(new bsv.Transaction.Output({ script: bsv.Script.fromHex(output.scriptHex), satoshis: output.satoshis }));
  }
  return bsvTx;
}

function unlockingScript(params: LicenseUnlockParams): string {
  const { method, tx, sourceLockingScriptHex, sourceSatoshis, preimageHex, ownerSigHex, newOwnerPubKeyHex } = params;
  if (tx.outputs.length < 3) {
    throw new Error(`A License ${method} needs at least three outputs (itself, Fuel, Data), got ${tx.outputs.length}`);
  }

  const bsvTx = toBsvTransaction(tx, sourceLockingScriptHex, sourceSatoshis);
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

function verifyInput(txHex: string, inputIndex: number, sourceLockingScriptHex: string, sourceSatoshis: number): LicenseVerifyResult {
  const bsvTx = new bsv.Transaction(txHex);
  bsvTx.inputs[inputIndex].output = new bsv.Transaction.Output({
    script: bsv.Script.fromHex(sourceLockingScriptHex),
    satoshis: sourceSatoshis,
  });
  const { success, error } = bsvTx.verifyScript(inputIndex);
  return { success, error };
}

export const licenseBridge: LicenseBridge = {
  artifactVersion: artifact.md5,
  lockingScript: (state) => licenseFor(state).lockingScript.toHex(),
  readLockingScript: (lockingScriptHex) => stateOf(licenseAt(lockingScriptHex)),
  nextLockingScript,
  unlockingScript,
  verifyInput,
};

