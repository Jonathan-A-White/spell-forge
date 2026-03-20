// src/core/haptics.ts — Haptic feedback via the Vibration API

/**
 * Triggers a short vibration for correct letter taps.
 * Falls back silently when the Vibration API is unavailable (desktop browsers).
 */
export function hapticTap(): void {
  navigator.vibrate?.(15);
}

/**
 * Triggers a double-pulse vibration for wrong letter taps.
 */
export function hapticError(): void {
  navigator.vibrate?.([30, 50, 30]);
}

/**
 * Triggers a success vibration pattern (e.g. word completed).
 */
export function hapticSuccess(): void {
  navigator.vibrate?.([15, 40, 15, 40, 30]);
}
