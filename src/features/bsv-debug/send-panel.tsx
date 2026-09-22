// src/features/bsv-debug/send-panel.tsx — Sends a chosen number of satoshis from this
// wallet to a pasted testnet address. Never spends a token (a 1-sat UTXO): the spendable
// balance and the send itself both go through selectFeeUtxos.

import { useState } from 'react';
import { chainConfig, selectFeeUtxos, sendSats } from '../../bsv';
import type { ChainProvider } from '../../bsv';
import { bsvPendingSpendRepo } from '../../data/repositories';
import type { BsvWalletKey, EventBus, Utxo } from '../../contracts/types';

interface SendPanelProps {
  wallet: BsvWalletKey;
  utxos: Utxo[];
  provider: ChainProvider;
  eventBus: EventBus;
  onSent: () => void;
}

type SendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'done'; txid: string }
  | { status: 'error'; message: string };

export function SendPanel({ wallet, utxos, provider, eventBus, onSent }: SendPanelProps) {
  const [toAddress, setToAddress] = useState('');
  const [amountText, setAmountText] = useState('');
  const [sendState, setSendState] = useState<SendState>({ status: 'idle' });

  const spendableUtxos = selectFeeUtxos(utxos, { exclude: [] });
  const spendableSatoshis = spendableUtxos.reduce((total, utxo) => total + utxo.satoshis, 0);
  const amountSats = Number.parseInt(amountText, 10);

  async function handleSend() {
    setSendState({ status: 'sending' });
    try {
      const result = await sendSats({
        key: wallet.material,
        toAddress: toAddress.trim(),
        amountSats,
        provider,
        config: chainConfig,
        eventBus,
        pendingSpendRepo: bsvPendingSpendRepo,
      });
      setSendState({ status: 'done', txid: result.txid });
      onSent();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send';
      setSendState({ status: 'error', message });
    }
  }

  const canSend =
    spendableSatoshis > 0 &&
    toAddress.trim().length > 0 &&
    Number.isInteger(amountSats) &&
    amountSats > 0 &&
    amountSats <= spendableSatoshis &&
    sendState.status !== 'sending';

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sf-muted text-sm">{`Send sats (spendable: ${spendableSatoshis} sat)`}</p>
      <label htmlFor="bsv-send-to-address" className="text-sf-muted text-sm">
        To address
      </label>
      <input
        id="bsv-send-to-address"
        type="text"
        value={toAddress}
        onChange={(event) => setToAddress(event.target.value)}
        className="rounded-lg border border-sf-border-strong bg-sf-surface text-sf-text font-mono px-3 py-2 text-sm"
        style={{ minHeight: 'var(--sf-tap-target-size)' }}
      />
      <label htmlFor="bsv-send-amount" className="text-sf-muted text-sm">
        Amount (satoshis)
      </label>
      <input
        id="bsv-send-amount"
        type="number"
        inputMode="numeric"
        step={1}
        min={1}
        value={amountText}
        onChange={(event) => setAmountText(event.target.value)}
        className="rounded-lg border border-sf-border-strong bg-sf-surface text-sf-text font-mono px-3 py-2 text-sm"
        style={{ minHeight: 'var(--sf-tap-target-size)' }}
      />
      <button
        onClick={handleSend}
        disabled={!canSend}
        className="rounded-lg bg-sf-primary text-white font-semibold px-4 py-3 self-start disabled:opacity-50"
        style={{ minHeight: 'var(--sf-tap-target-size)' }}
      >
        {sendState.status === 'sending' ? 'Sending…' : 'Send'}
      </button>
      {sendState.status === 'done' && (
        <p data-testid="bsv-send-txid" className="text-sf-text font-mono select-all break-all">
          {sendState.txid}
        </p>
      )}
      {sendState.status === 'error' && <p className="text-red-600">{sendState.message}</p>}
    </div>
  );
}
