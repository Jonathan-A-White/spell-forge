// src/bsv/license-contract.ts — Contract-locked License Token builders (mw-5wuz6.3): the
// mint, write-with-token and transfer transactions of license-token.ts with the token's
// 1-sat output locked by the License covenant (src/bsv/contracts/license.ts, spec §3.7)
// instead of a P2PKH. @bsv/sdk builds, funds and signs the transaction; the License's and
// the Fuel's locking scripts and unlocking scripts come from the scrypt-ts side
// (contracts/bridge/license-bridge.ts, fuel-bridge.ts) as raw hex, loaded lazily so the
// app's main chunk carries no scrypt-ts.
//
// Output layout, rule (f): [0] the License, 1 sat; [1] the Fuel; [2] the Data output (record
// type M, W or TR); a transfer may add payment outputs after. Since mw-yo97u.3 the mint
// creates Fuel(C) (src/bsv/contracts/fuel.ts) at output 1 with exactly MINT_FUEL sat, the
// issuer's change at output 3, and every spend of such a token takes its Fuel at input 1
// and pays the fee from it: output 1 = own − fee, no holder coin on a write. A step 2 token
// (mw-5wuz6.3), whose License binds a P2PKH stand-in to the holder, keeps the stand-in path:
// funding inputs at 1 and later, the stand-in carrying the change.

import {
  Hash,
  LockingScript,
  P2PKH,
  PrivateKey,
  PublicKey,
  SatoshisPerKilobyte,
  Transaction,
  TransactionSignature,
  UnlockingScript,
  Utils,
} from '@bsv/sdk';
import type { EventBus, Utxo } from '../contracts/types';
import type { ChainConfig } from './config';
import type { ChainProvider } from './chain-provider';
import type {
  BridgeTransaction,
  LicenseBridge,
  LicenseBridgeModule,
  LicenseState,
  LicenseVerifyResult,
} from './contracts/bridge/license-bridge-types';
import type { FuelBridge, FuelBridgeModule } from './contracts/bridge/fuel-bridge-types';
import {
  assertTokenLock,
  type LicenseToken,
  type Outpoint,
  type RecordWithTokenPayload,
  type TokenRepository,
} from './license-token';
import {
  describePendingShortfall,
  filterUtxosExcludingPending,
  outpointKey,
  reconcilePendingSpends,
  selectFeeUtxos,
  type PendingSpendEntry,
  type PendingSpendRepository,
} from './pending-spends';
import { encodeTypedRecordScript, type TypedRecordType } from './record';

export type { LicenseState, LicenseVerifyResult } from './contracts/bridge/license-bridge-types';

const TOKEN_OUTPUT_SATOSHIS = 1;
/** Fuel(C) is always output 1 of the transaction that made it, and input 1 of the one that spends it (§4.3). */
const FUEL_INDEX = 1;
const SIGHASH_ALL_FORKID = TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID;
const SIGHASH_SINGLE_FORKID = TransactionSignature.SIGHASH_SINGLE | TransactionSignature.SIGHASH_FORKID;

/** A MINT_FUEL that is unset, or under 2 × FEE_CAP, so the Fuel could not pay for two writes. */
export class InvalidMintFuelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMintFuelError';
  }
}

/**
 * The token record names a License (or Fuel) artifact other than the one this build carries.
 * No older artifacts are kept (deferred until mainnet), so such a token cannot be spent.
 */
export class ContractVersionMismatchError extends Error {
  readonly contract: 'License' | 'Fuel';
  readonly minted: string | undefined;
  readonly current: string;

  constructor(contract: 'License' | 'Fuel', minted: string | undefined, current: string) {
    super(
      `This token was minted under an older contract version: its ${contract} artifact is ${minted ?? 'unrecorded'}, ` +
        `this build carries ${current}, and no older artifact is kept to spend it`,
    );
    this.name = 'ContractVersionMismatchError';
    this.contract = contract;
    this.minted = minted;
    this.current = current;
  }
}

/** A Fuel-paid spend whose estimated fee is more than the Fuel may burn in one spend. */
export class FuelFeeCapExceededError extends Error {
  readonly fee: number;
  readonly feeCap: number;

  constructor(fee: number, feeCap: number) {
    super(`This spend's estimated fee ${fee} sat exceeds the Fuel's FEE_CAP of ${feeCap} sat`);
    this.name = 'FuelFeeCapExceededError';
    this.fee = fee;
    this.feeCap = feeCap;
  }
}

/** Loads once, on first use; a failed load is retried on the next call. */
function lazy<T>(load: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () => {
    promise ??= load().catch((error: unknown) => {
      promise = undefined;
      throw error;
    });
    return promise;
  };
}

// Lazy globs rather than bare import()s: Vite still gives the bridges (and scrypt-ts) their
// own chunk, loaded on first use, but the app's tsc does not follow them into license.ts
// and fuel.ts, whose legacy decorators only tsconfig.contracts-test.json compiles.
const LICENSE_BRIDGE_MODULE = './contracts/bridge/license-bridge.ts';
const licenseBridgeLoaders = import.meta.glob<LicenseBridgeModule>('./contracts/bridge/license-bridge.ts');
const FUEL_BRIDGE_MODULE = './contracts/bridge/fuel-bridge.ts';
const fuelBridgeLoaders = import.meta.glob<FuelBridgeModule>('./contracts/bridge/fuel-bridge.ts');

const loadLicenseBridge = lazy(() => licenseBridgeLoaders[LICENSE_BRIDGE_MODULE]().then((module) => module.licenseBridge));
const loadFuelBridge = lazy(() => fuelBridgeLoaders[FUEL_BRIDGE_MODULE]().then((module) => module.fuelBridge));

/** The owner key, collection and Fuel script hash a License locking script carries. */
export async function readLicenseState(lockingScriptHex: string): Promise<LicenseState> {
  return (await loadLicenseBridge()).readLockingScript(lockingScriptHex);
}

/** A new License's locking script from the committed artifact, as hex. */
export async function licenseLockingScript(state: LicenseState): Promise<string> {
  return (await loadLicenseBridge()).lockingScript(state);
}

/** Fuel(C)'s locking script for config's collection, from the committed artifact. */
export async function fuelLockingScript(config: ChainConfig): Promise<LockingScript> {
  return LockingScript.fromHex((await loadFuelBridge()).lockingScript(collectionIdHex(config)));
}

/** Runs input `inputIndex` (a License spend) through the committed artifact's script, locally. */
export async function verifyLicenseInput(transaction: Transaction, inputIndex = 0): Promise<LicenseVerifyResult> {
  const bridge = await loadLicenseBridge();
  const { lockingScript, satoshis } = sourceOutput(transaction, inputIndex);
  return bridge.verifyInput(transaction.toHex(), inputIndex, lockingScript.toHex(), satoshis);
}

