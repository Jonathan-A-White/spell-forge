// src/bsv/license-token.ts — Mints a 1-satoshi License Token ordinal with a same-tx mint
// record (spec §3.1, §4.1). Phase 2: no contract script yet, just the mint transaction
// shape and the origin bookkeeping every later phase builds on.

import { P2PKH, PrivateKey, SatoshisPerKilobyte, Transaction, Utils } from '@bsv/sdk';
import type { EventBus, Utxo } from '../contracts/types';
import type { ChainConfig } from './config';
import type { ChainProvider } from './chain-provider';
import {
  encodeRecordScript,
  type MintRecordPayload,
  type TransferRecordPayload,
  type WriteRecordPayload,
} from './record';
import {
  outpointKey,
  selectFeeUtxos,
  reconcilePendingSpends,
  filterUtxosExcludingPending,
  describePendingShortfall,
  type PendingSpendRepository,
} from './pending-spends';

const TOKEN_OUTPUT_SATOSHIS = 1;

export interface Outpoint {
  txid: string;
  vout: number;
}

/** What locks the token's 1-sat output: a plain P2PKH, or the License contract (mw-5wuz6.3). */
export type TokenLock = 'p2pkh' | 'license';

export interface LicenseToken {
  origin: Outpoint;
  current: Outpoint;
  holderAddress: string;
  collectionId: string;
  lock: TokenLock;
  /** lock 'license' only: the md5 of the committed License artifact that locked it. */
  artifact?: string;
  /** A License + Fuel token only (mw-yo97u.3): the md5 of the committed Fuel artifact its Fuel(C) was minted from. */
  fuelArtifact?: string;
}

/** A write or transfer builder was handed a token locked some other way than the one it spends. */
export class TokenLockMismatchError extends Error {
  readonly lock: TokenLock;
  readonly expected: TokenLock;

  constructor(lock: TokenLock, expected: TokenLock) {
    super(`This token is locked by '${lock}'; this builder spends '${expected}' tokens`);
    this.name = 'TokenLockMismatchError';
    this.lock = lock;
    this.expected = expected;
  }
}

/** Throws TokenLockMismatchError unless the token's lock is the one the builder spends. */
export function assertTokenLock(token: LicenseToken, expected: TokenLock): void {
  if (token.lock !== expected) throw new TokenLockMismatchError(token.lock, expected);
}

function encodeMintPayload(payload: MintRecordPayload): number[] {
  return Utils.toArray(JSON.stringify(payload), 'utf8');
}

function encodeTransferPayload(payload: TransferRecordPayload): number[] {
  return Utils.toArray(JSON.stringify(payload), 'utf8');
}

function encodeWritePayload(payload: WriteRecordPayload): number[] {
  return Utils.toArray(JSON.stringify(payload), 'utf8');
}

export interface BuildMintTransactionParams {
  issuerKey: string; // issuer WIF, also the holder key for a single-install mint
  utxos: Utxo[];
  holderAddress: string;
  config: ChainConfig;
  provider: ChainProvider;
}

export interface BuiltMintTransaction {
  transaction: Transaction;
  hex: string;
  txid: string;
  spentOutpoints: Outpoint[];
}

/**
 * Builds a signed mint transaction with three outputs: the 1-sat License Token to the
 * holder, change back to the issuer, and the mint record (0 sat). Never spends a
 * 1-satoshi UTXO as an input (spec R4.1.1), so the token gets a fresh BRC-159 origin.
 */
export async function buildMintTransaction(params: BuildMintTransactionParams): Promise<BuiltMintTransaction> {
  const { issuerKey, utxos, holderAddress, config, provider } = params;

  if (utxos.length === 0) {
    throw new Error('No UTXOs available — fund the issuer wallet before minting');
  }

  const eligibleUtxos = selectFeeUtxos(utxos, { exclude: [] });

  const privateKey = PrivateKey.fromWif(issuerKey);
  const issuerAddress = privateKey.toAddress(config.network);

  const payloadBytes = encodeMintPayload({
    kind: 'mint',
    collection: config.collectionId,
    holder: holderAddress,
  });
  const dataScript = encodeRecordScript(payloadBytes);

  const transaction = new Transaction();

  for (const utxo of eligibleUtxos) {
    const sourceHex = await provider.getTransactionHex(utxo.txid);
    transaction.addInput({
      sourceTransaction: Transaction.fromHex(sourceHex),
      sourceOutputIndex: utxo.vout,
      unlockingScriptTemplate: new P2PKH().unlock(privateKey),
    });
  }

  try {
    transaction.addP2PKHOutput(holderAddress, TOKEN_OUTPUT_SATOSHIS);
  } catch {
    throw new Error(`Invalid holder address: ${holderAddress}`);
  }
  transaction.addP2PKHOutput(issuerAddress);
  transaction.addOutput({ lockingScript: dataScript, satoshis: 0 });

  await transaction.fee(new SatoshisPerKilobyte(config.feeRateSatPerKb));

  if (transaction.outputs.length < 3) {
    throw new Error('Not enough satoshis to mint a token and cover the fee');
  }

  await transaction.sign();

  return {
    transaction,
    hex: transaction.toHex(),
    txid: transaction.id('hex'),
    spentOutpoints: eligibleUtxos.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout })),
  };
}

