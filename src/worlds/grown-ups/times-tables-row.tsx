// src/worlds/grown-ups/times-tables-row.tsx: 'Math: Times tables', a row of the Grown-ups screen. A school teaches the tables one at a time, so
// the Math drill asks only the tables open for the child: ×1 first after a placement at Times tables, and the next in school order when the
// newest is solid. A grown-up ticks a table to open it (the child's school may be ahead or behind) or unticks it to close it; with none ticked
// Math mixes the tables as it always did. Nothing here touches the network.

import { useEffect, useMemo, useState } from 'react';
import { ALL_TABLES } from '../../learn/maths';
import { setOpenTables, storageKeep, type MathsKeep } from '../maths';

export interface TimesTablesRowProps {
  profileId: string;
  /** The child's keep; the phone's own (localStorage) when absent. */
  keep?: MathsKeep;
}

const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;

export function TimesTablesRow({ profileId, keep: givenKeep }: TimesTablesRowProps) {
  const keep = useMemo(() => givenKeep ?? storageKeep(profileId), [givenKeep, profileId]);
  const [open, setOpen] = useState(false);
  const [tables, setTables] = useState<readonly number[] | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    void keep.load().then((kept) => {
      if (alive) setTables(kept.tables ?? []);
    });
    return () => {
      alive = false;
    };
  }, [open, keep]);

  const toggle = async (table: number) => {
    const now = tables ?? [];
    await setOpenTables(keep, now.includes(table) ? now.filter((t) => t !== table) : [...now, table]);
    setTables((await keep.load()).tables ?? []);
  };

  const ticked = tables ?? [];
  return (
    <section aria-labelledby="times-tables-title" className="rounded-xl bg-sf-surface border border-sf-border p-4 space-y-3">
      <button
        type="button"
        id="times-tables-title"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left text-sf-heading font-bold text-lg flex items-center justify-between"
        style={TAP}
      >
        <span>Math: Times tables</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="space-y-3">
          <p className="text-sm text-sf-muted">
            School teaches one table at a time. Tick the tables your child has met: Math asks only those, and the next one opens by itself when the newest is solid.
          </p>
          {tables !== null && ticked.length === 0 && (
            <p className="text-sm text-sf-text">No table is chosen yet, so Math mixes the tables from ×2 to ×10. Tick one to ask only the ones you pick.</p>
          )}
          <ul className="grid grid-cols-3 gap-2">
            {ALL_TABLES.map((table) => (
              <li key={table}>
                <label className="flex items-center gap-2 px-3 rounded-lg bg-sf-bg border border-sf-border text-sf-text" style={TAP}>
                  <input type="checkbox" aria-label={`×${table} table`} checked={ticked.includes(table)} onChange={() => void toggle(table)} />
                  <span aria-hidden="true">×{table}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