/** Runs input `inputIndex` (a Fuel spend) through the committed Fuel artifact's script, locally. */
export async function verifyFuelInput(transaction: Transaction, inputIndex = FUEL_INDEX): Promise<LicenseVerifyResult> {
  const bridge = await loadFuelBridge();
  const { lockingScript, satoshis } = sourceOutput(transaction, inputIndex);
  return bridge.verifyInput(transaction.toHex(), inputIndex, lockingScript.toHex(), satoshis);
}

export interface BuiltContractTransaction {
  transaction: Transaction;
  hex: string;
  txid: string;
  spentOutpoints: Outpoint[];
  /** The token record once this transaction is broadcast: current at its output 0. */
  token: LicenseToken;
}

function sourceOutput(transaction: Transaction, inputIndex: number): { lockingScript: LockingScript; satoshis: number } {
  const input = transaction.inputs[inputIndex];
  const output = input?.sourceTransaction?.outputs[input.sourceOutputIndex];
  if (!output || output.satoshis === undefined) {
    throw new Error(`Input ${inputIndex} has no source transaction output`);
  }
  return { lockingScript: output.lockingScript, satoshis: output.satoshis };
}

function hash256Hex(script: LockingScript): string {
  return Utils.toHex(Hash.hash256(script.toBinary()));
}

function collectionIdHex(config: ChainConfig): string {
  return Utils.toHex(Utils.toArray(config.collectionId, 'utf8'));
}

function jsonBytes(value: object): number[] {
  return Utils.toArray(JSON.stringify(value), 'utf8');
}

function parsePublicKey(hex: string, role: string): PublicKey {
  try {
    return PublicKey.fromString(hex);
  } catch {
    throw new Error(`Invalid ${role} public key: ${hex}`);
  }
}

async function addFundingInputs(transaction: Transaction, utxos: Utxo[], key: PrivateKey, provider: ChainProvider): Promise<void> {
  for (const utxo of utxos) {
    const sourceHex = await provider.getTransactionHex(utxo.txid);
    transaction.addInput({
      sourceTransaction: Transaction.fromHex(sourceHex),
      sourceOutputIndex: utxo.vout,
      unlockingScriptTemplate: new P2PKH().unlock(key),
    });
  }
}

function describeTransaction(tx: Transaction): BridgeTransaction {
  return {
    version: tx.version,
    lockTime: tx.lockTime,
    inputs: tx.inputs.map((input) => ({
      txid: input.sourceTXID ?? input.sourceTransaction?.id('hex') ?? '',
      vout: input.sourceOutputIndex,
      sequence: input.sequence ?? 0xffffffff,
    })),
    outputs: tx.outputs.map((output) => ({ scriptHex: output.lockingScript.toHex(), satoshis: output.satoshis ?? 0 })),
  };
}

function inputOutpoints(transaction: Transaction): Outpoint[] {
  return transaction.inputs.map((input) => ({
    txid: input.sourceTXID ?? input.sourceTransaction?.id('hex') ?? '',
    vout: input.sourceOutputIndex,
  }));
}

/** Bytes of a data push of n bytes, its opcode (and length) included. */
function pushLength(n: number): number {
  return n + (n < 76 ? 1 : n < 256 ? 2 : n < 65536 ? 3 : 5);
}

function varIntLength(n: number): number {
  return n < 0xfd ? 1 : n <= 0xffff ? 3 : 5;
}

/** A BIP143 preimage's length: fixed fields plus the subscript (the spent locking script) and its length. */
function preimageLength(scriptLength: number): number {
  return 156 + varIntLength(scriptLength) + scriptLength;
}

interface LicenseUnlockOptions {
  method: 'write' | 'transfer';
  bridge: LicenseBridge;
  ownerKey: PrivateKey;
  newOwnerPubKeyHex?: string;
  /** Passed through to the bridge: skip the contract's own assertions (see LicenseUnlockParams.blind). */
  blind?: boolean;
}

/**
 * Input 0's unlocking template. @bsv/sdk formats the SIGHASH_ALL|FORKID preimage and signs
 * it with the owner key, exactly as its own P2PKH template does; the bridge checks the
 * preimage is the one the License's Push TX will see, then builds the method call around
 * the signature. Called by transaction.sign(), after the fee has fixed every output.
 */
function licenseUnlock({ method, bridge, ownerKey, newOwnerPubKeyHex, blind }: LicenseUnlockOptions) {
  return {
    sign: async (tx: Transaction, inputIndex: number): Promise<UnlockingScript> => {
      const input = tx.inputs[inputIndex];
      const { lockingScript, satoshis } = sourceOutput(tx, inputIndex);
      const preimage = TransactionSignature.format({
        sourceTXID: input.sourceTXID ?? input.sourceTransaction!.id('hex'),
        sourceOutputIndex: input.sourceOutputIndex,
        sourceSatoshis: satoshis,
        transactionVersion: tx.version,
        otherInputs: tx.inputs.filter((_, index) => index !== inputIndex),
        inputIndex,
        outputs: tx.outputs,
        inputSequence: input.sequence ?? 0xffffffff,
        subscript: lockingScript,
        lockTime: tx.lockTime,
        scope: SIGHASH_ALL_FORKID,
      });
      // PrivateKey.sign hashes again, so this signs hash256(preimage), as P2PKH.unlock does.
      const raw = ownerKey.sign(Hash.sha256(preimage));
      const signature = new TransactionSignature(raw.r, raw.s, SIGHASH_ALL_FORKID).toChecksigFormat();
      const unlockingHex = bridge.unlockingScript({
        method,
        tx: describeTransaction(tx),
        sourceLockingScriptHex: lockingScript.toHex(),
        sourceSatoshis: satoshis,
        preimageHex: Utils.toHex(preimage),
        ownerSigHex: Utils.toHex(signature),
        newOwnerPubKeyHex,
        blind,
      });
      return UnlockingScript.fromHex(unlockingHex);
    },
    // The method's pushes: sig, Fuel script, Fuel value, Data script, (transfer: new owner,
    // outputs 3+), the preimage (which carries input 0's whole locking script) and the
    // prevouts, plus the method selector. Rounded up, so the fee never falls short.
    estimateLength: async (tx: Transaction, inputIndex: number): Promise<number> => {
      const { lockingScript } = sourceOutput(tx, inputIndex);
      const scriptLength = lockingScript.toBinary().length;
      const outputScriptLength = (index: number) => tx.outputs[index].lockingScript.toBinary().length;
      let length =
        pushLength(73) +
        pushLength(outputScriptLength(1)) +
        pushLength(9) +
        pushLength(outputScriptLength(2)) +
        pushLength(preimageLength(scriptLength)) +
        pushLength(36 * tx.inputs.length) +
        1;
      if (method === 'transfer') {
        const rest = tx.outputs.slice(3).reduce((sum, output) => {
          const n = output.lockingScript.toBinary().length;
          return sum + 8 + varIntLength(n) + n;
        }, 0);
        length += pushLength(33) + pushLength(rest);
      }
      return length + 16;
    },
  };
}

