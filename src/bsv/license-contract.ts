// src/bsv/license-contract.ts — Contract-locked License Token builders (mw-5wuz6.3): the
// mint, write-with-token and transfer transactions of license-token.ts with the token's
// 1-sat output locked by the License covenant (src/bsv/contracts/license.ts, spec §3.7)
// instead of a P2PKH. @bsv/sdk builds, funds and signs the transaction; the License's
// locking script and input 0's unlocking script come from the scrypt-ts side
// (contracts/bridge/license-bridge.ts) as raw hex, loaded lazily so the app's main chunk
// carries no scrypt-ts.
//
// Output layout, rule (f): [0] the License, 1 sat; [1] the Fuel stand-in, a P2PKH to the
// holder carrying the change, whose hash256 is the fuelScriptHash the License was
// constructed with (so the License binds it) until the Fuel contract exists; [2] the Data
// output (record type M, W or TR); a transfer may add payment outputs after. Funding
// inputs are P2PKH, at index 1 and later when input 0 spends the License.

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
  type PendingSpendRepository,
} from './pending-spends';
import { encodeTypedRecordScript, type TypedRecordType } from './record';

export type { LicenseState, LicenseVerifyResult } from './contracts/bridge/license-bridge-types';

const TOKEN_OUTPUT_SATOSHIS = 1;
const SIGHASH_ALL_FORKID = TransactionSignature.SIGHASH_ALL | TransactionSignature.SIGHASH_FORKID;

// A lazy glob rather than a bare import(): Vite still gives the bridge (and scrypt-ts) its
// own chunk, loaded on first use, but the app's tsc does not follow it into license.ts,
// whose legacy decorators only tsconfig.contracts-test.json compiles.
const BRIDGE_MODULE = './contracts/bridge/license-bridge.ts';
const bridgeLoaders = import.meta.glob<LicenseBridgeModule>('./contracts/bridge/license-bridge.ts');

let bridgePromise: Promise<LicenseBridge> | undefined;

function loadLicenseBridge(): Promise<LicenseBridge> {
  bridgePromise ??= bridgeLoaders[BRIDGE_MODULE]().then(
    (module) => module.licenseBridge,
    (error: unknown) => {
      bridgePromise = undefined;
      throw error;
    },
  );
  return bridgePromise;
}

/** The owner key, collection and Fuel script hash a License locking script carries. */
export async function readLicenseState(lockingScriptHex: string): Promise<LicenseState> {
  return (await loadLicenseBridge()).readLockingScript(lockingScriptHex);
}

