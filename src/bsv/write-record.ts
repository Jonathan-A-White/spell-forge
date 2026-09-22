// src/bsv/write-record.ts — Builds and broadcasts an 'nftgate' record transaction.

import { P2PKH, PrivateKey, SatoshisPerKilobyte, Transaction } from '@bsv/sdk';
import type { EventBus, Utxo } from '../contracts/types';
import type { ChainConfig } from './config';
import type { ChainProvider } from './chain-provider';
import { encodeRecordPayloadV1, encodeRecordScript, type RecordPayloadV1 } from './record';
import { selectFeeUtxos } from './pending-spends';

const ANCHOR_OUTPUT_SATOSHIS = 1;

export interface BuildRecordTransactionParams {
  key: string; // wallet WIF
  utxos: Utxo[];
  payload: RecordPayloadV1;
  config: ChainConfig;
  provider: ChainProvider;
}

export interface BuiltRecordTransaction {
  transaction: Transaction;
  hex: string;
  txid: string;
}

/**
 * Builds a signed transaction with three outputs: the record (0 sat), the 1-sat anchor,
 * and change back to the wallet. Throws readable errors instead of building anything
 * unbroadcastable.
 */
export async function buildRecordTransaction(
  params: BuildRecordTransactionParams,
): Promise<BuiltRecordTransaction> {
  const { key, utxos, payload, config, provider } = params;

  if (!config.anchorAddress) {
    throw new Error('No anchor address configured — set one on the BSV Debug screen or in ChainConfig');
  }
  if (utxos.length === 0) {
    throw new Error('No UTXOs available — fund this wallet before writing a record');
  }

  const payloadBytes = encodeRecordPayloadV1(payload);
  const recordScript = encodeRecordScript(payloadBytes);

  const privateKey = PrivateKey.fromWif(key);
  const changeAddress = privateKey.toAddress(config.network);

  const transaction = new Transaction();
  const eligibleUtxos = selectFeeUtxos(utxos, { exclude: [] });

  for (const utxo of eligibleUtxos) {
    const sourceHex = await provider.getTransactionHex(utxo.txid);
    transaction.addInput({
      sourceTransaction: Transaction.fromHex(sourceHex),
      sourceOutputIndex: utxo.vout,
      unlockingScriptTemplate: new P2PKH().unlock(privateKey),
    });
  }

  transaction.addOutput({ lockingScript: recordScript, satoshis: 0 });
  transaction.addP2PKHOutput(config.anchorAddress, ANCHOR_OUTPUT_SATOSHIS);
  transaction.addP2PKHOutput(changeAddress);

  await transaction.fee(new SatoshisPerKilobyte(config.feeRateSatPerKb));

  if (transaction.outputs.length < 3 || transaction.outputs[2].satoshis === undefined) {
    throw new Error('Not enough satoshis to cover the anchor output and fee');
  }

  await transaction.sign();

  return { transaction, hex: transaction.toHex(), txid: transaction.id('hex') };
}

export interface WriteRecordParams extends BuildRecordTransactionParams {
  eventBus: EventBus;
}

export interface WriteRecordResult {
  txid: string;
}

/** Builds, signs, broadcasts once, and emits 'bsv:record-written' with the broadcast txid. */
export async function writeRecord(params: WriteRecordParams): Promise<WriteRecordResult> {
  const { eventBus, provider, ...buildParams } = params;
  const built = await buildRecordTransaction({ ...buildParams, provider });
  const txid = await provider.broadcast(built.hex);

  eventBus.emit({ type: 'bsv:record-written', payload: { txid } });

  return { txid };
}