/**
 * The Fuel input's unlocking template: @bsv/sdk formats its SIGHASH_SINGLE|FORKID preimage
 * (no signature: Fuel(C) has no key), the bridge checks it is the one the Fuel's Push TX
 * will see and builds spend(fuelValue) with the preimage and the prevouts list (FB-1).
 */
function fuelUnlock({ bridge, blind }: { bridge: FuelBridge; blind?: boolean }) {
  return {
    sign: async (tx: Transaction, inputIndex: number): Promise<UnlockingScript> => {
      const input = tx.inputs[inputIndex];
      const { lockingScript, satoshis } = sourceOutput(tx, inputIndex);
      const preimage = TransactionSignature.format({
        sourceTXID: input.sourceTXID ?? input.sourceTransaction!.id('hex'),
        sourceOutputIndex: input.sourceOutputIndex,
        sourceSatoshis: satoshis,
        transactionVersion: tx.version,
        otherInputs: tx.inputs.filter((_, index) => index !== inputIndex),
        inputIndex,
        outputs: tx.outputs,
        inputSequence: input.sequence ?? 0xffffffff,
        subscript: lockingScript,
        lockTime: tx.lockTime,
        scope: SIGHASH_SINGLE_FORKID,
      });
      const unlockingHex = bridge.unlockingScript({
        tx: describeTransaction(tx),
        inputIndex,
        sourceLockingScriptHex: lockingScript.toHex(),
        sourceSatoshis: satoshis,
        preimageHex: Utils.toHex(preimage),
        fuelValue: tx.outputs[FUEL_INDEX].satoshis ?? 0,
        blind,
      });
      return UnlockingScript.fromHex(unlockingHex);
    },
    // fuelValue, the preimage (carrying the Fuel's own locking script), the prevouts. Rounded up.
    estimateLength: async (tx: Transaction, inputIndex: number): Promise<number> => {
      const scriptLength = sourceOutput(tx, inputIndex).lockingScript.toBinary().length;
      return pushLength(9) + pushLength(preimageLength(scriptLength)) + pushLength(36 * tx.inputs.length) + 16;
    },
  };
}

/** Throws a named error if the built License spend would fail the committed artifact's script. */
function assertVerifies(bridge: LicenseBridge, transaction: Transaction): void {
  const { lockingScript, satoshis } = sourceOutput(transaction, 0);
  const { success, error } = bridge.verifyInput(transaction.toHex(), 0, lockingScript.toHex(), satoshis);
  if (!success) {
    throw new Error(`The built License spend fails local verification against artifact ${bridge.artifactVersion}: ${error}`);
  }
}

/** Throws a named error if the built Fuel spend at input 1 would fail the committed Fuel artifact's script. */
function assertFuelVerifies(bridge: FuelBridge, transaction: Transaction): void {
  const { lockingScript, satoshis } = sourceOutput(transaction, FUEL_INDEX);
  const { success, error } = bridge.verifyInput(transaction.toHex(), FUEL_INDEX, lockingScript.toHex(), satoshis);
  if (!success) {
    throw new Error(`The built Fuel spend fails local verification against artifact ${bridge.artifactVersion}: ${error}`);
  }
}

export interface BuildContractMintTransactionParams {
  issuerKey: string; // issuer WIF: signs the funding inputs, and takes the change
  utxos: Utxo[];
  holderPubKey: string; // the owner key the License locks to (compressed, hex)
  /**
   * MINT_FUEL: output 1's satoshis, exactly. Refused with InvalidMintFuelError when unset
   * or under 2 × FEE_CAP. The app passes config.mintFuelSatoshis.
   */
  mintFuelSatoshis?: number;
  config: ChainConfig;
  provider: ChainProvider;
}

function assertMintFuel(mintFuelSatoshis: number | undefined, fuelBridge: FuelBridge): number {
  if (mintFuelSatoshis === undefined) {
    throw new InvalidMintFuelError('MINT_FUEL is not set: configure mintFuelSatoshis before minting a License with Fuel');
  }
  const minimum = 2 * fuelBridge.feeCapSatoshis;
  if (!Number.isInteger(mintFuelSatoshis) || mintFuelSatoshis < minimum) {
    throw new InvalidMintFuelError(
      `MINT_FUEL ${mintFuelSatoshis} sat is below 2 × FEE_CAP (${minimum} sat): a Fuel that small cannot pay for two writes`,
    );
  }
  return mintFuelSatoshis;
}

/**
 * Builds a signed mint (spec §4.1): [0] a 1-sat License owned by holderPubKey, whose
 * fuelScriptHash is hash256 of Fuel(C); [1] Fuel(C) with exactly MINT_FUEL sat; [2] a
 * type-M Data output; [3] the issuer's change. Funding inputs only; never a 1-satoshi UTXO
 * (spec R4.1.1), so output 0 is a fresh origin.
 */
export async function buildContractMintTransaction(params: BuildContractMintTransactionParams): Promise<BuiltContractTransaction> {
  const { issuerKey, utxos, holderPubKey, mintFuelSatoshis, config, provider } = params;

  const fuelBridge = await loadFuelBridge();
  const mintFuel = assertMintFuel(mintFuelSatoshis, fuelBridge);

  if (utxos.length === 0) {
    throw new Error('No UTXOs available — fund the issuer wallet before minting');
  }
  const eligibleUtxos = selectFeeUtxos(utxos, { exclude: [] });

  const issuer = PrivateKey.fromWif(issuerKey);
  const holder = parsePublicKey(holderPubKey, 'holder');
  const holderAddress = holder.toAddress(config.network);
  const fuelScript = LockingScript.fromHex(fuelBridge.lockingScript(collectionIdHex(config)));

  const bridge = await loadLicenseBridge();
  const licenseScript = LockingScript.fromHex(
    bridge.lockingScript({
      collectionIdHex: collectionIdHex(config),
      fuelScriptHashHex: hash256Hex(fuelScript),
      ownerPubKeyHex: holder.toString(),
    }),
  );

  const transaction = new Transaction();
  await addFundingInputs(transaction, eligibleUtxos, issuer, provider);
  transaction.addOutput({ lockingScript: licenseScript, satoshis: TOKEN_OUTPUT_SATOSHIS });
  transaction.addOutput({ lockingScript: fuelScript, satoshis: mintFuel });
  transaction.addOutput({
    lockingScript: encodeTypedRecordScript('M', jsonBytes({ collection: config.collectionId, holder: holderAddress })),
    satoshis: 0,
  });
  transaction.addOutput({ lockingScript: new P2PKH().lock(issuer.toAddress(config.network)), change: true });

  await transaction.fee(new SatoshisPerKilobyte(config.feeRateSatPerKb));
  if (transaction.outputs.length < 4) {
    throw new Error('Not enough satoshis to mint a token, fund its Fuel and cover the fee');
  }
  await transaction.sign();

  const txid = transaction.id('hex');
  const origin: Outpoint = { txid, vout: 0 };
  return {
    transaction,
    hex: transaction.toHex(),
    txid,
    spentOutpoints: eligibleUtxos.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout })),
    token: {
      origin,
      current: origin,
      holderAddress,
      collectionId: config.collectionId,
      lock: 'license',
      artifact: bridge.artifactVersion,
      fuelArtifact: fuelBridge.artifactVersion,
    },
  };
}

