// src/features/feedback/feedback-sync-banner.tsx — Banner shown when unsent feedback is detected

import { useOfflineFeedbackSync } from './use-offline-feedback-sync';

export function FeedbackSyncBanner() {
  const { pending, sendPending, dismiss } = useOfflineFeedbackSync();

  if (!pending) return null;

  const count = pending.items.length;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-sf-primary text-sf-primary-text px-4 py-3 flex items-center justify-between gap-3 z-50 shadow-lg">
      <p className="text-sm font-medium flex-1">
        You have {count} unsent feedback {count === 1 ? 'message' : 'messages'}.
      </p>
      <button
        onClick={sendPending}
        className="bg-white text-sf-primary font-bold text-sm px-4 py-2 rounded-lg whitespace-nowrap"
      >
        Send Now
      </button>
      <button
        onClick={dismiss}
        className="text-sf-primary-text opacity-70 hover:opacity-100 text-sm px-2 py-2"
        aria-label="Dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}