/** Runs input `inputIndex` (a License spend) through the committed artifact's script, locally. */
export async function verifyLicenseInput(transaction: Transaction, inputIndex = 0): Promise<LicenseVerifyResult> {
  const bridge = await loadLicenseBridge();
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

/** Bytes of a data push of n bytes, its opcode (and length) included. */
function pushLength(n: number): number {
  return n + (n < 76 ? 1 : n < 256 ? 2 : n < 65536 ? 3 : 5);
}

function varIntLength(n: number): number {
  return n < 0xfd ? 1 : n <= 0xffff ? 3 : 5;
}

interface LicenseUnlockOptions {
  method: 'write' | 'transfer';
  bridge: LicenseBridge;
  ownerKey: PrivateKey;
  newOwnerPubKeyHex?: string;
}

/**
 * Input 0's unlocking template. @bsv/sdk formats the SIGHASH_ALL|FORKID preimage and signs
 * it with the owner key, exactly as its own P2PKH template does; the bridge checks the
 * preimage is the one the License's Push TX will see, then builds the method call around
 * the signature. Called by transaction.sign(), after fee() has fixed the change.
 */
function licenseUnlock({ method, bridge, ownerKey, newOwnerPubKeyHex }: LicenseUnlockOptions) {
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
      const preimageLength = 156 + varIntLength(scriptLength) + scriptLength;
      let length =
        pushLength(73) +
        pushLength(outputScriptLength(1)) +
        pushLength(9) +
        pushLength(outputScriptLength(2)) +
        pushLength(preimageLength) +
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

/** Throws a named error if the built License spend would fail the committed artifact's script. */
function assertVerifies(bridge: LicenseBridge, transaction: Transaction): void {
  const { lockingScript, satoshis } = sourceOutput(transaction, 0);
  const { success, error } = bridge.verifyInput(transaction.toHex(), 0, lockingScript.toHex(), satoshis);
  if (!success) {
    throw new Error(`The built License spend fails local verification against artifact ${bridge.artifactVersion}: ${error}`);
  }
}

export interface BuildContractMintTransactionParams {
  issuerKey: string; // issuer WIF: signs the funding inputs
  utxos: Utxo[];
  holderPubKey: string; // the owner key the License locks to (compressed, hex)
  config: ChainConfig;
  provider: ChainProvider;
}

/**
 * Builds a signed mint: [0] a 1-sat License owned by holderPubKey, [1] the Fuel stand-in
 * (a P2PKH to the holder, carrying the change), [2] a type-M Data output. Funding inputs
 * only; never a 1-satoshi UTXO (spec R4.1.1), so output 0 is a fresh origin.
 */
export async function buildContractMintTransaction(params: BuildContractMintTransactionParams): Promise<BuiltContractTransaction> {
  const { issuerKey, utxos, holderPubKey, config, provider } = params;

  if (utxos.length === 0) {
    throw new Error('No UTXOs available — fund the issuer wallet before minting');
  }
  const eligibleUtxos = selectFeeUtxos(utxos, { exclude: [] });

  const issuer = PrivateKey.fromWif(issuerKey);
  const holder = parsePublicKey(holderPubKey, 'holder');
  const holderAddress = holder.toAddress(config.network);
  const fuelScript = new P2PKH().lock(holderAddress);

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
  transaction.addOutput({ lockingScript: fuelScript, change: true });
  transaction.addOutput({
    lockingScript: encodeTypedRecordScript('M', jsonBytes({ collection: config.collectionId, holder: holderAddress })),
    satoshis: 0,
  });

  await transaction.fee(new SatoshisPerKilobyte(config.feeRateSatPerKb));
  if (transaction.outputs.length < 3) {
    throw new Error('Not enough satoshis to mint a token and cover the fee');
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
    },
  };
}

interface SpendableLicense {
  sourceTransaction: Transaction;
  lockingScriptHex: string;
  fuelScript: LockingScript;
}

/**
 * Reads the License at token.current and checks, with a named error for each, that this
 * build's artifact locked it, the key is its owner, and the Fuel stand-in (a P2PKH to this
 * holder) is the script the License binds, so the spend cannot fail verification for those.
 */
async function spendableLicense(
  bridge: LicenseBridge,
  token: LicenseToken,
  holderKey: PrivateKey,
  config: ChainConfig,
  provider: ChainProvider,
): Promise<SpendableLicense> {
  if (token.artifact !== bridge.artifactVersion) {
    throw new Error(`This token was locked by License artifact ${token.artifact}; this build carries ${bridge.artifactVersion}`);
  }

  const sourceTransaction = Transaction.fromHex(await provider.getTransactionHex(token.current.txid));
  const output = sourceTransaction.outputs[token.current.vout];
  if (!output || output.satoshis !== TOKEN_OUTPUT_SATOSHIS) {
    throw new Error(`token.current ${token.current.txid}:${token.current.vout} is not a 1-satoshi output`);
  }
  const lockingScriptHex = output.lockingScript.toHex();
  const state = bridge.readLockingScript(lockingScriptHex);

  const holderPubKeyHex = holderKey.toPublicKey().toString();
  if (state.ownerPubKeyHex !== holderPubKeyHex) {
    throw new Error(`Key ${holderPubKeyHex} is not this License's owner (${state.ownerPubKeyHex})`);
  }

  const fuelScript = new P2PKH().lock(holderKey.toAddress(config.network));
  if (hash256Hex(fuelScript) !== state.fuelScriptHashHex) {
    throw new Error(
      "This License's Fuel stand-in is not a P2PKH to this holder's key: the stand-in binds the minting holder's key, " +
        'so a later holder cannot spend it until the Fuel contract replaces the stand-in',
    );
  }

  return { sourceTransaction, lockingScriptHex, fuelScript };
}

interface LicenseSpendParams {
  method: 'write' | 'transfer';
  bridge: LicenseBridge;
  holderKey: PrivateKey;
  token: LicenseToken;
  license: SpendableLicense;
  feeUtxos: Utxo[];
  output0: LockingScript;
  dataScript: LockingScript;
  payments: { address: string; satoshis: number }[];
  newOwnerPubKeyHex?: string;
  config: ChainConfig;
  provider: ChainProvider;
}

/** The layout write and transfer share: License in at 0, funding after; License, Fuel, Data out, payments after. */
async function buildLicenseSpend(params: LicenseSpendParams): Promise<{ transaction: Transaction; spentOutpoints: Outpoint[] }> {
  const { method, bridge, holderKey, token, license, feeUtxos, output0, dataScript, payments, newOwnerPubKeyHex, config, provider } =
    params;

  const eligibleFeeUtxos = selectFeeUtxos(feeUtxos, { exclude: [] });
  if (eligibleFeeUtxos.length === 0) {
    throw new Error(`No fee UTXOs available — fund this wallet before ${method === 'write' ? 'writing a record' : 'transferring'}`);
  }

  const transaction = new Transaction();
  transaction.addInput({
    sourceTransaction: license.sourceTransaction,
    sourceOutputIndex: token.current.vout,
    unlockingScriptTemplate: licenseUnlock({ method, bridge, ownerKey: holderKey, newOwnerPubKeyHex }),
  });
  await addFundingInputs(transaction, eligibleFeeUtxos, holderKey, provider);

  transaction.addOutput({ lockingScript: output0, satoshis: TOKEN_OUTPUT_SATOSHIS });
  transaction.addOutput({ lockingScript: license.fuelScript, change: true });
  transaction.addOutput({ lockingScript: dataScript, satoshis: 0 });
  for (const payment of payments) {
    try {
      transaction.addP2PKHOutput(payment.address, payment.satoshis);
    } catch {
      throw new Error(`Invalid payment address: ${payment.address}`);
    }
  }

  await transaction.fee(new SatoshisPerKilobyte(config.feeRateSatPerKb));
  if (transaction.outputs.length < 3 + payments.length) {
    throw new Error(`Not enough satoshis to cover the ${method} and fee`);
  }
  await transaction.sign();
  assertVerifies(bridge, transaction);

  return {
    transaction,
    spentOutpoints: [token.current, ...eligibleFeeUtxos.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout }))],
  };
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
  feeUtxos: Utxo[];
  payload: RecordWithTokenPayload;
  config: ChainConfig;
  provider: ChainProvider;
}