interface Bridges {
  license: LicenseBridge;
  fuel: FuelBridge;
}

/**
 * The artifact version gate (the Governor's Q3): a token whose record names a License (or
 * Fuel) artifact other than this build's is refused before anything is fetched or built.
 */
async function loadBridgesFor(token: LicenseToken): Promise<Bridges> {
  const [license, fuel] = await Promise.all([loadLicenseBridge(), loadFuelBridge()]);
  if (token.artifact !== license.artifactVersion) {
    throw new ContractVersionMismatchError('License', token.artifact, license.artifactVersion);
  }
  if (token.fuelArtifact !== undefined && token.fuelArtifact !== fuel.artifactVersion) {
    throw new ContractVersionMismatchError('Fuel', token.fuelArtifact, fuel.artifactVersion);
  }
  return { license, fuel };
}

/** The License at token.current, and which of the two spend paths its fuelScriptHash selects. */
type SpendableLicense = {
  sourceTransaction: Transaction;
  lockingScriptHex: string;
} & (
  | { path: 'fuel'; fuel: { lockingScript: LockingScript; satoshis: number } }
  | { path: 'stand-in'; fuelScript: LockingScript }
);

/**
 * Reads the License at token.current and checks, with a named error for each, that the key
 * is its owner and that its fuelScriptHash is either Fuel(C) of this build (the Fuel path:
 * the Fuel is output 1 of the same transaction) or the P2PKH stand-in to this holder (the
 * step 2 path), so the spend cannot fail verification for those.
 */
async function spendableLicense(
  bridges: Bridges,
  token: LicenseToken,
  holderKey: PrivateKey,
  config: ChainConfig,
  provider: ChainProvider,
): Promise<SpendableLicense> {
  const sourceTransaction = Transaction.fromHex(await provider.getTransactionHex(token.current.txid));
  const output = sourceTransaction.outputs[token.current.vout];
  if (!output || output.satoshis !== TOKEN_OUTPUT_SATOSHIS) {
    throw new Error(`token.current ${token.current.txid}:${token.current.vout} is not a 1-satoshi output`);
  }
  const lockingScriptHex = output.lockingScript.toHex();
  const state = bridges.license.readLockingScript(lockingScriptHex);

  const holderPubKeyHex = holderKey.toPublicKey().toString();
  if (state.ownerPubKeyHex !== holderPubKeyHex) {
    throw new Error(`Key ${holderPubKeyHex} is not this License's owner (${state.ownerPubKeyHex})`);
  }

  const fuelScript = LockingScript.fromHex(bridges.fuel.lockingScript(state.collectionIdHex));
  if (hash256Hex(fuelScript) === state.fuelScriptHashHex) {
    const fuelOutput = sourceTransaction.outputs[FUEL_INDEX];
    if (!fuelOutput || fuelOutput.satoshis === undefined || fuelOutput.lockingScript.toHex() !== fuelScript.toHex()) {
      throw new Error(`Output ${FUEL_INDEX} of ${token.current.txid} is not this License's Fuel(C)`);
    }
    return { sourceTransaction, lockingScriptHex, path: 'fuel', fuel: { lockingScript: fuelScript, satoshis: fuelOutput.satoshis } };
  }

  const standIn = new P2PKH().lock(holderKey.toAddress(config.network));
  if (hash256Hex(standIn) !== state.fuelScriptHashHex) {
    throw new Error(
      "This License's Fuel stand-in is not a P2PKH to this holder's key: the stand-in binds the minting holder's key, " +
        'so a later holder cannot spend it until the Fuel contract replaces the stand-in',
    );
  }
  return { sourceTransaction, lockingScriptHex, path: 'stand-in', fuelScript: standIn };
}

/** Where a spend's holder coin comes from: asked for only by a build that needs it. */
type FeeUtxoSource = () => Promise<Utxo[]>;

interface LicenseSpendParams {
  method: 'write' | 'transfer';
  bridge: LicenseBridge;
  holderKey: PrivateKey;
  /** Signs input 0's unlocking script; defaults to holderKey. Diverges from it only to exercise rule (d) — see buildContractSpendVariant. */
  signingKey?: PrivateKey;
  token: LicenseToken;
  license: SpendableLicense & { path: 'stand-in' };
  feeUtxos: Utxo[];
  output0: LockingScript;
  /** Output 0's satoshis; defaults to TOKEN_OUTPUT_SATOSHIS. Diverges from it only to exercise rule (b). */
  outputSatoshis?: number;
  dataScript: LockingScript;
  payments: { address: string; satoshis: number }[];
  newOwnerPubKeyHex?: string;
  /** Passed through to licenseUnlock/the bridge: skip the contract's own assertions (see LicenseUnlockParams.blind). */
  blind?: boolean;
  config: ChainConfig;
  provider: ChainProvider;
}

/**
 * The step 2 layout write and transfer share: License in at 0, funding after; License, the
 * stand-in with the change, Data out, payments after. Signs and returns the built spend but
 * does NOT check it against local verification — callers that build a spend meant to
 * succeed call assertVerifies themselves right after; a caller exercising the covenant's
 * negative rules (buildContractSpendVariant) checks the result itself instead.
 */
