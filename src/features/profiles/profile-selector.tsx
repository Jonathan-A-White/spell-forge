// src/features/profiles/profile-selector.tsx — Profile selection screen

import type { Profile } from '../../contracts/types';

interface ProfileSelectorProps {
  profiles: Profile[];
  onSelect: (profile: Profile) => void;
  onAddProfile: () => void;
}

export function ProfileSelector({ profiles, onSelect, onAddProfile }: ProfileSelectorProps) {
  return (
    <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-amber-900 mb-2">SpellForge</h1>
      <p className="text-amber-600 mb-8">Who's practicing today?</p>

      <div className="grid gap-4 w-full max-w-sm">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            onClick={() => onSelect(profile)}
            className="bg-white hover:bg-amber-100 border-2 border-amber-300 hover:border-amber-500 rounded-xl p-6 text-left transition-all shadow-sm"
          >
            <p className="text-xl font-bold text-amber-900">{profile.name}</p>
            <p className="text-sm text-amber-600 mt-1">
              Theme: {profile.themeId.replace(/-/g, ' ')}
            </p>
          </button>
        ))}

        <button
          onClick={onAddProfile}
          className="border-2 border-dashed border-amber-400 rounded-xl p-6 text-amber-600 hover:bg-amber-100 hover:border-amber-500 transition-all"
        >
          + Add Profile
        </button>
      </div>
    </div>
  );
}
