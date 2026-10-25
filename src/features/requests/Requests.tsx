// src/features/requests/Requests.tsx — Grown-ups' Requests: the things people are expected to ask the maker for, to pick from (a pick opens
// the tutor to say it), and every request filed so far, grouped by who asked with where it stands (@pwa-kit/requests' RequestsList). There is
// no form: an ask is made by talking to the tutor, which offers to pass it on. Statuses read "Sent" until a reader of the maker's answers
// is given to createMakerRequests.
import { useEffect, useState } from 'react';
import { GROWN_UP, RequestsList, askRows, type ExpectedAsk, type RequestRecord, type Requests as RequestsApi } from 'pwa-kit/requests';
import { EXPECTED_ASKS } from './expected-asks';
import './requests-theme.css';

export const GROWN_UP_NAME = 'A grown-up';

export interface RequestsProps {
  requests: RequestsApi;
  /** The words for each learner's id; the grown-up is named here. */
  names: Readonly<Record<string, string>>;
  /** He picked an expected ask: take them to the tutor to say it. */
  onAsk: (ask: ExpectedAsk) => void;
  onBack: () => void;
}

export function Requests({ requests, names, onAsk, onBack }: RequestsProps) {
  const [records, setRecords] = useState<RequestRecord[] | undefined>();

  useEffect(() => {
    let current = true;
    void requests.list().then((list) => {
      if (current) setRecords(list);
    });
    return () => {
      current = false;
    };
  }, [requests]);

  const rows = askRows(EXPECTED_ASKS, records ?? []);

  return (
    <div className="min-h-screen bg-sf-bg p-4 max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-sf-muted hover:text-sf-secondary px-2"
          style={{ minHeight: 'var(--sf-tap-target-size, 48px)' }}
        >
          Back
        </button>
        <h1 className="text-xl font-bold text-sf-heading">Requests to the maker</h1>
        <div className="w-12" />
      </div>

      <p className="text-sf-text">
        Tell the tutor what SpellForge should do that it does not. The tutor offers to pass it on, and nothing is sent until you tap Send.
      </p>

      <section aria-label="Things people ask for" className="space-y-3">
        <h2 className="text-lg font-bold text-sf-heading">Things people ask for</h2>
        <ul aria-label="Things people ask for" className="space-y-2">
          {rows.map((row) => {
            const ask = EXPECTED_ASKS.find((a) => a.id === row.id) as ExpectedAsk;
            return (
              <li key={row.id} className="rounded-xl border border-sf-border bg-sf-surface p-3">
                <button
                  type="button"
                  onClick={() => onAsk(ask)}
                  className="w-full text-left active:scale-[0.99]"
                  style={{ minHeight: 'var(--sf-tap-target-size, 48px)' }}
                >
                  <span className="block font-bold text-sf-heading">{row.title}</span>
                  {row.hint && <span className="block text-sm text-sf-muted">{row.hint}</span>}
                </button>
                {row.asked && (
                  <p className="text-sm text-sf-text mt-1">
                    Asked · <span>{statusWords(row.status)}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Requests so far" className="space-y-3">
        <h2 className="text-lg font-bold text-sf-heading">Requests so far</h2>
        {records && (
          <RequestsList
            records={records}
            names={{ ...names, [GROWN_UP]: GROWN_UP_NAME }}
            order={[GROWN_UP, ...Object.keys(names)]}
            empty="Nothing asked yet."
          />
        )}
      </section>
    </div>
  );
}

/** askRows gives the status as the kit keeps it; the screen says it in the same words RequestsList does. */
function statusWords(status: string | undefined): string {
  switch (status) {
    case 'filed':
      return 'Filed';
    case 'building':
      return 'Being built';
    case 'landed':
      return 'Adopted';
    case 'declined':
      return 'Declined';
    case 'adopted-as-setting':
      return 'Now a setting';
    default:
      return 'Sent';
  }
}
