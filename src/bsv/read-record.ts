// src/bsv/read-record.ts — Reads an 'nftgate' record from a transaction by txid.
// Needs no key: any install can read any other install's transaction.

import type { ChainProvider } from './chain-provider';
import type { EventBus } from '../contracts/types';
import { ChainError } from './chain-error';
import { decodeRecordPayload, findRecordsInTransaction, type DecodedRecordPayload, type RecordInTransaction } from './record';

const TXID_PATTERN = /^[0-9a-f]{64}$/i;

export interface DecodedRecord extends RecordInTransaction {
  decodedPayload: DecodedRecordPayload;
}

export interface ReadRecordResult {
  txid: string;
  records: DecodedRecord[];
}

/**
 * Validates the txid, fetches its hex from the provider, decodes every nftgate record
 * output, and emits 'bsv:record-read'. Emits even when no record is found, so listeners
 * can tell a read happened.
 */
export async function readRecordByTxid(
  provider: ChainProvider,
  txid: string,
  eventBus: EventBus,
): Promise<ReadRecordResult> {
  if (!TXID_PATTERN.test(txid)) {
    throw new ChainError('Not a valid transaction id — expected 64 hex characters');
  }

  const txHex = await provider.getTransactionHex(txid);
  const records = findRecordsInTransaction(txHex).map((record) => ({
    ...record,
    decodedPayload: decodeRecordPayload(record.version, record.payloadBytes),
  }));

  eventBus.emit({ type: 'bsv:record-read', payload: { txid, recordCount: records.length } });

  return { txid, records };
}
