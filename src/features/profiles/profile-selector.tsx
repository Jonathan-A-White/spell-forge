// src/features/profiles/profile-selector.tsx — Profile selection screen

import type { Profile } from '../../contracts/types';

interface ProfileSelectorProps {
  profiles: Profile[];
  onSelect: (profile: Profile) => void;
  onAddProfile: () => void;
}

export function ProfileSelector({ profiles, onSelect, onAddProfile }: ProfileSelectorProps) {
  return (
    <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-sf-heading mb-2">SpellForge</h1>
      <p className="text-sf-muted mb-8">Who's practicing today?</p>

      <div className="grid gap-4 w-full max-w-sm md:max-w-xl lg:max-w-2xl">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            onClick={() => onSelect(profile)}
            className="bg-sf-surface hover:bg-sf-surface-hover border-2 border-sf-border-strong hover:border-sf-primary rounded-xl p-6 text-left transition-all shadow-sm"
          >
            <p className="text-xl font-bold text-sf-heading">{profile.name}</p>
            <p className="text-sm text-sf-muted mt-1">
              Theme: {profile.themeId.replace(/-/g, ' ')}
            </p>
          </button>
        ))}

        <button
          onClick={onAddProfile}
          className="border-2 border-dashed border-sf-border-strong rounded-xl p-6 text-sf-muted hover:bg-sf-surface-hover hover:border-sf-primary transition-all"
        >
          + Add Profile
        </button>
      </div>
    </div>
  );
}
