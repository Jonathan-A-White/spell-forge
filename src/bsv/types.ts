// The chain primitives and event shape src/bsv needs from the app, kept local so the
// library builds standalone (mw-1589l.1): src/contracts/types.ts re-exports Utxo and
// AddressHistoryEntry from here and folds BsvEvent into its own AppEvent union, so
// there is exactly one definition of each, not two.

export interface Utxo {
  txid: string;
  vout: number;
  satoshis: number;
  height?: number; // 0 or undefined = unconfirmed
}

export interface AddressHistoryEntry {
  txid: string;
  height?: number; // 0 or undefined = unconfirmed
}

export type BsvEvent =
  | { type: 'bsv:record-written'; payload: { txid: string; origin?: string } }
  | { type: 'bsv:record-read'; payload: { txid: string; recordCount: number } }
  | { type: 'bsv:token-minted'; payload: { txid: string; origin: { txid: string; vout: number } } }
  | { type: 'bsv:token-transferred'; payload: { txid: string; origin: { txid: string; vout: number }; to: string } }
  | { type: 'bsv:sats-sent'; payload: { txid: string; toAddress: string; amountSats: number } };

/**
 * A narrower EventBus than the app's own (src/contracts/types.ts): src/bsv only ever
 * emits, never subscribes, so this omits `on` rather than fighting handler-parameter
 * contravariance to type it against a union narrower than the app's own AppEvent.
 */
export interface EventBus {
  emit(event: BsvEvent): void;
}
