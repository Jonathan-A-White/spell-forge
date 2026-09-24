// src/bsv/token-lineage.ts — Follows a License Token from its origin to its current
// holder, hop by hop (spec §4.6.5 lineage verification, phase-1 shape).
//
// No spent-output index exists on WhatsOnChain, so the only way to find the transaction
// that spends a given outpoint is to walk the holder's address history looking for the
// one whose input 0 references it — the same technique scan-records.ts uses for anchor
// discovery. An overlay indexer replaces this later without touching callers, since
// everything here goes through the ChainProvider parameter.

import { OP, PublicKey, Transaction, Utils } from '@bsv/sdk';
import type { LockingScript } from '@bsv/sdk';
import type { ChainProvider } from './chain-provider';
import type { AddressHistoryEntry } from './types';
import type { Outpoint } from './license-token';
import { ownerPubKeyFromLicenseLockingScript } from './license-owner';
import { decodeRecordPayload, findRecordsInTransaction } from './record';

const TOKEN_OUTPUT_SATOSHIS = 1;
const DEFAULT_MAX_HOPS = 50;

// Matches keys.ts's own hardcoding: this app only ever deals in testnet addresses.
const TESTNET_ADDRESS_PREFIX = [0x6f];

export type LineageHopKind = 'mint' | 'write' | 'transfer' | 'unknown';

export interface LineageHop {
  txid: string;
  vout: number;
  kind: LineageHopKind;
  holderAddress: string;
  text?: string;
}

export interface FollowLicenseTokenResult {
  hops: LineageHop[];
  current: Outpoint;
  holderAddress: string;
  complete: boolean;
  /** Set when a hop's output 0 does not hold exactly 1 satoshi. Naming the bad txid. */
  brokenAtTxid?: string;
}

export interface FollowLicenseTokenParams {
  origin: Outpoint;
  provider: ChainProvider;
  maxHops?: number;
}

/** The P2PKH address an output pays to, or null if it isn't a P2PKH output. */
function p2pkhAddressFromLockingScript(script: LockingScript): string | null {
  const chunks = script.chunks;
  if (chunks.length !== 5) return null;
  if (chunks[0].op !== OP.OP_DUP || chunks[1].op !== OP.OP_HASH160) return null;
  if (chunks[3].op !== OP.OP_EQUALVERIFY || chunks[4].op !== OP.OP_CHECKSIG) return null;
  const hash = chunks[2].data;
  if (!hash || hash.length !== 20) return null;
  return Utils.toBase58Check(hash, TESTNET_ADDRESS_PREFIX);
}

/**
 * The holder an output's locking script names: a P2PKH's address, or a License's current
 * owner (its state's ownerPubKey, read without depending on scrypt-ts) as the address that
 * key controls — the same address a License token's own holderAddress field carries
 * elsewhere (license-contract.ts). Null if the script is neither shape.
 */
function addressFromLockingScript(script: LockingScript): string | null {
  const p2pkhAddress = p2pkhAddressFromLockingScript(script);
  if (p2pkhAddress) return p2pkhAddress;
  const ownerPubKeyHex = ownerPubKeyFromLicenseLockingScript(script.toHex());
  if (!ownerPubKeyHex) return null;
  return PublicKey.fromString(ownerPubKeyHex).toAddress('testnet');
}

/** Unconfirmed sorts first, then by height descending — same rule as scan-records.ts. */
function byNewestFirst(a: AddressHistoryEntry, b: AddressHistoryEntry): number {
  const heightA = a.height ?? 0;
  const heightB = b.height ?? 0;
  if (heightA === 0 && heightB === 0) return 0;
  if (heightA === 0) return -1;
  if (heightB === 0) return 1;
  return heightB - heightA;
}

function mergeHistories(confirmed: AddressHistoryEntry[], unconfirmed: AddressHistoryEntry[]): AddressHistoryEntry[] {
  const confirmedTxids = new Set(confirmed.map((entry) => entry.txid));
  const extra = unconfirmed.filter((entry) => !confirmedTxids.has(entry.txid));
  return [...confirmed, ...extra];
}

/** Reads the record at output 2, if any, and classifies it. previousHolder is undefined for the origin hop. */
function classifyHop(
  txHex: string,
  previousHolder: string | undefined,
  newHolder: string,
): { kind: LineageHopKind; text?: string } {
  const dataRecord = findRecordsInTransaction(txHex).find((record) => record.vout === 2);
  if (dataRecord) {
    const decoded = decodeRecordPayload(dataRecord.version, dataRecord.payloadBytes);
    if ('kind' in decoded) {
      if (decoded.kind === 'mint') return { kind: 'mint' };
      if (decoded.kind === 'transfer') return { kind: 'transfer' };
      if (decoded.kind === 'write') return { kind: 'write', text: decoded.text };
    }
  }
  if (previousHolder !== undefined && previousHolder !== newHolder) return { kind: 'transfer' };
  return { kind: 'unknown' };
}