async function buildLicenseSpend(params: LicenseSpendParams): Promise<{ transaction: Transaction; spentOutpoints: Outpoint[] }> {
  const {
    method,
    bridge,
    holderKey,
    signingKey,
    token,
    license,
    feeUtxos,
    output0,
    outputSatoshis,
    dataScript,
    payments,
    newOwnerPubKeyHex,
    blind,
    config,
    provider,
  } = params;

  const eligibleFeeUtxos = selectFeeUtxos(feeUtxos, { exclude: [] });
  if (eligibleFeeUtxos.length === 0) {
    throw new Error(`No fee UTXOs available — fund this wallet before ${method === 'write' ? 'writing a record' : 'transferring'}`);
  }

  const transaction = new Transaction();
  transaction.addInput({
    sourceTransaction: license.sourceTransaction,
    sourceOutputIndex: token.current.vout,
    unlockingScriptTemplate: licenseUnlock({ method, bridge, ownerKey: signingKey ?? holderKey, newOwnerPubKeyHex, blind }),
  });
  await addFundingInputs(transaction, eligibleFeeUtxos, holderKey, provider);

  transaction.addOutput({ lockingScript: output0, satoshis: outputSatoshis ?? TOKEN_OUTPUT_SATOSHIS });
  transaction.addOutput({ lockingScript: license.fuelScript, change: true });
  transaction.addOutput({ lockingScript: dataScript, satoshis: 0 });
  addPaymentOutputs(transaction, payments);

  await transaction.fee(new SatoshisPerKilobyte(config.feeRateSatPerKb));
  if (transaction.outputs.length < 3 + payments.length) {
    throw new Error(`Not enough satoshis to cover the ${method} and fee`);
  }
  await transaction.sign();

  return {
    transaction,
    spentOutpoints: [token.current, ...eligibleFeeUtxos.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout }))],
  };
}

function addPaymentOutputs(transaction: Transaction, payments: { address: string; satoshis: number }[]): void {
  for (const payment of payments) {
    try {
      transaction.addP2PKHOutput(payment.address, payment.satoshis);
    } catch {
      throw new Error(`Invalid payment address: ${payment.address}`);
    }
  }
}

/** Overrides of a Fuel spend, each breaking one of Fuel(C)'s rules; only buildContractSpendVariant sets them. */
interface FuelSpendOverrides {
  /** Output 1's satoshis instead of own − fee (the fee cap is then not checked). */
  outputSatoshis?: number;
  /** Output 1's script instead of Fuel(C). */
  outputScript?: LockingScript;
  /** The Fuel's input index: 2, behind the holder's first fee UTXO at 1. */
  inputIndex?: 1 | 2;
  /** Input 0 is the holder's first fee UTXO, an ordinary P2PKH outpoint, and the License is not spent. */
  ordinaryInput0?: boolean;
}

interface FuelSpendParams extends Omit<LicenseSpendParams, 'license' | 'feeUtxos'> {
  fuelBridge: FuelBridge;
  license: SpendableLicense & { path: 'fuel' };
  /** The holder's coin: asked for only when the spend has payments to fund, or an override needs an ordinary input. */
  feeUtxos: FeeUtxoSource;
  /** Build the Fuel's unlocking script blind (see FuelUnlockParams.blind). */
  fuelBlind?: boolean;
  fuelOverrides?: FuelSpendOverrides;
}

/**
 * The License + Fuel layout (§4.3, §4.4): the License in at 0, its Fuel(C) at 1, any payment
 * inputs after; outputs the License, Fuel(C) at own − fee, Data, then payments and the
 * payer's change. The whole fee is paid from the Fuel: it is estimated before signing and
 * refused with FuelFeeCapExceededError over FEE_CAP. Like buildLicenseSpend, it does NOT
 * verify the result.
 */
async function buildFuelSpend(params: FuelSpendParams): Promise<{ transaction: Transaction; spentOutpoints: Outpoint[] }> {
  const {
    method,
    bridge,
    fuelBridge,
    holderKey,
    signingKey,
    token,
    license,
    feeUtxos,
    output0,
    outputSatoshis,
    dataScript,
    payments,
    newOwnerPubKeyHex,
    blind,
    fuelBlind,
    fuelOverrides = {},
    config,
    provider,
  } = params;
  const { outputSatoshis: fuelOutputOverride, outputScript: fuelOutputScript, inputIndex: fuelInputIndex = FUEL_INDEX, ordinaryInput0 } =
    fuelOverrides;

  const ordinaryInputs = (ordinaryInput0 ? 1 : 0) + (fuelInputIndex === 2 ? 1 : 0);
  const funding = ordinaryInputs > 0 || payments.length > 0 ? selectFeeUtxos(await feeUtxos(), { exclude: [] }) : [];
  if (funding.length < ordinaryInputs) {
    throw new Error('No fee UTXOs available — this override needs an ordinary input from the holder');
  }
  const ordinary0 = ordinaryInput0 ? funding[0] : undefined;
  const ordinary1 = fuelInputIndex === 2 ? funding[ordinaryInput0 ? 1 : 0] : undefined;
  const paymentFunding = payments.length > 0 ? funding.slice(ordinaryInputs) : [];

  const transaction = new Transaction();
  if (ordinary0) {
    await addFundingInputs(transaction, [ordinary0], holderKey, provider);
  } else {
    transaction.addInput({
      sourceTransaction: license.sourceTransaction,
      sourceOutputIndex: token.current.vout,
      unlockingScriptTemplate: licenseUnlock({ method, bridge, ownerKey: signingKey ?? holderKey, newOwnerPubKeyHex, blind }),
    });
  }
  if (ordinary1) await addFundingInputs(transaction, [ordinary1], holderKey, provider);
  transaction.addInput({
    sourceTransaction: license.sourceTransaction,
    sourceOutputIndex: FUEL_INDEX,
    unlockingScriptTemplate: fuelUnlock({ bridge: fuelBridge, blind: fuelBlind }),
  });
  await addFundingInputs(transaction, paymentFunding, holderKey, provider);

  const holderChange = new P2PKH().lock(holderKey.toAddress(config.network));
  if (ordinary0) {
    // No License here to recreate: the ordinary input's value goes back to the holder.
    transaction.addOutput({ lockingScript: holderChange, satoshis: ordinary0.satoshis });
  } else {
    transaction.addOutput({ lockingScript: output0, satoshis: outputSatoshis ?? TOKEN_OUTPUT_SATOSHIS });
  }
  // Output 1 holds the Fuel's own value until the fee is known.
  transaction.addOutput({ lockingScript: fuelOutputScript ?? license.fuel.lockingScript, satoshis: license.fuel.satoshis });
  transaction.addOutput({ lockingScript: dataScript, satoshis: 0 });
  addPaymentOutputs(transaction, payments);
  if (payments.length > 0) {
    const paid = payments.reduce((sum, payment) => sum + payment.satoshis, 0);
    const funded = paymentFunding.reduce((sum, utxo) => sum + utxo.satoshis, 0);
    if (funded < paid) {
      throw new Error(`Not enough satoshis to cover the ${method}'s payments: ${paid} sat to pay, ${funded} sat of fee UTXOs`);
    }
    if (funded > paid) transaction.addOutput({ lockingScript: holderChange, satoshis: funded - paid });
  }

  const fee = await new SatoshisPerKilobyte(config.feeRateSatPerKb).computeFee(transaction);
  if (fuelOutputOverride === undefined && fee > fuelBridge.feeCapSatoshis) {
    throw new FuelFeeCapExceededError(fee, fuelBridge.feeCapSatoshis);
  }
  const fuelOutput = fuelOutputOverride ?? license.fuel.satoshis - fee;
  if (fuelOutput < 1) {
    throw new Error(`The Fuel holds ${license.fuel.satoshis} sat, too little for this ${method}'s ${fee} sat fee`);
  }
  transaction.outputs[FUEL_INDEX].satoshis = fuelOutput;
  await transaction.sign();

  return { transaction, spentOutpoints: inputOutpoints(transaction) };
}

