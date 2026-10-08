// src/features/tutor/tutor-settings.tsx — 'Tutor settings' on the Grown-ups screen (mw-kuy7rx.8): how the tutor
// helps (profile.settings.tutorStrictness) and the tutor's Voice (profile.settings.tutorVoice).

import { useCallback, useEffect, useState } from 'react';
import { listTutorVoices, onVoicesChanged, sayAsTutor } from '../../audio';
import type { Profile, TutorStrictness } from '../../contracts';
import { profileRepo } from '../../data/repositories';

export interface TutorSettingsProps {
  profileId: string;
  /** The profile changed: the Tutor screen keeps its own copy. */
  onProfileChange?: (profile: Profile) => void;
}

const STRICTNESS: { value: TutorStrictness; label: string; hint: string }[] = [
  { value: 'meaning-gated', label: 'Meaning first', hint: 'Help with the words that get in the way of the meaning.' },
  { value: 'precision', label: 'Every word', hint: 'Help with every word, even when the meaning is clear.' },
];

const DEFAULT_VOICE = "Phone's default";
const TRY_SENTENCE = 'Hello, I am your tutor, and this is my voice.';
const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;
const TRY = 'px-4 rounded-xl font-bold bg-sf-surface border border-sf-border text-sf-heading hover:border-sf-border-strong active:scale-[0.97]';

export function TutorSettings({ profileId, onProfileChange }: TutorSettingsProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [voices, setVoices] = useState(() => listTutorVoices());

  useEffect(() => {
    let cancelled = false;
    void profileRepo.getById(profileId).then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  // Phones load their voices late.
  useEffect(() => onVoicesChanged(() => setVoices(listTutorVoices())), []);

  const change = useCallback(
    async (patch: { tutorStrictness?: TutorStrictness; tutorVoice?: string }) => {
      if (!profile) return;
      const settings = { ...profile.settings, ...patch };
      if (!settings.tutorVoice) delete settings.tutorVoice;
      await profileRepo.update(profile.id, { settings });
      const next = { ...profile, settings };
      setProfile(next);
      onProfileChange?.(next);
    },
    [profile, onProfileChange],
  );

  const strictness = profile?.settings.tutorStrictness ?? 'meaning-gated';
  const picked = profile?.settings.tutorVoice ?? '';
  const options = [{ voiceURI: '', name: DEFAULT_VOICE, lang: '' }, ...voices.map((v) => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang }))];

  return (
    <section aria-labelledby="tutor-settings-title" className="rounded-xl bg-sf-surface border border-sf-border p-4 space-y-5">
      <h2 id="tutor-settings-title" className="text-sf-heading font-bold text-lg">Tutor settings</h2>
      {profile && (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sf-heading font-bold mb-1">How should the tutor help?</legend>
            {STRICTNESS.map((option) => (
              <div key={option.value} className="flex items-start gap-3">
                <input
                  id={`settings-strictness-${option.value}`}
                  type="radio"
                  name="settings-strictness"
                  checked={strictness === option.value}
                  onChange={() => void change({ tutorStrictness: option.value })}
                  aria-describedby={`settings-strictness-${option.value}-hint`}
                  className="mt-1.5 w-5 h-5"
                />
                <div>
                  <label htmlFor={`settings-strictness-${option.value}`} className="text-sf-heading font-medium">{option.label}</label>
                  <p id={`settings-strictness-${option.value}-hint`} className="text-sf-muted text-sm">{option.hint}</p>
                </div>
              </div>
            ))}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sf-heading font-bold mb-1">Voice</legend>
            {options.map((option, i) => (
              <div key={option.voiceURI || 'default'} className="flex items-center gap-3">
                <input
                  id={`settings-voice-${i}`}
                  type="radio"
                  name="settings-voice"
                  checked={picked === option.voiceURI}
                  onChange={() => void change({ tutorVoice: option.voiceURI })}
                  className="w-5 h-5"
                />
                <label htmlFor={`settings-voice-${i}`} className="flex-1 text-sf-heading font-medium">
                  {option.name}
                  {option.lang && <span className="text-sf-muted text-sm font-normal"> ({option.lang})</span>}
                </label>
                <button
                  type="button"
                  className={TRY}
                  style={TAP}
                  aria-label={`Try it: ${option.name}`}
                  onClick={() => void sayAsTutor(TRY_SENTENCE, option.voiceURI || null)}
                >
                  Try it
                </button>
              </div>
            ))}
          </fieldset>
        </>
      )}
    </section>
  );
}
