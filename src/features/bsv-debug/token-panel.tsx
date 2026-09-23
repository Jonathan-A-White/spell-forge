// src/features/bsv-debug/token-panel.tsx — Mints a License Token to this device's own
// address (single-install: the app is issuer and holder at once) and lists its tokens.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  chainConfig,
  followLicenseToken,
  formatWritesLeftRange,
  isValidCompressedPublicKeyHex,
  isValidTestnetAddress,
  mintContractLicenseToken,
  mintLicenseToken,
  readFuelValue,
  transferContractToken,
  transferLicenseToken,
  writeWithContractToken,
  writeWithToken,
  writesLeftRange,
} from '../../bsv';
import type { ChainProvider, FollowLicenseTokenResult, FuelValue, LicenseToken, TokenLock } from '../../bsv';
import { bsvPendingSpendRepo, bsvTokenRepo } from '../../data/repositories';
import type { BsvWalletKey, EventBus } from '../../contracts/types';

interface TokenPanelProps {
  wallet: BsvWalletKey;
  hasBalance: boolean;
  provider: ChainProvider;
  eventBus: EventBus;
}

type MintState =
  | { status: 'idle' }
  | { status: 'minting' }
  | { status: 'done'; txid: string }
  | { status: 'error'; message: string };

type TransferState =
  | { status: 'idle' }
  | { status: 'transferring' }
  | { status: 'done'; txid: string }
  | { status: 'error'; message: string };

type TokenWriteState =
  | { status: 'idle' }
  | { status: 'writing' }
  | { status: 'done'; txid: string }
  | { status: 'error'; message: string };

type HistoryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; result: FollowLicenseTokenResult }
  | { status: 'error'; message: string };

function tokenKey(token: LicenseToken): string {
  return `${token.origin.txid}:${token.origin.vout}`;
}

type FuelDisplay =
  | { status: 'live'; value: FuelValue }
  | { status: 'cached'; satoshis: number; seenAt: Date }
  | { status: 'unavailable' };

function formatAsOf(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `as of ${hh}:${mm}`;
}

/** The fuel row's text: the live value online, the last value seen with its age offline, or 'stand-in' for a step 2 token. */
function fuelRowText(display: FuelDisplay | undefined, feeRateSatPerKb: number): string {
  if (!display) return 'fuel …';
  if (display.status === 'unavailable') return 'fuel: unavailable';
  if (display.status === 'live') {
    if (display.value.kind === 'stand-in') return 'fuel: stand-in';
    const range = writesLeftRange(display.value.satoshis, feeRateSatPerKb);
    return `fuel ${display.value.satoshis} sat (${formatWritesLeftRange(range)})`;
  }
  const range = writesLeftRange(display.satoshis, feeRateSatPerKb);
  return `fuel ${display.satoshis} sat ${formatAsOf(display.seenAt)} (${formatWritesLeftRange(range)})`;
}

