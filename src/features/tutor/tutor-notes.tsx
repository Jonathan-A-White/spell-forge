// src/features/tutor/tutor-notes.tsx — 'Notes for the tutor' on the Grown-ups screen (mw-kuy7rx.11): short standing
// notes ('Go slower on carrying') kept per profile in profile.settings.tutorNotes. tutor-flow.ts sends them on
// every tutor-turn as parent_notes.

import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '../../contracts';
import { profileRepo } from '../../data/repositories';
import { MAX_TUTOR_NOTES, MAX_TUTOR_NOTE_LENGTH } from '../../accessibility/settings';

export interface TutorNotesProps {
  profileId: string;
  /** The profile changed: the Tutor screen keeps its own copy. */
  onProfileChange?: (profile: Profile) => void;
}

const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;
const BUTTON = 'px-4 rounded-xl font-bold bg-sf-surface border border-sf-border text-sf-heading hover:border-sf-border-strong active:scale-[0.97] disabled:opacity-50';

export function TutorNotes({ profileId, onProfileChange }: TutorNotesProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    void profileRepo.getById(profileId).then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const notes = profile?.settings.tutorNotes ?? [];

  const save = useCallback(
    async (next: string[]) => {
      if (!profile) return;
      const settings: Profile['settings'] = { ...profile.settings };
      if (next.length) settings.tutorNotes = next;
      else delete settings.tutorNotes;
      await profileRepo.update(profile.id, { settings });
      const updated = { ...profile, settings };
      setProfile(updated);
      onProfileChange?.(updated);
    },
    [profile, onProfileChange],
  );

  const text = draft.trim();
  const full = notes.length >= MAX_TUTOR_NOTES;

  return (
    <section aria-labelledby="tutor-notes-title" className="rounded-xl bg-sf-surface border border-sf-border p-4 space-y-3">
      <h2 id="tutor-notes-title" className="text-sf-heading font-bold text-lg">Notes for the tutor</h2>
      {profile && (
        <>
          <p className="text-sf-muted text-sm">
            The tutor reads these before every turn and follows them in how it helps. It never tells your child about them.
          </p>
          {notes.length === 0 ? (
            <p className="text-sf-muted">No notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((note, i) => (
                <li key={`${i}-${note}`} className="flex items-center gap-3">
                  <span className="flex-1 text-sf-heading">{note}</span>
                  <button type="button" className={BUTTON} style={TAP} aria-label={`Delete note: ${note}`} onClick={() => void save(notes.filter((_, j) => j !== i))}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
          {full && <p className="text-sf-muted text-sm">You have {MAX_TUTOR_NOTES} notes, the most there can be. Delete one to add another.</p>}
          <form
            className="flex items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text || full) return;
              setDraft('');
              void save([...notes, text]);
            }}
          >
            <input
              type="text"
              aria-label="New note"
              placeholder="For example: go slower on carrying"
              maxLength={MAX_TUTOR_NOTE_LENGTH}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 min-w-0 px-3 rounded-xl border border-sf-border bg-sf-bg text-sf-heading"
              style={TAP}
            />
            <button type="submit" className={BUTTON} style={TAP} disabled={!text || full}>
              Add note
            </button>
          </form>
        </>
      )}
    </section>
  );
}
