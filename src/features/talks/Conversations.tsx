// src/features/talks/Conversations.tsx — every talk the front door has kept on the phone, as a searchable list (voice-kit's TalkList over the
// talks store); a tap opens one to read, his words and the tutor's, and Back returns to the list. The talks are read, never changed here.
import { useEffect, useState } from 'react';
import { TalkList } from 'voice-kit/talks/react';
import type { Talk, TalkReader } from 'voice-kit/talks';
import 'voice-kit/talks/styles.css';
import './talks-theme.css';

export interface ConversationsProps {
  /** Where the talks are read: the front door's store. */
  store: TalkReader;
  onBack: () => void;
}

const button = 'text-sf-muted hover:text-sf-secondary px-2';
const tapSize = { minHeight: 'var(--sf-tap-target-size, 48px)' } as const;

/** One talk, read from the top: who said what. */
function Reading({ store, id, onBack }: { store: TalkReader; id: string; onBack: () => void }) {
  const [talk, setTalk] = useState<Talk | null | undefined>();

  useEffect(() => {
    let current = true;
    void store.get(id).then((found) => {
      if (current) setTalk(found ?? null);
    });
    return () => {
      current = false;
    };
  }, [store, id]);

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className={button} style={tapSize}>
        Back to conversations
      </button>
      {talk === null && <p className="text-sf-text">This conversation is not there any more.</p>}
      {talk && (
        <section aria-label="Conversation" className="space-y-3">
          {talk.turns.map((turn, index) => (
            <div key={index} className={turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <p
                className={`max-w-[85%] whitespace-pre-line break-words rounded-2xl px-4 py-2 text-sf-text border border-sf-border ${
                  turn.role === 'user' ? 'bg-sf-input-bg' : 'bg-sf-surface'
                }`}
              >
                {turn.text}
              </p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export function Conversations({ store, onBack }: ConversationsProps) {
  const [open, setOpen] = useState<string | undefined>();

  return (
    <div className="min-h-screen bg-sf-bg p-4 max-w-lg mx-auto space-y-4">
      {open === undefined ? (
        <>
          <div className="flex items-center justify-between">
            <button type="button" onClick={onBack} className={button} style={tapSize}>
              Back
            </button>
            <h1 className="text-xl font-bold text-sf-heading">Conversations</h1>
            <div className="w-12" />
          </div>
          <TalkList
            store={store}
            onOpen={setOpen}
            labels={{ placeholder: 'Search' }}
            // a talk he opened the door on and said nothing in is not a conversation
            filter={(row) => row.summary.turnCount > 0}
            // every door talk is titled alike, so a row says what the talk began with (or what was found in it)
            renderRow={(row, open) => (
              <button type="button" className="bk-talklist__row" onClick={open}>
                <span className="bk-talklist__title">{row.line || row.title || 'A talk'}</span>
                <span className="bk-talklist__meta">
                  <span>{new Date(row.updatedAt).toLocaleDateString()}</span>
                  <span>{row.summary.turnCount === 1 ? '1 turn' : `${row.summary.turnCount} turns`}</span>
                </span>
              </button>
            )}
          />
        </>
      ) : (
        <Reading store={store} id={open} onBack={() => setOpen(undefined)} />
      )}
    </div>
  );
}
