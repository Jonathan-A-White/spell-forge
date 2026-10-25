// src/features/requests/MakerOfferCard.tsx — under a tutor line that offers to pass an ask on: the one button, "Send this to the maker".
// Nothing is sent until it is tapped. Sent (or already sent today, the same thing to him) says so; a send that fails says why and the
// button stays, so the same words can be tried again; a refusal (the day's requests are spent) shows the kit's words.
import { useState } from 'react';
import type { Requests } from 'pwa-kit/requests';
import { sendToMaker, type MakerOffer } from './file-from-talk';
import { MakerRequestError } from './maker-sender';

export const SEND_TO_MAKER = 'Send this to the maker';
export const SENT_TO_MAKER = 'Sent. The answer will come back.';
const NOT_SENT = 'The request could not be sent just now. Tap Send again.';

type Phase = { is: 'idle' } | { is: 'sending' } | { is: 'sent' } | { is: 'note'; words: string };

export interface MakerOfferCardProps {
  offer: MakerOffer;
  requests: Requests;
  /** Who asks: the child's id, or GROWN_UP. */
  who: string;
  /** The expected ask this answers, when the talk was opened from one. */
  askId?: string;
}

export function MakerOfferCard({ offer, requests, who, askId }: MakerOfferCardProps) {
  const [phase, setPhase] = useState<Phase>({ is: 'idle' });

  const send = async () => {
    setPhase({ is: 'sending' });
    try {
      const result = await sendToMaker(requests, offer, who, askId);
      setPhase(result.outcome === 'refused' ? { is: 'note', words: result.message } : { is: 'sent' });
    } catch (error) {
      setPhase({ is: 'note', words: error instanceof MakerRequestError ? error.message : NOT_SENT });
    }
  };

  if (phase.is === 'sent') {
    return (
      <p role="status" className="text-sf-text font-bold px-2">
        {SENT_TO_MAKER}
      </p>
    );
  }

  return (
    <div className="space-y-2 px-2">
      <button
        type="button"
        disabled={phase.is === 'sending'}
        onClick={() => void send()}
        className="rounded-xl bg-sf-primary text-white font-bold px-5 py-3 disabled:opacity-60 active:scale-[0.97]"
        style={{ minHeight: 'var(--sf-tap-target-size, 48px)' }}
      >
        {SEND_TO_MAKER}
      </button>
      {phase.is === 'note' && (
        <p role="alert" className="text-sf-text text-sm">
          {phase.words}
        </p>
      )}
    </div>
  );
}