export interface MintLicenseTokenParams {
  issuerKey: string;
  holderAddress: string;
  provider: ChainProvider;
  config: ChainConfig;
  eventBus: EventBus;
  pendingSpendRepo: PendingSpendRepository;
}

/**
 * Fetches the issuer's UTXOs, reconciles them against the app's own pending spends so a
 * still-unconfirmed transaction's outpoints are never reselected (mw-b00z.11), builds,
 * signs, broadcasts once, records the spent outpoints as a pending spend, and emits
 * 'bsv:token-minted'.
 */
export async function mintLicenseToken(params: MintLicenseTokenParams): Promise<LicenseToken> {
  const { issuerKey, holderAddress, provider, config, eventBus, pendingSpendRepo } = params;

  const issuerAddress = PrivateKey.fromWif(issuerKey).toAddress(config.network);
  const rawUtxos = await provider.getUtxos(issuerAddress);

  const pendingEntries = await pendingSpendRepo.getAll();
  const { remaining, dropped } = reconcilePendingSpends(pendingEntries, rawUtxos, new Date());
  if (dropped.length > 0) {
    await pendingSpendRepo.removeMany(dropped);
  }
  const { utxos } = filterUtxosExcludingPending(rawUtxos, remaining);

  let built: BuiltMintTransaction;
  try {
    built = await buildMintTransaction({ issuerKey, utxos, holderAddress, config, provider });
  } catch (error) {
    throw describePendingShortfall(error, rawUtxos, remaining);
  }

  const txid = await provider.broadcast(built.hex);

  await pendingSpendRepo.add({
    txid,
    outpoints: built.spentOutpoints.map(outpointKey),
    createdAt: new Date(),
  });

  const origin: Outpoint = { txid, vout: 0 };
  const token: LicenseToken = {
    origin,
    current: origin,
    holderAddress,
    collectionId: config.collectionId,
    lock: 'p2pkh',
  };

  eventBus.emit({ type: 'bsv:token-minted', payload: { txid, origin } });

  return token;
}

export interface BuildTransferTransactionParams {
  holderKey: string; // current holder's WIF
  token: LicenseToken;
  feeUtxos: Utxo[];
  toAddress: string;
  config: ChainConfig;
  provider: ChainProvider;
}

export interface BuiltTransferTransaction {
  transaction: Transaction;
  hex: string;
  txid: string;
  spentOutpoints: Outpoint[];
}

/**
 * Builds a signed transfer transaction (phase 1: no fuel, no wrap, no buyer inputs — the
 * holder pays the fee, spec §4.4). Input 0 spends the token's current outpoint; the rest
 * are fee inputs (never a 1-sat UTXO, never the token itself, spec R4.1.1's rule applied
 * to transfers). Exactly three outputs: the 1-sat token to toAddress, change to the
 * holder, and a transfer record naming the token's origin and new holder.
 */
export async function buildTransferTransaction(params: BuildTransferTransactionParams): Promise<BuiltTransferTransaction> {
  const { holderKey, token, feeUtxos, toAddress, config, provider } = params;
  assertTokenLock(token, 'p2pkh');

  const privateKey = PrivateKey.fromWif(holderKey);
  const holderAddress = privateKey.toAddress(config.network);

  const holderUtxos = await provider.getUtxos(holderAddress);
  const tokenStillHeld = holderUtxos.some(
    (utxo) =>
      utxo.txid === token.current.txid &&
      utxo.vout === token.current.vout &&
      utxo.satoshis === TOKEN_OUTPUT_SATOSHIS,
  );
  if (!tokenStillHeld) {
    throw new Error('token already spent or not confirmed here');
  }

  const eligibleFeeUtxos = selectFeeUtxos(feeUtxos, { exclude: [] });
  if (eligibleFeeUtxos.length === 0) {
    throw new Error('No fee UTXOs available — fund this wallet before transferring');
  }

  const transaction = new Transaction();

  const tokenSourceHex = await provider.getTransactionHex(token.current.txid);
  transaction.addInput({
    sourceTransaction: Transaction.fromHex(tokenSourceHex),
    sourceOutputIndex: token.current.vout,
    unlockingScriptTemplate: new P2PKH().unlock(privateKey),
  });

  for (const utxo of eligibleFeeUtxos) {
    const sourceHex = await provider.getTransactionHex(utxo.txid);
    transaction.addInput({
      sourceTransaction: Transaction.fromHex(sourceHex),
      sourceOutputIndex: utxo.vout,
      unlockingScriptTemplate: new P2PKH().unlock(privateKey),
    });
  }

  try {
    transaction.addP2PKHOutput(toAddress, TOKEN_OUTPUT_SATOSHIS);
  } catch {
    throw new Error(`Invalid recipient address: ${toAddress}`);
  }
  transaction.addP2PKHOutput(holderAddress);

  const payloadBytes = encodeTransferPayload({
    kind: 'transfer',
    origin: `${token.origin.txid}:${token.origin.vout}`,
    to: toAddress,
  });
  transaction.addOutput({ lockingScript: encodeRecordScript(payloadBytes), satoshis: 0 });

  await transaction.fee(new SatoshisPerKilobyte(config.feeRateSatPerKb));

  if (transaction.outputs.length < 3) {
    throw new Error('Not enough satoshis to cover the transfer and fee');
  }

  await transaction.sign();

  return {
    transaction,
    hex: transaction.toHex(),
    txid: transaction.id('hex'),
    spentOutpoints: [token.current, ...eligibleFeeUtxos.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout }))],
  };
}

