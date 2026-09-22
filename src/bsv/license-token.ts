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
