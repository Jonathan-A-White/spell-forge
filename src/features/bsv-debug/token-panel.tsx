// src/features/bsv-debug/token-panel.tsx — Mints a License Token to this device's own
// address (single-install: the app is issuer and holder at once) and lists its tokens.

import { useEffect, useRef, useState } from 'react';
import { chainConfig, mintLicenseToken } from '../../bsv';
import type { ChainProvider, LicenseToken } from '../../bsv';
import { bsvTokenRepo } from '../../data/repositories';
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

export function TokenPanel({ wallet, hasBalance, provider, eventBus }: TokenPanelProps) {
  const [tokens, setTokens] = useState<LicenseToken[]>([]);
  const [mintState, setMintState] = useState<MintState>({ status: 'idle' });
  // Guards against an earlier-issued list() resolving after a later one (e.g. the
  // mount load finishing after a mint's own reload) and clobbering the newer result.
  const latestListRequest = useRef(0);

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
      const token = await mintLicenseToken({
        issuerKey: wallet.material,
        holderAddress: wallet.address,
        provider,
        config: chainConfig,
        eventBus,
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

  const canMint = hasBalance && mintState.status !== 'minting';

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sf-muted text-sm">Mint a License Token to this device's own address</p>
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
      {tokens.map((token) => (
        <div
          key={`${token.origin.txid}:${token.origin.vout}`}
          data-testid="bsv-token-entry"
          className="text-sf-text border-t border-sf-border pt-2 text-sm"
        >
          <p className="font-mono break-all">{`origin ${token.origin.txid}:${token.origin.vout}`}</p>
          <p className="font-mono break-all">{`current ${token.current.txid}:${token.current.vout}`}</p>
          <p className="font-mono break-all">{`holder ${token.holderAddress}`}</p>
        </div>
      ))}
    </div>
  );
}