function built(transaction: Transaction, spentOutpoints: Outpoint[], token: LicenseToken): BuiltContractTransaction {
  const txid = transaction.id('hex');
  return { transaction, hex: transaction.toHex(), txid, spentOutpoints, token: { ...token, current: { txid, vout: 0 } } };
}

function typedRecord(recordType: TypedRecordType, value: object): LockingScript {
  return encodeTypedRecordScript(recordType, jsonBytes(value)); // throws over the 10 KB payload cap
}

export interface BuildContractTokenRecordTransactionParams {
  holderKey: string; // current owner's WIF
  token: LicenseToken;
  /** The holder's coin, for a step 2 token only: a License + Fuel token's write pays from its Fuel, with no holder coin. */
  feeUtxos?: Utxo[];
  payload: RecordWithTokenPayload;
  config: ChainConfig;
  provider: ChainProvider;
}

/** buildContractTokenRecordTransaction, with the holder's coin fetched only if the step 2 path needs it. */
async function buildContractWrite(
  params: Omit<BuildContractTokenRecordTransactionParams, 'feeUtxos'>,
  feeUtxos: FeeUtxoSource,
): Promise<BuiltContractTransaction> {
  const { holderKey, token, payload, config, provider } = params;
  assertTokenLock(token, 'license');

  const bridges = await loadBridgesFor(token);
  const key = PrivateKey.fromWif(holderKey);
  const license = await spendableLicense(bridges, token, key, config, provider);
  const spend = {
    method: 'write' as const,
    bridge: bridges.license,
    holderKey: key,
    token,
    output0: LockingScript.fromHex(bridges.license.nextLockingScript(license.lockingScriptHex)),
    dataScript: typedRecord('W', { text: payload.text, ts: payload.ts }),
    payments: [],
    config,
    provider,
  };

  if (license.path === 'fuel') {
    const { transaction, spentOutpoints } = await buildFuelSpend({ ...spend, fuelBridge: bridges.fuel, license, feeUtxos });
    assertVerifies(bridges.license, transaction);
    assertFuelVerifies(bridges.fuel, transaction);
    return built(transaction, spentOutpoints, token);
  }
  const { transaction, spentOutpoints } = await buildLicenseSpend({ ...spend, license, feeUtxos: await feeUtxos() });
  assertVerifies(bridges.license, transaction);
  return built(transaction, spentOutpoints, token);
}

/**
 * Builds a signed write-with-token through the License's `write`: input 0 spends
 * token.current; exactly three outputs: the License recreated to the same owner, the Fuel,
 * a type-W Data output. A License + Fuel token spends its Fuel at input 1 and pays the fee
 * from it (feeUtxos unused); a step 2 token funds the write from feeUtxos, the stand-in
 * taking the change. Refuses a token not locked by 'license' with TokenLockMismatchError and
 * one minted under another artifact with ContractVersionMismatchError, and checks the built
 * spend locally.
 */
export async function buildContractTokenRecordTransaction(
  params: BuildContractTokenRecordTransactionParams,
): Promise<BuiltContractTransaction> {
  const { feeUtxos = [], ...rest } = params;
  return buildContractWrite(rest, async () => feeUtxos);
}

export interface BuildContractSpendVariantParams {
  holderKey: string; // the token's real owner: WIF; funds the spend and satisfies the License's ownership and Fuel checks
  token: LicenseToken;
  feeUtxos: Utxo[];
  payload: RecordWithTokenPayload;
  /** Exercises rule (d): the key that actually signs input 0, when it differs from holderKey. */
  signerKey?: string;
  /** Exercises rule (c): the owner key baked into output 0's rebuilt state, when it differs from holderKey's own. */
  output0OwnerPubKeyHex?: string;
  /** Exercises rule (b): output 0's satoshis, when different from 1. */
  outputSatoshis?: number;
  /** Exercises rule (f): extra P2PKH outputs appended after the Data output. */
  extraOutputs?: { address: string; satoshis: number }[];
  /** License + Fuel token only. Exercises Fuel's value rule: output 1's satoshis, e.g. under own − FEE_CAP. */
  fuelOutputSatoshis?: number;
  /** License + Fuel token only. Exercises FB-1: input 0 is feeUtxos[0], an ordinary outpoint, and the License is not spent. */
  ordinaryInput0?: boolean;
  /** License + Fuel token only. Exercises "output 1 is this Fuel(C)" (and the License's rule (f)): output 1's script. */
  fuelOutputScriptHex?: string;
  /** License + Fuel token only. Exercises "the Fuel is input 1": 2 puts it behind feeUtxos[0], whose value becomes fee. */
  fuelInputIndex?: 1 | 2;
  config: ChainConfig;
  provider: ChainProvider;
}

/**
 * Builds a write spend of a real License token like buildContractTokenRecordTransaction,
 * but with each of the License's negative rules (b), (c), (d) and (f), and for a License +
 * Fuel token each of Fuel(C)'s (value, FB-1, output script, input index), independently
 * overridable, and WITHOUT checking the result locally — the caller does that itself
 * (verifyLicenseInput, verifyFuelInput), and decides whether to broadcast it. For exercising
 * the contracts' rejection paths against a real token (mw-5wuz6.6, mw-yo97u.3); never used
 * by production code, which always verifies before broadcasting.
 */
