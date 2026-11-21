// src/worlds/grown-ups/where-to-start.tsx: 'Math: where to start', a row of the Grown-ups screen. School has its own pace, so a grown-up can
// place the child at a topic instead of the placement test: the topics are listed by grade band in the child's words (the nodes' names),
// searchable, with what he has solid ticked. Picking one and confirming 'Start here' marks everything it needs solid (placeAt) and the next
// Math sitting starts at it; 'Redo the placement test' clears the placement so the next entry runs the test again. Nothing here touches the network.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GraphStore } from 'learn-kit/graph';
import { profileRepo } from '../../data/repositories';
import { GRADE_BANDS, mathsGraph, nodesInBand, type GradeBand, type MathsNode } from '../../learn/maths';
import { placeAt, redoPlacement, storageGraphStore, storageKeep, type MathsKeep } from '../maths';

export interface WhereToStartProps {
  profileId: string;
  /** The child's graph store and keep; the phone's own (localStorage) when absent. */
  store?: GraphStore;
  keep?: MathsKeep;
}

const BAND_TITLE: Record<GradeBand, string> = {
  preK: 'Pre-K',
  K: 'Kindergarten',
  '1-2': 'Grades 1 and 2',
  '3-5': 'Grades 3 to 5',
  '6-8': 'Grades 6 to 8',
  '9-12': 'Grades 9 to 12',
  competition: 'Competition',
};

const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;
const BUTTON = 'px-4 rounded-xl font-bold bg-sf-surface border border-sf-border text-sf-heading hover:border-sf-border-strong active:scale-[0.97] disabled:opacity-50';

export function WhereToStart({ profileId, store: givenStore, keep: givenKeep }: WhereToStartProps) {
  const store = useMemo(() => givenStore ?? storageGraphStore(profileId), [givenStore, profileId]);
  const keep = useMemo(() => givenKeep ?? storageKeep(profileId), [givenKeep, profileId]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [solid, setSolid] = useState<ReadonlySet<string>>(new Set());
  const [picked, setPicked] = useState<MathsNode | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [done, setDone] = useState<{ topic: string } | 'redo' | null>(null);
  const [busy, setBusy] = useState(false);

  const readSolid = useCallback(async () => {
    const ids = new Set<string>();
    for (const [id, state] of await store.entries()) if (state.level === 'solid') ids.add(id);
    setSolid(ids);
  }, [store]);

  useEffect(() => {
    let alive = true;
    void profileRepo.getById(profileId).then((p) => {
      if (alive) setName(p?.name ?? null);
    });
    return () => {
      alive = false;
    };
  }, [profileId]);

  useEffect(() => {
    if (open) void readSolid();
  }, [open, readSolid]);

  const child = name ?? 'your child';
  const needle = query.trim().toLowerCase();
  const bands = GRADE_BANDS.map((band) => ({ band, nodes: nodesInBand(band).filter((n) => needle === '' || n.name.toLowerCase().includes(needle)) })).filter((b) => b.nodes.length > 0);

  const start = async (node: MathsNode) => {
    setBusy(true);
    try {
      await placeAt({ store, keep, graph: mathsGraph }, node.id);
      await readSolid();
      setPicked(null);
      setDone({ topic: node.name });
    } finally {
      setBusy(false);
    }
  };

  const redo = async () => {
    setBusy(true);
    try {
      await redoPlacement(keep);
      setPicked(null);
      setDone('redo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="where-to-start-title" className="rounded-xl bg-sf-surface border border-sf-border p-4 space-y-3">
      <button
        type="button"
        id="where-to-start-title"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left text-sf-heading font-bold text-lg flex items-center justify-between"
        style={TAP}
      >
        <span>Math: where to start</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {done && (
        <p role="status" data-testid="where-to-start-message" className="text-sm text-sf-text">
          {done === 'redo' ? `${child} will do the placement test again next time.` : `${child} will start at ${done.topic}.`}
        </p>
      )}
      {open && (
        <div className="space-y-3">
          <p className="text-sm text-sf-muted">School goes at its own pace. Pick the topic {child} is on now: what it needs is marked as known, and the next sitting starts there.</p>
          <input
            type="search"
            aria-label="Search the topics"
            placeholder="Search the topics"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-3 rounded-xl border border-sf-border bg-sf-bg text-sf-text"
            style={TAP}
          />
          {picked && (
            <div role="group" aria-label={`Place ${child} at ${picked.name}`} className="rounded-xl border border-sf-border-strong p-3 space-y-2">
              <p className="text-sf-text">
                Place {child} at “{picked.name}”? Everything it needs is marked solid. The topic itself and what comes after stay as they are.
              </p>
              <div className="flex gap-2">
                <button type="button" className={BUTTON} style={TAP} disabled={busy} onClick={() => void start(picked)}>
                  Start here
                </button>
                <button type="button" className={BUTTON} style={TAP} disabled={busy} onClick={() => setPicked(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {bands.length === 0 && <p className="text-sm text-sf-muted">No topic matches that.</p>}
          {bands.map(({ band, nodes }) => (
            <div key={band}>
              <h3 className="text-sf-heading font-bold">{BAND_TITLE[band]}</h3>
              <ul className="space-y-1">
                {nodes.map((node) => {
                  const known = solid.has(node.id);
                  return (
                    <li key={node.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setDone(null);
                          setPicked(node);
                        }}
                        className="w-full text-left px-3 rounded-lg hover:bg-sf-surface-hover text-sf-text flex gap-2"
                        style={TAP}
                      >
                        <span aria-hidden="true" className="w-5">
                          {known ? '✓' : ''}
                        </span>
                        <span>{node.name}</span>
                        {known && <span className="sr-only">{' (solid)'}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <button type="button" className={BUTTON} style={TAP} disabled={busy} onClick={() => void redo()}>
            Redo the placement test
          </button>
        </div>
      )}
    </section>
  );
}