export function TokenPanel({ wallet, hasBalance, provider, eventBus }: TokenPanelProps) {
  const [tokens, setTokens] = useState<LicenseToken[]>([]);
  const [mintLock, setMintLock] = useState<TokenLock>('p2pkh');
  const [mintState, setMintState] = useState<MintState>({ status: 'idle' });
  const [transferAddresses, setTransferAddresses] = useState<Record<string, string>>({});
  const [transferStates, setTransferStates] = useState<Record<string, TransferState>>({});
  const [writeTexts, setWriteTexts] = useState<Record<string, string>>({});
  const [tokenWriteStates, setTokenWriteStates] = useState<Record<string, TokenWriteState>>({});
  const [historyStates, setHistoryStates] = useState<Record<string, HistoryState>>({});
  const [fuelDisplays, setFuelDisplays] = useState<Record<string, FuelDisplay>>({});
  // The last fuel value read from the chain for each token, kept across a failed refresh so
  // the row can fall back to 'the last value seen with its age' offline (mw-yo97u.4).
  const fuelCache = useRef<Record<string, { satoshis: number; seenAt: Date }>>({});
  // Guards against an earlier-issued list() resolving after a later one (e.g. the
  // mount load finishing after a mint's own reload) and clobbering the newer result.
  const latestListRequest = useRef(0);

  const loadFuel = useCallback(
    async (token: LicenseToken) => {
      const key = tokenKey(token);
      try {
        const value = await readFuelValue(token.current.txid, provider);
        if (value.kind === 'fuel') {
          fuelCache.current[key] = { satoshis: value.satoshis, seenAt: new Date() };
        }
        setFuelDisplays((prev) => ({ ...prev, [key]: { status: 'live', value } }));
      } catch {
        const cached = fuelCache.current[key];
        setFuelDisplays((prev) => ({
          ...prev,
          [key]: cached ? { status: 'cached', satoshis: cached.satoshis, seenAt: cached.seenAt } : { status: 'unavailable' },
        }));
      }
    },
    [provider],
  );

  useEffect(() => {
    for (const token of tokens) {
      if (token.lock === 'license') loadFuel(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  useEffect(() => {
    const requestId = ++latestListRequest.current;
    let cancelled = false;
    bsvTokenRepo.list().then((list) => {
      if (!cancelled && requestId === latestListRequest.current) setTokens(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleMint() {
    setMintState({ status: 'minting' });
    try {
      const token =
        mintLock === 'license'
          ? await mintContractLicenseToken({
              issuerKey: wallet.material,
              provider,
              config: chainConfig,
              eventBus,
              pendingSpendRepo: bsvPendingSpendRepo,
            })
          : await mintLicenseToken({
              issuerKey: wallet.material,
              holderAddress: wallet.address,
              provider,
              config: chainConfig,
              eventBus,
              pendingSpendRepo: bsvPendingSpendRepo,
            });
      await bsvTokenRepo.put(token);
      const requestId = ++latestListRequest.current;
      const list = await bsvTokenRepo.list();
      // Set together so the txid and the updated Tokens list land in the same render —
      // never a frame where the txid shows but the new token is still missing.
      if (requestId === latestListRequest.current) setTokens(list);
      setMintState({ status: 'done', txid: token.origin.txid });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not mint token';
      setMintState({ status: 'error', message });
    }
  }

  async function handleTransfer(token: LicenseToken) {
    const key = tokenKey(token);
    const toValue = transferAddresses[key] ?? '';
    setTransferStates((prev) => ({ ...prev, [key]: { status: 'transferring' } }));
    try {
      const result =
        token.lock === 'license'
          ? await transferContractToken({
              holderKey: wallet.material,
              token,
              toPubKey: toValue,
              provider,
              config: chainConfig,
              eventBus,
              repository: bsvTokenRepo,
              pendingSpendRepo: bsvPendingSpendRepo,
            })
          : await transferLicenseToken({
              holderKey: wallet.material,
              token,
              toAddress: toValue,
              provider,
              config: chainConfig,
              eventBus,
              repository: bsvTokenRepo,
              pendingSpendRepo: bsvPendingSpendRepo,
            });
      const requestId = ++latestListRequest.current;
      const list = await bsvTokenRepo.list();
      if (requestId === latestListRequest.current) setTokens(list);
      setTransferStates((prev) => ({ ...prev, [key]: { status: 'done', txid: result.txid } }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not transfer token';
      setTransferStates((prev) => ({ ...prev, [key]: { status: 'error', message } }));
    }
  }

  async function handleWriteWithToken(token: LicenseToken) {
    const key = tokenKey(token);
    const text = writeTexts[key] ?? '';
    setTokenWriteStates((prev) => ({ ...prev, [key]: { status: 'writing' } }));
    try {
      const payload = { text, ts: new Date().toISOString() };
      const result =
        token.lock === 'license'
          ? await writeWithContractToken({
              holderKey: wallet.material,
              token,
              payload,
              provider,
              config: chainConfig,
              eventBus,
              repository: bsvTokenRepo,
              pendingSpendRepo: bsvPendingSpendRepo,
            })
          : await writeWithToken({
              holderKey: wallet.material,
              token,
              payload,
              provider,
              config: chainConfig,
              eventBus,
              repository: bsvTokenRepo,
              pendingSpendRepo: bsvPendingSpendRepo,
            });
      const requestId = ++latestListRequest.current;
      const list = await bsvTokenRepo.list();
      if (requestId === latestListRequest.current) setTokens(list);
      setTokenWriteStates((prev) => ({ ...prev, [key]: { status: 'done', txid: result.txid } }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not write with token';
      setTokenWriteStates((prev) => ({ ...prev, [key]: { status: 'error', message } }));
    }
  }

  async function handleHistory(token: LicenseToken) {
    const key = tokenKey(token);
    setHistoryStates((prev) => ({ ...prev, [key]: { status: 'loading' } }));
    try {
      const result = await followLicenseToken({ origin: token.origin, provider });
      setHistoryStates((prev) => ({ ...prev, [key]: { status: 'done', result } }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not follow token lineage';
      setHistoryStates((prev) => ({ ...prev, [key]: { status: 'error', message } }));
    }
  }

  const canMint = hasBalance && mintState.status !== 'minting';

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sf-muted text-sm">Mint a License Token to this device's own address</p>
      <div className="flex items-center gap-4 text-sm">
        <label htmlFor="bsv-mint-lock-p2pkh" className="flex items-center gap-1 text-sf-text">
          <input
            id="bsv-mint-lock-p2pkh"
            type="radio"
            name="bsv-mint-lock"
            value="p2pkh"
            checked={mintLock === 'p2pkh'}
            onChange={() => setMintLock('p2pkh')}
          />
          P2PKH
        </label>
        <label htmlFor="bsv-mint-lock-license" className="flex items-center gap-1 text-sf-text">
          <input
            id="bsv-mint-lock-license"
            type="radio"
            name="bsv-mint-lock"
            value="license"
            checked={mintLock === 'license'}
            onChange={() => setMintLock('license')}
          />
          License
        </label>
      </div>
      <button
        onClick={handleMint}
        disabled={!canMint}
        className="rounded-lg bg-sf-primary text-white font-semibold px-4 py-3 self-start disabled:opacity-50"
        style={{ minHeight: 'var(--sf-tap-target-size)' }}
      >
        {mintState.status === 'minting' ? 'Minting…' : 'Mint token'}
      </button>
      {mintState.status === 'done' && (
        <p data-testid="bsv-mint-txid" className="text-sf-text font-mono select-all break-all">
          {mintState.txid}
        </p>
      )}
      {mintState.status === 'error' && <p className="text-red-600">{mintState.message}</p>}

      <p className="text-sf-muted text-sm mt-2">Tokens</p>
      {tokens.length === 0 && <p className="text-sf-text">no tokens minted yet</p>}
      {tokens.map((token) => {
        const key = tokenKey(token);
        const isLicenseLock = token.lock === 'license';
        const toValue = transferAddresses[key] ?? '';
        const transferState = transferStates[key] ?? { status: 'idle' };
        const isValidTransferTarget = isLicenseLock ? isValidCompressedPublicKeyHex(toValue) : isValidTestnetAddress(toValue);
        const canTransfer = isValidTransferTarget && transferState.status !== 'transferring';
        const writeText = writeTexts[key] ?? '';
        const tokenWriteState = tokenWriteStates[key] ?? { status: 'idle' };
        const historyState = historyStates[key] ?? { status: 'idle' };
        const canWriteWithToken = hasBalance && writeText.trim().length > 0 && tokenWriteState.status !== 'writing';
        return (
          <div key={key} data-testid="bsv-token-entry" className="text-sf-text border-t border-sf-border pt-2 text-sm">
            <p className="font-mono break-all">{`origin ${token.origin.txid}:${token.origin.vout}`}</p>
            <p className="font-mono break-all">{`current ${token.current.txid}:${token.current.vout}`}</p>
            <p className="font-mono break-all">{`holder ${token.holderAddress}`}</p>
            <p className="font-mono break-all">{`lock ${token.lock}`}</p>
            {isLicenseLock && token.artifact && <p className="font-mono break-all">{`artifact ${token.artifact}`}</p>}
            {isLicenseLock && (
              <div className="flex items-center gap-2">
                <p data-testid="bsv-token-fuel" className="font-mono break-all">
                  {fuelRowText(fuelDisplays[key], chainConfig.feeRateSatPerKb)}
                </p>
                <button
                  onClick={() => loadFuel(token)}
                  className="text-sf-muted text-sm hover:text-sf-secondary"
                >
                  Refresh fuel
                </button>
              </div>
            )}

            <div className="flex flex-col gap-1 mt-2">
              <label htmlFor={`bsv-transfer-to-${key}`} className="text-sf-muted text-sm">
                {isLicenseLock ? 'Transfer to public key' : 'Transfer to address'}
              </label>
              <input
                id={`bsv-transfer-to-${key}`}
                type="text"
                value={toValue}
                onChange={(event) =>
                  setTransferAddresses((prev) => ({ ...prev, [key]: event.target.value }))
                }
                className="rounded-lg border border-sf-border-strong bg-sf-surface text-sf-text font-mono px-3 py-2 text-sm"
                style={{ minHeight: 'var(--sf-tap-target-size)' }}
              />
              <button
                onClick={() => handleTransfer(token)}
                disabled={!canTransfer}
                className="rounded-lg border border-sf-border-strong text-sf-text px-4 py-2 text-sm self-start disabled:opacity-50"
                style={{ minHeight: 'var(--sf-tap-target-size)' }}
              >
                {transferState.status === 'transferring' ? 'Transferring…' : 'Transfer'}
              </button>
              {transferState.status === 'done' && (
                <p data-testid="bsv-transfer-txid" className="text-sf-text font-mono select-all break-all">
                  {transferState.txid}
                </p>
              )}
              {transferState.status === 'error' && <p className="text-red-600">{transferState.message}</p>}
            </div>

            <div className="flex flex-col gap-1 mt-2">
              <label htmlFor={`bsv-token-write-text-${key}`} className="text-sf-muted text-sm">
                Write with token
              </label>
              <textarea
                id={`bsv-token-write-text-${key}`}
                value={writeText}
                onChange={(event) => setWriteTexts((prev) => ({ ...prev, [key]: event.target.value }))}
                className="rounded-lg border border-sf-border-strong bg-sf-surface text-sf-text px-3 py-2 text-sm"
                rows={2}
              />
              <button
                onClick={() => handleWriteWithToken(token)}
                disabled={!canWriteWithToken}
                className="rounded-lg border border-sf-border-strong text-sf-text px-4 py-2 text-sm self-start disabled:opacity-50"
                style={{ minHeight: 'var(--sf-tap-target-size)' }}
              >
                {tokenWriteState.status === 'writing' ? 'Writing…' : 'Write with token'}
              </button>
              {tokenWriteState.status === 'done' && (
                <p data-testid="bsv-token-write-txid" className="text-sf-text font-mono select-all break-all">
                  {tokenWriteState.txid}
                </p>
              )}
              {tokenWriteState.status === 'error' && <p className="text-red-600">{tokenWriteState.message}</p>}
            </div>

            <div className="flex flex-col gap-1 mt-2">
              <button
                onClick={() => handleHistory(token)}
                disabled={historyState.status === 'loading'}
                className="rounded-lg border border-sf-border-strong text-sf-text px-4 py-2 text-sm self-start disabled:opacity-50"
                style={{ minHeight: 'var(--sf-tap-target-size)' }}
              >
                {historyState.status === 'loading' ? 'Loading history…' : 'History'}
              </button>
              {historyState.status === 'error' && <p className="text-red-600">{historyState.message}</p>}
              {historyState.status === 'done' && (
                <div data-testid="bsv-token-history" className="flex flex-col gap-2">
                  {historyState.result.brokenAtTxid && (
                    <p className="text-red-600">{`lineage broken at ${historyState.result.brokenAtTxid}`}</p>
                  )}
                  {historyState.result.hops.map((hop, index) => (
                    <div key={`${hop.txid}-${index}`} data-testid="bsv-lineage-hop" className="border-t border-sf-border pt-1">
                      <p className="text-sf-muted text-sm">{`${hop.kind} · ${hop.holderAddress}`}</p>
                      <p className="font-mono select-all break-all text-sm">{hop.txid}</p>
                      {hop.text && <p className="break-words">{hop.text}</p>}
                    </div>
                  ))}
                  <button
                    onClick={() => handleHistory(token)}
                    className="rounded-lg border border-sf-border-strong text-sf-text px-4 py-2 text-sm self-start"
                    style={{ minHeight: 'var(--sf-tap-target-size)' }}
                  >
                    Refresh
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