export async function buildContractSpendVariant(params: BuildContractSpendVariantParams): Promise<BuiltContractTransaction> {
  const {
    holderKey,
    token,
    feeUtxos,
    payload,
    signerKey,
    output0OwnerPubKeyHex,
    outputSatoshis,
    extraOutputs = [],
    fuelOutputSatoshis,
    ordinaryInput0,
    fuelOutputScriptHex,
    fuelInputIndex,
    config,
    provider,
  } = params;
  assertTokenLock(token, 'license');

  const bridges = await loadBridgesFor(token);
  const key = PrivateKey.fromWif(holderKey);
  const signingKey = signerKey ? PrivateKey.fromWif(signerKey) : undefined;
  const license = await spendableLicense(bridges, token, key, config, provider);
  const fuelOverrides: FuelSpendOverrides = {
    outputSatoshis: fuelOutputSatoshis,
    outputScript: fuelOutputScriptHex === undefined ? undefined : LockingScript.fromHex(fuelOutputScriptHex),
    inputIndex: fuelInputIndex,
    ordinaryInput0,
  };
  const fuelOverridden = Object.values(fuelOverrides).some((value) => value !== undefined);

  const spend = {
    method: 'write' as const,
    bridge: bridges.license,
    holderKey: key,
    signingKey,
    token,
    output0: LockingScript.fromHex(bridges.license.nextLockingScript(license.lockingScriptHex, output0OwnerPubKeyHex)),
    outputSatoshis,
    dataScript: typedRecord('W', { text: payload.text, ts: payload.ts }),
    payments: extraOutputs,
    config,
    provider,
  };

  if (license.path === 'fuel') {
    const { transaction, spentOutpoints } = await buildFuelSpend({
      ...spend,
      fuelBridge: bridges.fuel,
      license,
      feeUtxos: async () => feeUtxos,
      // The License's own assertions throw while building on a wrong signer (see below) and
      // on output 1's script (rule (f)); the Fuel's on any Fuel override.
      blind: signingKey !== undefined || fuelOverrides.outputScript !== undefined,
      fuelBlind: fuelOverridden,
      fuelOverrides,
    });
    return built(transaction, spentOutpoints, token);
  }

  if (fuelOverridden) {
    throw new Error('The Fuel overrides need a License + Fuel token; this is a step 2 token (the P2PKH stand-in)');
  }
  const { transaction, spentOutpoints } = await buildLicenseSpend({
    ...spend,
    license,
    feeUtxos,
    // A wrong signer is the only override the contract's own assertions don't already
    // catch while building (rules b, c and f are all one assertion over the exact rebuilt
    // output list — see license.ts's write()): without blind, the signature check inside
    // that same method call throws here too, and there is never a transaction to hand to
    // verifyLicenseInput or broadcast.
    blind: signingKey !== undefined,
  });
  return built(transaction, spentOutpoints, token);
}

export interface BuildContractTransferTransactionParams {
  holderKey: string; // current owner's WIF
  token: LicenseToken;
  /** The seller's coin: a step 2 token's fee, or a License + Fuel token's payments (its fee comes from the Fuel). */
  feeUtxos?: Utxo[];
  toPubKey: string; // the buyer's owner key (compressed, hex)
  /** Outputs after the Data output (payment, the buyer's change); none by default. */
  payments?: { address: string; satoshis: number }[];
  config: ChainConfig;
  provider: ChainProvider;
}

/** buildContractTransferTransaction, with the holder's coin fetched only if the build needs it. */
async function buildContractTransfer(
  params: Omit<BuildContractTransferTransactionParams, 'feeUtxos'>,
  feeUtxos: FeeUtxoSource,
): Promise<BuiltContractTransaction> {
  const { holderKey, token, toPubKey, payments = [], config, provider } = params;
  assertTokenLock(token, 'license');

  const bridges = await loadBridgesFor(token);
  const key = PrivateKey.fromWif(holderKey);
  const newOwner = parsePublicKey(toPubKey, 'recipient');
  const toAddress = newOwner.toAddress(config.network);
  const license = await spendableLicense(bridges, token, key, config, provider);
  const spend = {
    method: 'transfer' as const,
    bridge: bridges.license,
    holderKey: key,
    token,
    output0: LockingScript.fromHex(bridges.license.nextLockingScript(license.lockingScriptHex, newOwner.toString())),
    dataScript: typedRecord('TR', { to: toAddress }),
    payments,
    newOwnerPubKeyHex: newOwner.toString(),
    config,
    provider,
  };
  const transferred = { ...token, holderAddress: toAddress };

  if (license.path === 'fuel') {
    const { transaction, spentOutpoints } = await buildFuelSpend({ ...spend, fuelBridge: bridges.fuel, license, feeUtxos });
    assertVerifies(bridges.license, transaction);
    assertFuelVerifies(bridges.fuel, transaction);
    return built(transaction, spentOutpoints, transferred);
  }
  const { transaction, spentOutpoints } = await buildLicenseSpend({ ...spend, license, feeUtxos: await feeUtxos() });
  assertVerifies(bridges.license, transaction);
  return built(transaction, spentOutpoints, transferred);
}

/**
 * Builds a signed transfer through the License's `transfer`: input 0 spends token.current;
 * outputs: the License recreated to toPubKey, the Fuel, a type-TR Data output naming the
 * buyer's address, then any payments. A License + Fuel token spends its Fuel at input 1 and
 * pays the fee from it; feeUtxos then fund only the payments (inputs 2+, the change after
 * the payments). A step 2 token funds the fee from feeUtxos, the stand-in taking the
 * seller's change. Refuses a token not locked by 'license' with TokenLockMismatchError and
 * one minted under another artifact with ContractVersionMismatchError, and checks the built
 * spend locally.
 */
export async function buildContractTransferTransaction(
  params: BuildContractTransferTransactionParams,
): Promise<BuiltContractTransaction> {
  const { feeUtxos = [], ...rest } = params;
  return buildContractTransfer(rest, async () => feeUtxos);
}

export interface MintContractLicenseTokenParams {
  issuerKey: string; // issuer WIF; single-install: also the holder, so the License locks to this key's own pubkey
  provider: ChainProvider;
  /** Its mintFuelSatoshis is the mint's MINT_FUEL: the mint is refused while it is unset. */
  config: ChainConfig;
  eventBus: EventBus;
  pendingSpendRepo: PendingSpendRepository;
}

/**
 * Fetches the issuer's UTXOs, reconciles them against the app's own pending spends
 * (mw-b00z.11), mints a token whose 1-sat output is the License covenant locked to the
 * issuer's own key, with Fuel(C) at config.mintFuelSatoshis, broadcasts once, records the
 * spent outpoints as a pending spend, and emits 'bsv:token-minted'. The screen's
 * contract-lock counterpart to mintLicenseToken.
 */