/**
 * Builds a signed write-with-token through the License's `write`: input 0 spends
 * token.current, funding inputs follow; exactly three outputs: the License recreated to the
 * same owner, the Fuel stand-in with the change, a type-W Data output. Refuses a token not
 * locked by 'license' with TokenLockMismatchError, and checks the built spend locally.
 */
export async function buildContractTokenRecordTransaction(
  params: BuildContractTokenRecordTransactionParams,
): Promise<BuiltContractTransaction> {
  const { holderKey, token, feeUtxos, payload, config, provider } = params;
  assertTokenLock(token, 'license');

  const key = PrivateKey.fromWif(holderKey);
  const bridge = await loadLicenseBridge();
  const license = await spendableLicense(bridge, token, key, config, provider);

  const { transaction, spentOutpoints } = await buildLicenseSpend({
    method: 'write',
    bridge,
    holderKey: key,
    token,
    license,
    feeUtxos,
    output0: LockingScript.fromHex(bridge.nextLockingScript(license.lockingScriptHex)),
    dataScript: typedRecord('W', { text: payload.text, ts: payload.ts }),
    payments: [],
    config,
    provider,
  });
  return built(transaction, spentOutpoints, token);
}

export interface BuildContractTransferTransactionParams {
  holderKey: string; // current owner's WIF
  token: LicenseToken;
  feeUtxos: Utxo[];
  toPubKey: string; // the buyer's owner key (compressed, hex)
  /** Outputs after the Data output (payment, the buyer's change); none by default. */
  payments?: { address: string; satoshis: number }[];
  config: ChainConfig;
  provider: ChainProvider;
}

/**
 * Builds a signed transfer through the License's `transfer`: input 0 spends token.current,
 * funding inputs follow; outputs: the License recreated to toPubKey, the Fuel stand-in with
 * the seller's change, a type-TR Data output naming the buyer's address, then any payments.
 * Refuses a token not locked by 'license' with TokenLockMismatchError, and checks the built
 * spend locally.
 */
