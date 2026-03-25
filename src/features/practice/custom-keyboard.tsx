// src/features/practice/custom-keyboard.tsx — On-screen keyboard with multilingual support.
// Renders language-specific layouts from the language registry. Falls back to English QWERTY.

import { useCallback, useRef, useEffect } from 'react';
import { hapticTap } from '../../core/haptics';
import { getLanguageConfig } from '../../i18n/language-registry.ts';

interface CustomKeyboardProps {
  onKey: (key: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  submitLabel?: string;
  submitDisabled?: boolean;
  tapTargetSize?: number;
  /** Language code for keyboard layout (defaults to 'en'). */
  language?: string;
}

/** Prevent mousedown from stealing focus away from the display field */
function preventFocusLoss(e: React.MouseEvent) {
  e.preventDefault();
}

const DEFAULT_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

function getKeyboardLayout(language: string): { rows: string[][]; accentRow?: string[] } {
  const config = getLanguageConfig(language);
  return {
    rows: config.keyboardRows ?? DEFAULT_ROWS,
    accentRow: config.accentRow,
  };
}

export function CustomKeyboard({
  onKey,
  onBackspace,
  onSubmit,
  disabled = false,
  submitLabel = 'Check',
  submitDisabled = false,
  tapTargetSize = 44,
  language = 'en',
}: CustomKeyboardProps) {
  const keySize = Math.max(36, tapTargetSize * 0.8);
  const fontSize = `${Math.max(16, keySize * 0.5)}px`;
  const layout = getKeyboardLayout(language);

  return (
    <div className="flex flex-col items-center gap-1.5 w-full select-none" role="group" aria-label="Keyboard">
      {/* Accent row (if the language has one) */}
      {layout.accentRow && (
        <div className="flex gap-1 justify-center w-full">
          {layout.accentRow.map((key) => (
            <button
              key={key}
              type="button"
              onMouseDown={preventFocusLoss}
              onClick={() => { if (!disabled) { hapticTap(); onKey(key); } }}
              disabled={disabled}
              className="flex-1 max-w-[14%] rounded-lg bg-amber-50 border border-amber-300 font-bold text-sf-heading active:bg-sf-primary active:text-sf-primary-text transition-colors disabled:opacity-40"
              style={{ minHeight: `${keySize}px`, fontSize }}
              aria-label={key}
            >
              {key}
            </button>
          ))}
        </div>
      )}

      {layout.rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-1 justify-center w-full">
          {row.map((key) => (
            <button
              key={key}
              type="button"
              onMouseDown={preventFocusLoss}
              onClick={() => { if (!disabled) { hapticTap(); onKey(key); } }}
              disabled={disabled}
              className="flex-1 max-w-[10%] rounded-lg bg-sf-surface border border-sf-border font-bold text-sf-heading active:bg-sf-primary active:text-sf-primary-text transition-colors disabled:opacity-40"
              style={{ minHeight: `${keySize}px`, fontSize }}
              aria-label={key}
            >
              {key}
            </button>
          ))}
          {rowIndex === layout.rows.length - 1 && (
            <button
              type="button"
              onMouseDown={preventFocusLoss}
              onClick={() => { if (!disabled) { hapticTap(); onBackspace(); } }}
              disabled={disabled}
              className="flex-[1.5] max-w-[15%] rounded-lg bg-sf-surface border border-sf-border font-bold text-sf-heading active:bg-red-400 active:text-white transition-colors disabled:opacity-40"
              style={{ minHeight: `${keySize}px`, fontSize }}
              aria-label="Backspace"
            >
              ←
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={() => { if (!submitDisabled) onSubmit(); }}
        disabled={submitDisabled}
        className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed mt-1"
        style={{ minHeight: `${tapTargetSize}px`, fontSize: `${Math.max(16, tapTargetSize * 0.4)}px` }}
      >
        {submitLabel}
      </button>
    </div>
  );
}

// ─── Display-only input field + keyboard combo ──────────────

interface SpellingFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  submitLabel?: string;
  submitDisabled?: boolean;
  tapTargetSize: number;
  fontSize?: string;
  className?: string;
  ariaLabel?: string;
  /** Extra class for the display div (e.g. error flash styling) */
  displayClassName?: string;
  /** Language code for keyboard layout and input filtering. */
  language?: string;
}

export function SpellingField({
  value,
  onChange,
  onSubmit,
  placeholder = 'Type the word...',
  disabled = false,
  submitLabel = 'Check',
  submitDisabled,
  tapTargetSize,
  fontSize: fontSizeProp,
  className = '',
  ariaLabel = 'Type the spelling word',
  displayClassName,
  language = 'en',
}: SpellingFieldProps) {
  const fontSize = fontSizeProp ?? `${Math.max(20, tapTargetSize * 0.55)}px`;
  const cursorRef = useRef<HTMLSpanElement>(null);

  // Blink cursor animation
  useEffect(() => {
    if (disabled) return;
    const el = cursorRef.current;
    if (!el) return;
    let visible = true;
    const interval = setInterval(() => {
      visible = !visible;
      el.style.opacity = visible ? '1' : '0';
    }, 530);
    return () => clearInterval(interval);
  }, [disabled]);

  // Handle physical keyboard for accessibility (desktop fallback)
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePhysicalKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmit();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        onChange(value.slice(0, -1));
      } else if (e.key.length === 1) {
        const lower = e.key.toLowerCase();
        // Build allowed character set inside the callback to avoid dependency issues
        const config = getLanguageConfig(language);
        const allowedChars = new Set([
          ...config.alphabet.split(''),
          ...config.extraCharacters,
          ...(config.accentRow ?? []),
          ...(config.keyboardRows?.flat() ?? []),
        ]);
        if (allowedChars.has(lower)) {
          e.preventDefault();
          onChange(value + lower);
        }
      }
    },
    [disabled, value, onChange, onSubmit, language],
  );

  const handleKey = useCallback(
    (key: string) => onChange(value + key),
    [value, onChange],
  );

  const handleBackspace = useCallback(
    () => onChange(value.slice(0, -1)),
    [value, onChange],
  );

  const effectiveSubmitDisabled = submitDisabled ?? (disabled || value.trim().length === 0);

  return (
    <div className={`flex flex-col items-center gap-3 w-full ${className}`}>
      {/* Read-only display field — tapping focuses for physical keyboard, but inputMode none prevents virtual keyboard */}
      <div
        ref={containerRef}
        tabIndex={0}
        role="textbox"
        aria-label={ariaLabel}
        aria-readonly="false"
        onKeyDown={handlePhysicalKey}
        className={`w-full text-center font-bold rounded-xl border-2 border-sf-border-strong bg-sf-surface text-sf-heading focus:border-sf-primary focus:outline-none transition-colors cursor-text ${displayClassName ?? ''}`}
        style={{
          fontSize,
          padding: `${tapTargetSize * 0.3}px ${tapTargetSize * 0.4}px`,
          minHeight: `${tapTargetSize}px`,
        }}
      >
        {value ? (
          <span>
            {value}
            {!disabled && (
              <span ref={cursorRef} className="inline-block w-[2px] h-[1em] bg-sf-heading align-text-bottom ml-px" />
            )}
          </span>
        ) : (
          <span className="text-sf-muted">{placeholder}</span>
        )}
      </div>

      <CustomKeyboard
        onKey={handleKey}
        onBackspace={handleBackspace}
        onSubmit={onSubmit}
        disabled={disabled}
        submitLabel={submitLabel}
        submitDisabled={effectiveSubmitDisabled}
        tapTargetSize={tapTargetSize}
        language={language}
      />
    </div>
  );
}
