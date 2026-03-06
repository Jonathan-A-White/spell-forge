// src/features/settings/theme-toggle.tsx — Light / Dark / High-contrast toggle

import type { AccessibilitySettings } from '../../contracts/types';

type ContrastMode = AccessibilitySettings['contrastMode'];

interface ThemeToggleProps {
  current: ContrastMode;
  onChange: (mode: ContrastMode) => void;
}

const modes: { value: ContrastMode; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'high-contrast', label: 'High Contrast', icon: 'eye' },
];

function ModeIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'sun':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      );
    case 'moon':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
    case 'eye':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    default:
      return null;
  }
}

export function ThemeToggle({ current, onChange }: ThemeToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-sf-surface border border-sf-border p-1">
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => onChange(mode.value)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            current === mode.value
              ? 'bg-sf-primary text-sf-primary-text shadow-sm'
              : 'text-sf-muted hover:text-sf-text hover:bg-sf-surface-hover'
          }`}
          aria-label={`Switch to ${mode.label} mode`}
          aria-pressed={current === mode.value}
        >
          <ModeIcon icon={mode.icon} />
          <span className="hidden sm:inline">{mode.label}</span>
        </button>
      ))}
    </div>
  );
}
