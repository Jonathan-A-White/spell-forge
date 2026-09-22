// src/features/bsv-debug/bsv-debug-screen.tsx — Hidden BSV debug screen (phase 1 placeholder).

import { chainConfig } from '../../bsv';

interface BsvDebugScreenProps {
  onBack: () => void;
}

export function BsvDebugScreen({ onBack }: BsvDebugScreenProps) {
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

      <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto px-4 py-6">
        <p className="text-sf-text">{`network: ${chainConfig.network}`}</p>
      </div>
    </div>
  );
}
