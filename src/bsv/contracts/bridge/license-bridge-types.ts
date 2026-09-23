// The interface between the contract-locked builders (src/bsv/license-contract.ts) and
// the scrypt-ts side (license-bridge.ts), in raw hex only (mw-5wuz6.3). Plain types: the
// app's tsc reads this file, never license-bridge.ts, which the app reaches only through
// a lazy import.meta.glob so scrypt-ts stays out of the main chunk.

/** A License's constructor props and state, as hex. */
export interface LicenseState {
  collectionIdHex: string;
  fuelScriptHashHex: string;
  ownerPubKeyHex: string;
}

/** What the bridge needs of an unsigned transaction to rebuild input 0's preimage. */
export interface BridgeTransaction {
  version: number;
  lockTime: number;
  inputs: { txid: string; vout: number; sequence: number }[];
  outputs: { scriptHex: string; satoshis: number }[];
}

export interface LicenseUnlockParams {
  method: 'write' | 'transfer';
  tx: BridgeTransaction;
  /** Input 0's source output: the License being spent. */
  sourceLockingScriptHex: string;
  sourceSatoshis: number;
  /** The SIGHASH_ALL|FORKID preimage of input 0 that @bsv/sdk signed; the bridge refuses one that differs from its own. */
  preimageHex: string;
  /** The owner's signature over preimageHex, in checksig format (DER + the 0x41 flag byte). */
  ownerSigHex: string;
  /** transfer only: output 0's new owner key. */
  newOwnerPubKeyHex?: string;
  /**
   * Skips the committed contract's own TypeScript assertions while building the script
   * (scrypt-ts's callDelegatedMethod, the same mechanism MethodCallOptions.exec: false uses
   * internally) instead of running them (License.write/transfer, via getUnlockingScript) —
   * for building a real, signature-invalid spend to broadcast and watch a node reject,
   * since every rule's assertion otherwise throws synchronously right here, before a
   * transaction to broadcast even exists (mw-5wuz6.6). Never used by production callers,
   * which always want the assertions.
   */
  blind?: boolean;
}

export interface LicenseVerifyResult {
  success: boolean;
  error: string;
}

export interface LicenseBridge {
  /** The committed artifact's md5, recorded on every License token as `artifact`. */
  artifactVersion: string;
  /** A new License's locking script, for a mint. */
  lockingScript(state: LicenseState): string;
  /**
   * Output 0 of a spend of the License locked by currentLockingScriptHex: the same script,
   * with the owner key in its state replaced on a transfer. Never a fresh lockingScript():
   * the code part keeps the owner key the License was minted with, so after a transfer a
   * fresh script differs from the one the contract rebuilds.
   */
  nextLockingScript(currentLockingScriptHex: string, newOwnerPubKeyHex?: string): string;
  /** The state of a License locking script; throws if the script is not this artifact's License. */
  readLockingScript(lockingScriptHex: string): LicenseState;
  /**
   * Input 0's unlocking script: the owner signature, output 1 (Fuel), its value, output 2
   * (Data) and, on a transfer, the new owner key and outputs 3+, plus the Push TX preimage
   * and prevouts. Fuel and Data are read from tx.outputs, so they are what the contract binds.
   */
  unlockingScript(params: LicenseUnlockParams): string;
  /** Runs one input's unlocking script against its source locking script in scrypt-ts's interpreter. */
  verifyInput(txHex: string, inputIndex: number, sourceLockingScriptHex: string, sourceSatoshis: number): LicenseVerifyResult;
}

export interface LicenseBridgeModule {
  licenseBridge: LicenseBridge;
}