export async function buildContractTransferTransaction(
  params: BuildContractTransferTransactionParams,
): Promise<BuiltContractTransaction> {
  const { holderKey, token, feeUtxos, toPubKey, payments = [], config, provider } = params;
  assertTokenLock(token, 'license');

  const key = PrivateKey.fromWif(holderKey);
  const newOwner = parsePublicKey(toPubKey, 'recipient');
  const toAddress = newOwner.toAddress(config.network);
  const bridge = await loadLicenseBridge();
  const license = await spendableLicense(bridge, token, key, config, provider);

  const { transaction, spentOutpoints } = await buildLicenseSpend({
    method: 'transfer',
    bridge,
    holderKey: key,
    token,
    license,
    feeUtxos,
    output0: LockingScript.fromHex(bridge.nextLockingScript(license.lockingScriptHex, newOwner.toString())),
    dataScript: typedRecord('TR', { to: toAddress }),
    payments,
    newOwnerPubKeyHex: newOwner.toString(),
    config,
    provider,
  });
  return built(transaction, spentOutpoints, { ...token, holderAddress: toAddress });
}

export interface MintContractLicenseTokenParams {
  issuerKey: string; // issuer WIF; single-install: also the holder, so the License locks to this key's own pubkey
  provider: ChainProvider;
  config: ChainConfig;
  eventBus: EventBus;
  pendingSpendRepo: PendingSpendRepository;
}

/**
 * Fetches the issuer's UTXOs, reconciles them against the app's own pending spends
 * (mw-b00z.11), mints a token whose 1-sat output is the License covenant locked to the
 * issuer's own key, broadcasts once, records the spent outpoints as a pending spend, and
 * emits 'bsv:token-minted'. The screen's contract-lock counterpart to mintLicenseToken.
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
    mintBuilt = await buildContractMintTransaction({ issuerKey, utxos, holderPubKey, config, provider });
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
 * Fetches the holder's fee UTXOs, reconciles them against pending spends (mw-b00z.11),
 * writes a record through the License's `write`, broadcasts once, records the spend,
 * moves the repository's current outpoint, and emits 'bsv:record-written'. The screen's
 * contract-lock counterpart to writeWithToken.
 */
export async function writeWithContractToken(params: WriteWithContractTokenParams): Promise<WriteWithContractTokenResult> {
  const { holderKey, token, payload, provider, config, eventBus, repository, pendingSpendRepo } = params;

  const holderAddress = PrivateKey.fromWif(holderKey).toAddress(config.network);
  const rawFeeUtxos = await provider.getUtxos(holderAddress);

  const pendingEntries = await pendingSpendRepo.getAll();
  const { remaining, dropped } = reconcilePendingSpends(pendingEntries, rawFeeUtxos, new Date());
  if (dropped.length > 0) {
    await pendingSpendRepo.removeMany(dropped);
  }
  const { utxos: feeUtxos } = filterUtxosExcludingPending(rawFeeUtxos, remaining);

  let writeBuilt: BuiltContractTransaction;
  try {
    writeBuilt = await buildContractTokenRecordTransaction({ holderKey, token, feeUtxos, payload, config, provider });
  } catch (error) {
    throw describePendingShortfall(error, rawFeeUtxos, remaining);
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
 * Fetches the holder's fee UTXOs, reconciles them against pending spends (mw-b00z.11),
 * transfers the token through the License's `transfer` to the buyer's own key, broadcasts
 * once, records the spend, moves the repository's current outpoint and holder, and emits
 * 'bsv:token-transferred'. The screen's contract-lock counterpart to transferLicenseToken.
 */
export async function transferContractToken(params: TransferContractTokenParams): Promise<TransferContractTokenResult> {
  const { holderKey, token, toPubKey, payments = [], provider, config, eventBus, repository, pendingSpendRepo } = params;

  const holderAddress = PrivateKey.fromWif(holderKey).toAddress(config.network);
  const rawFeeUtxos = await provider.getUtxos(holderAddress);

  const pendingEntries = await pendingSpendRepo.getAll();
  const { remaining, dropped } = reconcilePendingSpends(pendingEntries, rawFeeUtxos, new Date());
  if (dropped.length > 0) {
    await pendingSpendRepo.removeMany(dropped);
  }
  const { utxos: feeUtxos } = filterUtxosExcludingPending(rawFeeUtxos, remaining);

  let transferBuilt: BuiltContractTransaction;
  try {
    transferBuilt = await buildContractTransferTransaction({ holderKey, token, feeUtxos, toPubKey, payments, config, provider });
  } catch (error) {
    throw describePendingShortfall(error, rawFeeUtxos, remaining);
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