export async function mintContractLicenseToken(params: MintContractLicenseTokenParams): Promise<LicenseToken> {
  const { issuerKey, provider, config, eventBus, pendingSpendRepo } = params;

  const issuer = PrivateKey.fromWif(issuerKey);
  const issuerAddress = issuer.toAddress(config.network);
  const holderPubKey = issuer.toPublicKey().toString();
  const rawUtxos = await provider.getUtxos(issuerAddress);

  const pendingEntries = await pendingSpendRepo.getAll();
  const { remaining, dropped } = reconcilePendingSpends(pendingEntries, rawUtxos, new Date());
  if (dropped.length > 0) {
    await pendingSpendRepo.removeMany(dropped);
  }
  const { utxos } = filterUtxosExcludingPending(rawUtxos, remaining);

  let mintBuilt: BuiltContractTransaction;
  try {
    mintBuilt = await buildContractMintTransaction({
      issuerKey,
      utxos,
      holderPubKey,
      mintFuelSatoshis: config.mintFuelSatoshis,
      config,
      provider,
    });
  } catch (error) {
    throw describePendingShortfall(error, rawUtxos, remaining);
  }

  const txid = await provider.broadcast(mintBuilt.hex);

  await pendingSpendRepo.add({
    txid,
    outpoints: mintBuilt.spentOutpoints.map(outpointKey),
    createdAt: new Date(),
  });

  const origin: Outpoint = { txid, vout: 0 };
  const token: LicenseToken = { ...mintBuilt.token, origin, current: origin };

  eventBus.emit({ type: 'bsv:token-minted', payload: { txid, origin } });

  return token;
}

/**
 * The holder's fee UTXOs, fetched and reconciled against pending spends (mw-b00z.11) only
 * when a build asks for them; `describe` rewrites a build failure the way
 * describePendingShortfall does, once they were fetched.
 */
function holderFeeUtxos(address: string, provider: ChainProvider, pendingSpendRepo: PendingSpendRepository) {
  let fetched: { rawUtxos: Utxo[]; remaining: PendingSpendEntry[] } | undefined;
  return {
    load: async (): Promise<Utxo[]> => {
      const rawUtxos = await provider.getUtxos(address);
      const pendingEntries = await pendingSpendRepo.getAll();
      const { remaining, dropped } = reconcilePendingSpends(pendingEntries, rawUtxos, new Date());
      if (dropped.length > 0) {
        await pendingSpendRepo.removeMany(dropped);
      }
      fetched = { rawUtxos, remaining };
      return filterUtxosExcludingPending(rawUtxos, remaining).utxos;
    },
    describe: (error: unknown): unknown => (fetched ? describePendingShortfall(error, fetched.rawUtxos, fetched.remaining) : error),
  };
}

export interface WriteWithContractTokenParams {
  holderKey: string; // current owner's WIF
  token: LicenseToken;
  payload: RecordWithTokenPayload;
  provider: ChainProvider;
  config: ChainConfig;
  eventBus: EventBus;
  repository: TokenRepository;
  pendingSpendRepo: PendingSpendRepository;
}

export interface WriteWithContractTokenResult {
  txid: string;
}

/**
 * Writes a record through the License's `write`, broadcasts once, records the spend, moves
 * the repository's current outpoint, and emits 'bsv:record-written'. A License + Fuel token
 * pays from its Fuel, so only token.current's transaction is fetched; a step 2 token also
 * fetches the holder's fee UTXOs, reconciled against pending spends (mw-b00z.11). The
 * screen's contract-lock counterpart to writeWithToken.
 */
export async function writeWithContractToken(params: WriteWithContractTokenParams): Promise<WriteWithContractTokenResult> {
  const { holderKey, token, payload, provider, config, eventBus, repository, pendingSpendRepo } = params;

  const holderAddress = PrivateKey.fromWif(holderKey).toAddress(config.network);
  const feeUtxos = holderFeeUtxos(holderAddress, provider, pendingSpendRepo);

  let writeBuilt: BuiltContractTransaction;
  try {
    writeBuilt = await buildContractWrite({ holderKey, token, payload, config, provider }, feeUtxos.load);
  } catch (error) {
    throw feeUtxos.describe(error);
  }

  const txid = await provider.broadcast(writeBuilt.hex);

  await pendingSpendRepo.add({
    txid,
    outpoints: writeBuilt.spentOutpoints.map(outpointKey),
    createdAt: new Date(),
  });

  const current: Outpoint = { txid, vout: 0 };
  await repository.updateCurrent(token.origin, current, token.holderAddress);

  eventBus.emit({
    type: 'bsv:record-written',
    payload: { txid, origin: `${token.origin.txid}:${token.origin.vout}` },
  });

  return { txid };
}

export interface TransferContractTokenParams {
  holderKey: string; // current owner's WIF
  token: LicenseToken;
  toPubKey: string; // the buyer's owner key (compressed, hex)
  payments?: { address: string; satoshis: number }[];
  provider: ChainProvider;
  config: ChainConfig;
  eventBus: EventBus;
  repository: TokenRepository;
  pendingSpendRepo: PendingSpendRepository;
}

export interface TransferContractTokenResult {
  txid: string;
}

/**
 * Transfers the token through the License's `transfer` to the buyer's own key, broadcasts
 * once, records the spend, moves the repository's current outpoint and holder, and emits
 * 'bsv:token-transferred'. The holder's fee UTXOs (reconciled against pending spends,
 * mw-b00z.11) are fetched only for a step 2 token or for payments. The screen's
 * contract-lock counterpart to transferLicenseToken.
 */
export async function transferContractToken(params: TransferContractTokenParams): Promise<TransferContractTokenResult> {
  const { holderKey, token, toPubKey, payments = [], provider, config, eventBus, repository, pendingSpendRepo } = params;

  const holderAddress = PrivateKey.fromWif(holderKey).toAddress(config.network);
  const feeUtxos = holderFeeUtxos(holderAddress, provider, pendingSpendRepo);

  let transferBuilt: BuiltContractTransaction;
  try {
    transferBuilt = await buildContractTransfer({ holderKey, token, toPubKey, payments, config, provider }, feeUtxos.load);
  } catch (error) {
    throw feeUtxos.describe(error);
  }

  const txid = await provider.broadcast(transferBuilt.hex);

  await pendingSpendRepo.add({
    txid,
    outpoints: transferBuilt.spentOutpoints.map(outpointKey),
    createdAt: new Date(),
  });

  const current: Outpoint = { txid, vout: 0 };
  await repository.updateCurrent(token.origin, current, transferBuilt.token.holderAddress);

  eventBus.emit({
    type: 'bsv:token-transferred',
    payload: { txid, origin: token.origin, to: transferBuilt.token.holderAddress },
  });

  return { txid };
}
