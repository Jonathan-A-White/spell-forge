// src/features/device-key/device-key-section.tsx — Settings section: this device's public key, created on a tap.

import { useEffect, useState } from 'react';
import type { BsvWalletKey } from '../../contracts/types';
import { bsvWalletRepo } from '../../data/repositories';
import { createDeviceKey } from './create-device-key';
import { DevicePublicKey } from './device-public-key';

/** Never renders the private key: only the public key hex, Copy and QR (via DevicePublicKey). */
export function DeviceKeySection() {
  const [wallet, setWallet] = useState<BsvWalletKey | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    bsvWalletRepo.getCurrent().then((current) => {
      if (!cancelled) setWallet(current ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate() {
    setWallet(await createDeviceKey());
  }

  return (
    <section>
      <h2 className="text-sm font-bold text-sf-muted uppercase tracking-wider mb-1">
        This device&apos;s key
      </h2>
      <p className="text-xs text-sf-muted mb-3">Give this to whoever issues your licence</p>
      {wallet && <DevicePublicKey wif={wallet.material} />}
      {wallet === null && (
        <button
          onClick={handleCreate}
          className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-sf-border bg-sf-surface hover:border-sf-border-strong hover:bg-sf-surface-hover transition-all active:scale-[0.98]"
          style={{ minHeight: 'var(--sf-tap-target-size)' }}
        >
          <p className="font-bold text-sm text-sf-text">Create this device&apos;s key</p>
        </button>
      )}
    </section>
  );
}
