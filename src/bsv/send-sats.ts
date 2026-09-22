// src/bsv/send-sats.ts — Builds and broadcasts a plain-satoshis payment to a pasted
// address, from the app's own wallet. Never spends a 1-sat UTXO (that's a token, spec
// R4.1.1) or a UTXO named in excludeOutpoints.

import { P2PKH, PrivateKey, SatoshisPerKilobyte, Transaction } from '@bsv/sdk';
import type { EventBus, Utxo } from '../contracts/types';
import type { ChainConfig } from './config';
import type { ChainProvider } from './chain-provider';
import { isValidTestnetAddress } from './keys';
import { outpointKey, selectFeeUtxos, type PendingSpendEntry } from './pending-spends';
import type { Outpoint } from './license-token';

const MIN_SEND_SATOSHIS = 2; // a 1-sat output is a token by this app's convention

export interface BuildSendTransactionParams {
  key: string; // wallet WIF
  utxos: Utxo[];
  toAddress: string;
  amountSats: number;
  config: ChainConfig;
  provider: ChainProvider;
  excludeOutpoints?: Outpoint[];
}

export interface BuiltSendTransaction {
  transaction: Transaction;
  hex: string;
  txid: string;
  spentOutpoints: Outpoint[];
}

/**
 * Builds a signed transaction with two outputs: the requested amount (P2PKH) to
 * toAddress, and P2PKH change back to the sender's own address. The change output is
 * dropped by transaction.fee() whenever the computed change would be non-positive — the
 * same rule buildRecordTransaction uses — which this treats as "not enough satoshis".
 */
export async function buildSendTransaction(params: BuildSendTransactionParams): Promise<BuiltSendTransaction> {
  const { key, utxos, toAddress, amountSats, config, provider, excludeOutpoints } = params;

  if (!isValidTestnetAddress(toAddress)) {
    throw new Error(`Invalid or wrong-network address: ${toAddress}`);
  }
  if (amountSats < MIN_SEND_SATOSHIS) {
    throw new Error('Amount must be at least 2 satoshis — a 1-satoshi output is a token by this app\'s convention');
  }

  const eligibleUtxos = selectFeeUtxos(utxos, { exclude: excludeOutpoints ?? [] });
  if (eligibleUtxos.length === 0) {
    throw new Error('No UTXOs available — fund this wallet before sending');
  }

  const privateKey = PrivateKey.fromWif(key);
  const changeAddress = privateKey.toAddress(config.network);

  const transaction = new Transaction();

  for (const utxo of eligibleUtxos) {
    const sourceHex = await provider.getTransactionHex(utxo.txid);
    transaction.addInput({
      sourceTransaction: Transaction.fromHex(sourceHex),
      sourceOutputIndex: utxo.vout,
      unlockingScriptTemplate: new P2PKH().unlock(privateKey),
    });
  }

  transaction.addP2PKHOutput(toAddress, amountSats);
  transaction.addP2PKHOutput(changeAddress);

  await transaction.fee(new SatoshisPerKilobyte(config.feeRateSatPerKb));

  if (transaction.outputs.length < 2 || transaction.outputs[1].satoshis === undefined) {
    throw new Error('Not enough satoshis to send that amount and cover the fee');
  }

  await transaction.sign();

  return {
    transaction,
    hex: transaction.toHex(),
    txid: transaction.id('hex'),
    spentOutpoints: eligibleUtxos.map((utxo) => ({ txid: utxo.txid, vout: utxo.vout })),
  };
}

/** The subset of bsvPendingSpendRepo that sendSats needs, kept minimal like TokenRepository. */
export interface PendingSpendRepository {
  add(entry: PendingSpendEntry): Promise<void>;
}

export interface SendSatsParams {
  key: string; // wallet WIF
  toAddress: string;
  amountSats: number;
  provider: ChainProvider;
  config: ChainConfig;
  eventBus: EventBus;
  pendingSpendRepo: PendingSpendRepository;
  excludeOutpoints?: Outpoint[];
}

export interface SendSatsResult {
  txid: string;
  amountSats: number;
  toAddress: string;
}

/**
 * Fetches the sender's UTXOs, builds, signs, broadcasts once, records the spent
 * outpoints as a pending spend, and emits 'bsv:sats-sent'.
 */
export async function sendSats(params: SendSatsParams): Promise<SendSatsResult> {
  const { key, toAddress, amountSats, provider, config, eventBus, pendingSpendRepo, excludeOutpoints } = params;

  const senderAddress = PrivateKey.fromWif(key).toAddress(config.network);
  const utxos = await provider.getUtxos(senderAddress);
  const built = await buildSendTransaction({ key, utxos, toAddress, amountSats, config, provider, excludeOutpoints });
  const txid = await provider.broadcast(built.hex);

  await pendingSpendRepo.add({
    txid,
    outpoints: built.spentOutpoints.map(outpointKey),
    createdAt: new Date(),
  });

  eventBus.emit({ type: 'bsv:sats-sent', payload: { txid, toAddress, amountSats } });

  return { txid, amountSats, toAddress };
}
