// src/features/bsv-debug/bsv-debug-screen.tsx — Hidden BSV debug screen (phase 1).

import { useEffect, useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { chainConfig, createChainProvider, generateTestnetKey } from '../../bsv';
import type { ChainProvider } from '../../bsv';
import { bsvWalletRepo } from '../../data/repositories';
import { generateQrSvg } from '../settings/qr-code';
import type { BsvWalletKey } from '../../contracts/types';

interface BsvDebugScreenProps {
  onBack: () => void;
  chainProvider?: ChainProvider;
}

type BalanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; satoshis: number; utxoCount: number }
  | { status: 'error'; message: string };

export function BsvDebugScreen({ onBack, chainProvider }: BsvDebugScreenProps) {
  const [wallet, setWallet] = useState<BsvWalletKey | null | undefined>(undefined);
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [balance, setBalance] = useState<BalanceState>({ status: 'idle' });
  const provider = useMemo(() => chainProvider ?? createChainProvider(), [chainProvider]);

  useEffect(() => {
    let cancelled = false;
    bsvWalletRepo.getCurrent().then((current) => {
      if (!cancelled) setWallet(current ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadBalance = useCallback(
    async (address: string) => {
      setBalance({ status: 'loading' });
      try {
        const utxos = await provider.getUtxos(address);
        setBalance({
          status: 'loaded',
          satoshis: utxos.reduce((total, utxo) => total + utxo.satoshis, 0),
          utxoCount: utxos.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not load balance';
        setBalance({ status: 'error', message });
      }
    },
    [provider],
  );

  useEffect(() => {
    if (wallet) {
      loadBalance(wallet.address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.address]);

  async function handleGenerate() {
    const generated = generateTestnetKey();
    const key: BsvWalletKey = {
      id: uuidv4(),
      kind: 'wif',
      network: generated.network,
      material: generated.material,
      address: generated.address,
      createdAt: new Date(),
    };
    await bsvWalletRepo.save(key);
    setWallet(key);
    setShowPrivateKey(false);
  }

  async function handleConfirmWipe() {
    await bsvWalletRepo.wipe();
    setWallet(null);
    setConfirmingWipe(false);
    setShowPrivateKey(false);
  }

  return (
    <div className="min-h-screen bg-sf-bg">
      <div className="bg-sf-surface border-b border-sf-border px-4 py-4">
        <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all flex items-center justify-center"
            style={{ minWidth: 'var(--sf-tap-target-size)', minHeight: 'var(--sf-tap-target-size)' }}
            aria-label="Back to Settings"
          >
            Back
          </button>
          <h1 className="font-bold text-sf-heading" style={{ fontSize: 'calc(var(--sf-font-size) * 1.25)' }}>
            BSV Debug
          </h1>
        </div>
      </div>

      <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto px-4 py-6 flex flex-col gap-4">
        <p className="text-sf-text">{`network: ${chainConfig.network}`}</p>

        {wallet === undefined && <p className="text-sf-muted">Loading…</p>}

        {wallet === null && (
          <button
            onClick={handleGenerate}
            className="rounded-lg bg-sf-primary text-white font-semibold px-4 py-3 self-start"
            style={{ minHeight: 'var(--sf-tap-target-size)' }}
          >
            Generate key
          </button>
        )}

        {wallet && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sf-muted text-sm mb-1">Address</p>
              <p className="text-sf-text font-mono select-all break-all">{wallet.address}</p>
            </div>

            <div
              className="w-48 h-48"
              dangerouslySetInnerHTML={{ __html: generateQrSvg(wallet.address, 192) }}
            />

            <div className="flex flex-col gap-2">
              {balance.status === 'loading' && <p className="text-sf-muted">Loading balance…</p>}
              {balance.status === 'loaded' && (
                <p className="text-sf-text">{`Balance: ${balance.satoshis} sat (${balance.utxoCount} UTXOs)`}</p>
              )}
              {balance.status === 'error' && <p className="text-red-600">{balance.message}</p>}
              <button
                onClick={() => loadBalance(wallet.address)}
                disabled={balance.status === 'loading'}
                className="rounded-lg border border-sf-border-strong text-sf-text px-4 py-2 text-sm self-start disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            <div>
              {!showPrivateKey ? (
                <button
                  onClick={() => setShowPrivateKey(true)}
                  className="rounded-lg border border-sf-border-strong text-sf-text px-4 py-2 text-sm"
                >
                  Show private key
                </button>
              ) : (
                <div>
                  <p className="text-sf-muted text-sm mb-1">Private key (WIF)</p>
                  <p className="text-sf-text font-mono select-all break-all">{wallet.material}</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setConfirmingWipe(true)}
              className="rounded-lg bg-red-700 text-white font-semibold px-4 py-3 self-start"
              style={{ minHeight: 'var(--sf-tap-target-size)' }}
            >
              Wipe key
            </button>
          </div>
        )}
      </div>

      {confirmingWipe && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50">
          <div className="bg-sf-surface border-2 border-sf-border-strong rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h2 className="text-lg font-bold text-sf-heading mb-2">Wipe key?</h2>
            <p className="text-sf-text text-sm mb-6">
              This permanently deletes the stored testnet key and address. Any funds sent to this
              address will become unreachable unless you have saved the private key elsewhere.
              This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmingWipe(false)}
                className="flex-1 px-4 py-3 bg-sf-surface border border-sf-border-strong rounded-lg text-sf-text font-semibold hover:bg-sf-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmWipe}
                className="flex-1 px-4 py-3 rounded-lg font-semibold transition-colors bg-red-700 text-white hover:bg-red-800"
              >
                Confirm wipe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