/**
 * Follows a License Token forward from its origin, hop by hop, verifying at each step
 * that the token satoshi (output 0) is exactly 1 sat and finding the transaction that
 * spends it next by walking the current holder's address history. Stops when no spend
 * is found (complete: true), when maxHops is reached (complete: false), or when a hop
 * fails the 1-satoshi check (brokenAtTxid set, complete: false).
 *
 * Paces getTransactionHex calls one at a time (never concurrently) and caches every
 * hex it fetches by txid, so a txid already seen — including an unrelated transaction
 * re-examined on a later pass over the same holder's history — is never fetched twice.
 */
export async function followLicenseToken(params: FollowLicenseTokenParams): Promise<FollowLicenseTokenResult> {
  const { origin, provider, maxHops = DEFAULT_MAX_HOPS } = params;

  const hexCache = new Map<string, string>();
  async function fetchHex(txid: string): Promise<string> {
    const cached = hexCache.get(txid);
    if (cached) return cached;
    const hex = await provider.getTransactionHex(txid);
    hexCache.set(txid, hex);
    return hex;
  }

  const originHex = await fetchHex(origin.txid);
  const originTx = Transaction.fromHex(originHex);
  const originOutput = originTx.outputs[origin.vout];

  if (!originOutput || originOutput.satoshis !== TOKEN_OUTPUT_SATOSHIS) {
    return { hops: [], current: origin, holderAddress: '', complete: false, brokenAtTxid: origin.txid };
  }

  const originHolder = addressFromLockingScript(originOutput.lockingScript);
  if (!originHolder) {
    return { hops: [], current: origin, holderAddress: '', complete: false, brokenAtTxid: origin.txid };
  }

  const originClassified = classifyHop(originHex, undefined, originHolder);
  const hops: LineageHop[] = [
    { txid: origin.txid, vout: origin.vout, kind: originClassified.kind, holderAddress: originHolder, text: originClassified.text },
  ];

  let currentOutpoint: Outpoint = origin;
  let currentHolder = originHolder;
  let complete = false;
  let brokenAtTxid: string | undefined;

  while (hops.length < maxHops) {
    const seenTxids = new Set(hops.map((hop) => hop.txid));

    const [confirmed, unconfirmed] = await Promise.all([
      provider.getAddressHistory(currentHolder),
      provider.getUnconfirmedAddressHistory
        ? provider.getUnconfirmedAddressHistory(currentHolder)
        : Promise.resolve([]),
    ]);
    const candidates = mergeHistories(confirmed, unconfirmed)
      .sort(byNewestFirst)
      .filter((entry) => !seenTxids.has(entry.txid));

    let spendingTxid: string | undefined;
    let spendingHex: string | undefined;

    for (const candidate of candidates) {
      const hex = await fetchHex(candidate.txid);
      const tx = Transaction.fromHex(hex);
      const input0 = tx.inputs[0];
      if (input0 && input0.sourceTXID === currentOutpoint.txid && input0.sourceOutputIndex === currentOutpoint.vout) {
        spendingTxid = candidate.txid;
        spendingHex = hex;
        break;
      }
    }

    if (!spendingTxid || !spendingHex) {
      complete = true;
      break;
    }

    const spendingTx = Transaction.fromHex(spendingHex);
    const output0 = spendingTx.outputs[0];
    if (!output0 || output0.satoshis !== TOKEN_OUTPUT_SATOSHIS) {
      brokenAtTxid = spendingTxid;
      break;
    }

    const newHolder = addressFromLockingScript(output0.lockingScript);
    if (!newHolder) {
      brokenAtTxid = spendingTxid;
      break;
    }

    const classified = classifyHop(spendingHex, currentHolder, newHolder);
    hops.push({ txid: spendingTxid, vout: 0, kind: classified.kind, holderAddress: newHolder, text: classified.text });
    currentOutpoint = { txid: spendingTxid, vout: 0 };
    currentHolder = newHolder;
  }

  return {
    hops,
    current: currentOutpoint,
    holderAddress: currentHolder,
    complete,
    ...(brokenAtTxid ? { brokenAtTxid } : {}),
  };
}
