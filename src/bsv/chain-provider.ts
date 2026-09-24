// src/bsv/chain-provider.ts — The chain access interface every provider implements.
//
// Callers get a ChainProvider from createChainProvider() or as a parameter; never
// construct a specific provider (e.g. WhatsOnChain) at a call site. This keeps the
// door open for a second provider to be consulted and compared later.

import type { Utxo, AddressHistoryEntry } from './types';
import type { ChainConfig } from './config';
import { chainConfig } from './config';
import { WhatsOnChainProvider } from './whatsonchain-provider';

export interface ChainProvider {
  getUtxos(address: string): Promise<Utxo[]>;
  getTransactionHex(txid: string): Promise<string>;
  broadcast(txHex: string): Promise<string>;
  getAddressHistory(address: string): Promise<AddressHistoryEntry[]>;
  /** Confirmed history only lists a transaction once it is mined; this lists it while it is still in the mempool. */
  getUnconfirmedAddressHistory?(address: string): Promise<AddressHistoryEntry[]>;
}

/** The one place a concrete ChainProvider gets constructed. */
export function createChainProvider(config: ChainConfig = chainConfig): ChainProvider {
  return new WhatsOnChainProvider(config);
}
