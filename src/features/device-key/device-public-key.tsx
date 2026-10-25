// src/features/device-key/device-public-key.tsx — This device's public key (hex, Copy, QR) for the issuer.

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { publicKeyHexFromWif } from '../../bsv';

interface DevicePublicKeyProps {
  wif: string;
}

const SLASH_STYLE = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: '0.95em',
  marginLeft: '-0.475em',
  borderTop: '0.1em solid currentColor',
  transform: 'rotate(-62deg)',
} as const;

/** A zero with a slash through it, drawn here so no font can leave it plain: the text is still the one character "0". */
function SlashedZero() {
  return (
    <span className="sf-zero" style={{ position: 'relative', display: 'inline-block' }}>
      0<span aria-hidden="true" style={SLASH_STYLE} />
    </span>
  );
}

/** The key's characters, each 0 slashed (M32: a 0 must never be taken for an O when it is read out or typed). */
function withSlashedZeros(hex: string) {
  return [...hex].map((char, i) => (char === '0' ? <SlashedZero key={i} /> : char));
}

/**
 * Shows the compressed public key of the device wallet so the issuer can paste or scan it into
 * Postern's "Issue a licence" (field "Holder's public key"). Nothing is minted or sent from here.
 */
export function DevicePublicKey({ wif }: DevicePublicKeyProps) {
  const publicKeyHex = publicKeyHexFromWif(wif);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(publicKeyHex, { errorCorrectionLevel: 'M', margin: 2, width: 192 })
      .then((url) => {
        if (!cancelled) setQrSrc(url);
      })
      .catch(() => {
        if (!cancelled) setQrSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKeyHex]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(publicKeyHex);
      setCopied(true);
    } catch {
      // best-effort — some contexts (older browsers, non-secure origins) have no clipboard API
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sf-muted text-sm">This device&apos;s public key</p>
      <p data-testid="bsv-device-public-key" className="text-sf-text font-mono select-all break-all">
        {withSlashedZeros(publicKeyHex)}
      </p>
      <button
        onClick={handleCopy}
        className="rounded-lg border border-sf-border-strong text-sf-text px-4 py-2 text-sm self-start"
        style={{ minHeight: 'var(--sf-tap-target-size)' }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      {qrSrc && (
        <img
          src={qrSrc}
          alt="QR code of this device's public key"
          width={192}
          height={192}
          className="w-48 h-48"
        />
      )}
    </div>
  );
}