/** The subset of bsvTokenRepo that transferLicenseToken needs, kept minimal so this module never imports the data layer. */
export interface TokenRepository {
  updateCurrent(origin: Outpoint, current: Outpoint, holderAddress: string): Promise<void>;
}

export interface TransferLicenseTokenParams {
  holderKey: string;
  token: LicenseToken;
  toAddress: string;
  provider: ChainProvider;
  config: ChainConfig;
  eventBus: EventBus;
  repository: TokenRepository;
  pendingSpendRepo: PendingSpendRepository;
}

export interface TransferLicenseTokenResult {
  txid: string;
}

/**
 * Fetches the holder's fee UTXOs, reconciles them against the app's own pending spends
 * so a still-unconfirmed transaction's outpoints are never reselected (mw-b00z.11),
 * builds, signs, broadcasts once, records the spent outpoints (fee inputs and the token
 * input) as a pending spend, updates the repository, and emits 'bsv:token-transferred'.
 */
export async function transferLicenseToken(params: TransferLicenseTokenParams): Promise<TransferLicenseTokenResult> {
  const { holderKey, token, toAddress, provider, config, eventBus, repository, pendingSpendRepo } = params;

  const holderAddress = PrivateKey.fromWif(holderKey).toAddress(config.network);
  const rawFeeUtxos = await provider.getUtxos(holderAddress);

  const pendingEntries = await pendingSpendRepo.getAll();
  const { remaining, dropped } = reconcilePendingSpends(pendingEntries, rawFeeUtxos, new Date());
  if (dropped.length > 0) {
    await pendingSpendRepo.removeMany(dropped);
  }
  const { utxos: feeUtxos } = filterUtxosExcludingPending(rawFeeUtxos, remaining);

  let built: BuiltTransferTransaction;
  try {
    built = await buildTransferTransaction({ holderKey, token, feeUtxos, toAddress, config, provider });
  } catch (error) {
    throw describePendingShortfall(error, rawFeeUtxos, remaining);
  }

  const txid = await provider.broadcast(built.hex);

  await pendingSpendRepo.add({
    txid,
    outpoints: built.spentOutpoints.map(outpointKey),
    createdAt: new Date(),
  });

  const current: Outpoint = { txid, vout: 0 };
  await repository.updateCurrent(token.origin, current, toAddress);

  eventBus.emit({ type: 'bsv:token-transferred', payload: { txid, origin: token.origin, to: toAddress } });

  return { txid };
}

export interface RecordWithTokenPayload {
  text: string;
  ts: string; // ISO timestamp, supplied by the caller — never read from the clock here
}

export interface BuildTokenRecordTransactionParams {
  holderKey: string; // current holder's WIF
  token: LicenseToken;
  feeUtxos: Utxo[];
  payload: RecordWithTokenPayload;
  config: ChainConfig;
  provider: ChainProvider;
}

export interface BuiltTokenRecordTransaction {
  transaction: Transaction;
  hex: string;
  txid: string;
  spentOutpoints: Outpoint[];
}

/**
 * Builds a signed write-with-token transaction (spec §4.3, phase-1 shape: no fuel, no
 * epoch encryption, the holder pays the fee). Input 0 spends the token's current
 * outpoint; the rest are fee inputs (never a 1-sat UTXO, never the token itself).
 * Exactly three outputs: the 1-sat token recreated to the SAME holder (a write never
 * changes ownership), change to the holder, and a write record naming the token's
 * origin. No anchor output — discovery of a write is by token lineage, not by anchor
 * scan (the anchor scan is phase 1's mechanism and does not see these).
 */
