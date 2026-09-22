// src/bsv/license-token.ts — Mints a 1-satoshi License Token ordinal with a same-tx mint
// record (spec §3.1, §4.1). Phase 2: no contract script yet, just the mint transaction
// shape and the origin bookkeeping every later phase builds on.

import { P2PKH, PrivateKey, SatoshisPerKilobyte, Transaction, Utils } from '@bsv/sdk';
import type { EventBus, Utxo } from '../contracts/types';
import type { ChainConfig } from './config';
import type { ChainProvider } from './chain-provider';
import { encodeRecordScript } from './record';
import { selectFeeUtxos } from './pending-spends';

const TOKEN_OUTPUT_SATOSHIS = 1;

export interface Outpoint {
  txid: string;
  vout: number;
}

export interface LicenseToken {
  origin: Outpoint;
  current: Outpoint;
  holderAddress: string;
  collectionId: string;
}

interface MintRecordPayload {
  kind: 'mint';
  collection: string;
  holder: string;
}

function encodeMintPayload(payload: MintRecordPayload): number[] {
  return Utils.toArray(JSON.stringify(payload), 'utf8');
}

interface TransferRecordPayload {
  kind: 'transfer';
  origin: string; // "txid:vout"
  to: string;
}

function encodeTransferPayload(payload: TransferRecordPayload): number[] {
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

  return { transaction, hex: transaction.toHex(), txid: transaction.id('hex') };
}

export interface MintLicenseTokenParams {
  issuerKey: string;
  holderAddress: string;
  provider: ChainProvider;
  config: ChainConfig;
  eventBus: EventBus;
}

/** Fetches the issuer's UTXOs, builds, signs, broadcasts once, and emits 'bsv:token-minted'. */
export async function mintLicenseToken(params: MintLicenseTokenParams): Promise<LicenseToken> {
  const { issuerKey, holderAddress, provider, config, eventBus } = params;

  const issuerAddress = PrivateKey.fromWif(issuerKey).toAddress(config.network);
  const utxos = await provider.getUtxos(issuerAddress);
  const built = await buildMintTransaction({ issuerKey, utxos, holderAddress, config, provider });
  const txid = await provider.broadcast(built.hex);

  const origin: Outpoint = { txid, vout: 0 };
  const token: LicenseToken = {
    origin,
    current: origin,
    holderAddress,
    collectionId: config.collectionId,
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

  return { transaction, hex: transaction.toHex(), txid: transaction.id('hex') };
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
}

export interface TransferLicenseTokenResult {
  txid: string;
}

/** Fetches the holder's UTXOs, builds, signs, broadcasts once, updates the repository, and emits 'bsv:token-transferred'. */
export async function transferLicenseToken(params: TransferLicenseTokenParams): Promise<TransferLicenseTokenResult> {
  const { holderKey, token, toAddress, provider, config, eventBus, repository } = params;

  const holderAddress = PrivateKey.fromWif(holderKey).toAddress(config.network);
  const feeUtxos = await provider.getUtxos(holderAddress);
  const built = await buildTransferTransaction({ holderKey, token, feeUtxos, toAddress, config, provider });
  const txid = await provider.broadcast(built.hex);

  const current: Outpoint = { txid, vout: 0 };
  await repository.updateCurrent(token.origin, current, toAddress);

  eventBus.emit({ type: 'bsv:token-transferred', payload: { txid, origin: token.origin, to: toAddress } });

  return { txid };
}
