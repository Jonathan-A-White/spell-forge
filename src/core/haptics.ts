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

/**
 * Push-to-talk: the microphone is recording, speak now (30 ms).
 */
export function hapticReady(): void {
  navigator.vibrate?.(30);
}

/**
 * Push-to-talk: the button was let go (15 ms).
 */
export function hapticRelease(): void {
  navigator.vibrate?.(15);
}
