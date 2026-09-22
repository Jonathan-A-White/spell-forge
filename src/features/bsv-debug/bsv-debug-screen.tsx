// src/features/bsv-debug/bsv-debug-screen.tsx — Hidden BSV debug screen (phase 1).

import { useEffect, useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { chainConfig, createChainProvider, generateTestnetKey, writeRecord, readRecordByTxid } from '../../bsv';
import type { ChainProvider, DecodedRecord } from '../../bsv';
import { bsvWalletRepo } from '../../data/repositories';
import { generateQrSvg } from '../settings/qr-code';
import type { BsvWalletKey, EventBus, Utxo } from '../../contracts/types';
import { createEventBus } from '../../contracts';

const ANCHOR_ADDRESS_STORAGE_KEY = 'sf-bsv-anchor';

function readStoredAnchorAddress(): string {
  try {
    return localStorage.getItem(ANCHOR_ADDRESS_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeAnchorAddress(address: string): void {
  try {
    localStorage.setItem(ANCHOR_ADDRESS_STORAGE_KEY, address);
  } catch {
    // localStorage may be unavailable in some contexts
  }
}

interface BsvDebugScreenProps {
  onBack: () => void;
  chainProvider?: ChainProvider;
  eventBus?: EventBus;
}

type BalanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; satoshis: number; utxoCount: number; utxos: Utxo[] }
  | { status: 'error'; message: string };

type WriteState =
  | { status: 'idle' }
  | { status: 'writing' }
  | { status: 'done'; txid: string }
  | { status: 'error'; message: string };

type ReadState =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'done'; records: DecodedRecord[] }
  | { status: 'error'; message: string };

export function BsvDebugScreen({ onBack, chainProvider, eventBus }: BsvDebugScreenProps) {
  const [wallet, setWallet] = useState<BsvWalletKey | null | undefined>(undefined);
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [balance, setBalance] = useState<BalanceState>({ status: 'idle' });
  const [anchorAddress, setAnchorAddress] = useState(readStoredAnchorAddress);
  const [recordText, setRecordText] = useState('');
  const [writeState, setWriteState] = useState<WriteState>({ status: 'idle' });
  const [readTxid, setReadTxid] = useState('');
  const [readState, setReadState] = useState<ReadState>({ status: 'idle' });
  const provider = useMemo(() => chainProvider ?? createChainProvider(), [chainProvider]);
  const bus = useMemo(() => eventBus ?? createEventBus(), [eventBus]);

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
          utxos,
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

  function handleAnchorAddressChange(value: string) {
    setAnchorAddress(value);
    storeAnchorAddress(value);
  }

  async function handleWrite() {
    if (!wallet || balance.status !== 'loaded') return;
    setWriteState({ status: 'writing' });
    try {
      const result = await writeRecord({
        key: wallet.material,
        utxos: balance.utxos,
        payload: { text: recordText, ts: new Date().toISOString() },
        config: { ...chainConfig, anchorAddress: anchorAddress || chainConfig.anchorAddress },
        provider,
        eventBus: bus,
      });
      setWriteState({ status: 'done', txid: result.txid });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not write record';
      setWriteState({ status: 'error', message });
    }
  }

  async function handleRead() {
    setReadState({ status: 'reading' });
    try {
      const result = await readRecordByTxid(provider, readTxid.trim(), bus);
      setReadState({ status: 'done', records: result.records });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read transaction';
      setReadState({ status: 'error', message });
    }
  }

  const canWrite =
    !!wallet && balance.status === 'loaded' && balance.satoshis > 0 && recordText.trim().length > 0;
  const canRead = readTxid.trim().length > 0 && readState.status !== 'reading';

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

        <div className="flex flex-col gap-1">
          <label htmlFor="bsv-anchor-address" className="text-sf-muted text-sm">
            Anchor address (stored on this device only, overrides the configured anchor — point two
            installs at the same address by hand)
          </label>
          <input
            id="bsv-anchor-address"
            type="text"
            value={anchorAddress}
            onChange={(event) => handleAnchorAddressChange(event.target.value)}
            placeholder={chainConfig.anchorAddress || 'not set'}
            className="rounded-lg border border-sf-border-strong bg-sf-surface text-sf-text font-mono px-3 py-2 text-sm"
            style={{ minHeight: 'var(--sf-tap-target-size)' }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="bsv-read-txid" className="text-sf-muted text-sm">
            Read by txid
          </label>
          <input
            id="bsv-read-txid"
            type="text"
            value={readTxid}
            onChange={(event) => setReadTxid(event.target.value)}
            className="rounded-lg border border-sf-border-strong bg-sf-surface text-sf-text font-mono px-3 py-2 text-sm"
            style={{ minHeight: 'var(--sf-tap-target-size)' }}
          />
          <button
            onClick={handleRead}
            disabled={!canRead}
            className="rounded-lg border border-sf-border-strong text-sf-text px-4 py-2 text-sm self-start disabled:opacity-50"
            style={{ minHeight: 'var(--sf-tap-target-size)' }}
          >
            {readState.status === 'reading' ? 'Reading…' : 'Read'}
          </button>
          {readState.status === 'done' && readState.records.length === 0 && (
            <p className="text-sf-text">no nftgate record in this transaction</p>
          )}
          {readState.status === 'done' &&
            readState.records.map((record) => (
              <div key={record.vout} className="text-sf-text">
                <p className="text-sf-muted text-sm">{`vout ${record.vout} · version ${record.version}`}</p>
                {'text' in record.decodedPayload && (
                  <>
                    <p className="break-words">{record.decodedPayload.text}</p>
                    <p className="text-sf-muted text-sm">{record.decodedPayload.ts}</p>
                  </>
                )}
                {'unreadable' in record.decodedPayload && (
                  <p className="text-red-600">Payload could not be read (not valid JSON)</p>
                )}
                {'unsupportedVersion' in record.decodedPayload && (
                  <p className="text-sf-muted">{`Unsupported record version ${record.decodedPayload.unsupportedVersion}`}</p>
                )}
              </div>
            ))}
          {readState.status === 'error' && <p className="text-red-600">{readState.message}</p>}
        </div>

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

            <div className="flex flex-col gap-2">
              <label htmlFor="bsv-record-text" className="text-sf-muted text-sm">
                Write a record
              </label>
              <textarea
                id="bsv-record-text"
                value={recordText}
                onChange={(event) => setRecordText(event.target.value)}
                className="rounded-lg border border-sf-border-strong bg-sf-surface text-sf-text px-3 py-2 text-sm"
                rows={3}
              />
              <button
                onClick={handleWrite}
                disabled={!canWrite || writeState.status === 'writing'}
                className="rounded-lg bg-sf-primary text-white font-semibold px-4 py-3 self-start disabled:opacity-50"
                style={{ minHeight: 'var(--sf-tap-target-size)' }}
              >
                {writeState.status === 'writing' ? 'Writing…' : 'Write'}
              </button>
              {writeState.status === 'done' && (
                <div>
                  <p className="text-sf-muted text-sm mb-1">txid</p>
                  <p className="text-sf-text font-mono select-all break-all">{writeState.txid}</p>
                </div>
              )}
              {writeState.status === 'error' && <p className="text-red-600">{writeState.message}</p>}
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