export async function buildTokenRecordTransaction(
  params: BuildTokenRecordTransactionParams,
): Promise<BuiltTokenRecordTransaction> {
  const { holderKey, token, feeUtxos, payload, config, provider } = params;
  assertTokenLock(token, 'p2pkh');

  const privateKey = PrivateKey.fromWif(holderKey);
  const holderAddress = privateKey.toAddress(config.network);

  const holderUtxos = await provider.getUtxos(holderAddress);
  const tokenStillHeld = holderUtxos.some(
    (utxo) =>
      utxo.txid === token.current.txid &&
      utxo.vout === token.current.vout &&
      utxo.satoshis === TOKEN_OUTPUT_SATOSHIS,
  );
  if (!tokenStillHeld) {
    throw new Error('token already spent or not confirmed here');
  }

  const eligibleFeeUtxos = selectFeeUtxos(feeUtxos, { exclude: [] });
  if (eligibleFeeUtxos.length === 0) {
    throw new Error('No fee UTXOs available — fund this wallet before writing a record');
  }

  const payloadBytes = encodeWritePayload({
    kind: 'write',
    origin: `${token.origin.txid}:${token.origin.vout}`,
    text: payload.text,
    ts: payload.ts,
  });
  const recordScript = encodeRecordScript(payloadBytes); // throws over the 10 KB payload cap

  const transaction = new Transaction();

  const tokenSourceHex = await provider.getTransactionHex(token.current.txid);
  transaction.addInput({
    sourceTransaction: Transaction.fromHex(tokenSourceHex),
    sourceOutputIndex: token.current.vout,
    unlockingScriptTemplate: new P2PKH().unlock(privateKey),
  });

  for (const utxo of eligibleFeeUtxos) {
    const sourceHex = await provider.getTransactionHex(utxo.txid);
    transaction.addInput({
      sourceTransaction: Transaction.fromHex(sourceHex),
      sourceOutputIndex: utxo.vout,
      unlockingScriptTemplate: new P2PKH().unlock(privateKey),
    });
  }

  transaction.addP2PKHOutput(holderAddress, TOKEN_OUTPUT_SATOSHIS);
  transaction.addP2PKHOutput(holderAddress);
  transaction.addOutput({ lockingScript: recordScript, satoshis: 0 });

  await transaction.fee(new SatoshisPerKilobyte(config.feeRateSatPerKb));

  if (transaction.outputs.length < 3) {
    throw new Error('Not enough satoshis to cover the write and fee');
  }

  await transaction.sign();

  return {
    transaction,
    hex: transaction.toHex(),
    txid: transaction.id('hex'),
    spentOutpoints: [token.current, ...eligibleFeeUtxos.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout }))],
  };
}

export interface WriteWithTokenParams {
  holderKey: string;
  token: LicenseToken;
  payload: RecordWithTokenPayload;
  provider: ChainProvider;
  config: ChainConfig;
  eventBus: EventBus;
  repository: TokenRepository;
  pendingSpendRepo: PendingSpendRepository;
}

export interface WriteWithTokenResult {
  txid: string;
}

/**
 * Fetches the holder's fee UTXOs, reconciles them against the app's own pending spends
 * so a still-unconfirmed transaction's outpoints are never reselected (mw-b00z.11),
 * builds, signs, broadcasts once, records the spent outpoints (fee inputs and the token
 * input) as a pending spend, moves the repository's current outpoint (holder unchanged —
 * a write recreates the token to itself), and emits 'bsv:record-written' with the txid
 * and the token's origin.
 */
export async function writeWithToken(params: WriteWithTokenParams): Promise<WriteWithTokenResult> {
  const { holderKey, token, payload, provider, config, eventBus, repository, pendingSpendRepo } = params;

  const holderAddress = PrivateKey.fromWif(holderKey).toAddress(config.network);
  const rawFeeUtxos = await provider.getUtxos(holderAddress);

  const pendingEntries = await pendingSpendRepo.getAll();
  const { remaining, dropped } = reconcilePendingSpends(pendingEntries, rawFeeUtxos, new Date());
  if (dropped.length > 0) {
    await pendingSpendRepo.removeMany(dropped);
  }
  const { utxos: feeUtxos } = filterUtxosExcludingPending(rawFeeUtxos, remaining);

  let built: BuiltTokenRecordTransaction;
  try {
    built = await buildTokenRecordTransaction({ holderKey, token, feeUtxos, payload, config, provider });
  } catch (error) {
    throw describePendingShortfall(error, rawFeeUtxos, remaining);
  }

  const txid = await provider.broadcast(built.hex);

  await pendingSpendRepo.add({
    txid,
    outpoints: built.spentOutpoints.map(outpointKey),
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
