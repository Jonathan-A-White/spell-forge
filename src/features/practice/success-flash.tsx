// src/features/practice/success-flash.tsx — Brief success animation after a correct answer

import { useEffect, useState } from 'react';

interface SuccessFlashProps {
  /** Called when the animation finishes and the next word should appear */
  onDone: () => void;
  /** How long to display in ms (default 1000) */
  duration?: number;
}

export function SuccessFlash({ onDone, duration = 1000 }: SuccessFlashProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDone();
    }, duration);
    return () => clearTimeout(timer);
  }, [onDone, duration]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      role="status"
      aria-live="assertive"
      aria-label="Correct!"
    >
      <div className="animate-success-flash flex flex-col items-center gap-3">
        {/* Checkmark circle */}
        <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30">
          <svg
            className="w-14 h-14 text-white animate-success-check"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <span className="text-green-400 font-bold text-2xl tracking-wide">
          Correct!
        </span>
      </div>
    </div>
  );
}
