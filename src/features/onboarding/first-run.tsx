// src/features/onboarding/first-run.tsx — First-time setup wizard

import { useState, useCallback } from 'react';
import type { AccessibilitySettings } from '../../contracts/types';
import { DEFAULT_SETTINGS } from '../../accessibility/defaults';
import { themeEngine } from '../../themes/engine';

interface FirstRunProps {
  onComplete: (name: string, themeId: string, settings: AccessibilitySettings) => void;
}

export function FirstRun({ onComplete }: FirstRunProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [themeId, setThemeId] = useState('dragon-forge');
  const themes = themeEngine.getAllThemes();

  const handleFinish = useCallback(() => {
    if (name.trim() === '') return;
    onComplete(name.trim(), themeId, { ...DEFAULT_SETTINGS });
  }, [name, themeId, onComplete]);

  if (step === 0) {
    return (
      <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-8">
        <h1 className="text-4xl font-bold text-amber-900 mb-4">Welcome to SpellForge!</h1>
        <p className="text-amber-700 mb-8 text-center max-w-md">
          Let's set up your profile so you can start practicing spelling.
        </p>
        <div className="w-full max-w-sm mb-6">
          <label className="block text-sm font-medium text-amber-800 mb-2">
            What's your name?
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="w-full border-2 border-amber-300 rounded-xl px-4 py-3 text-lg text-amber-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            autoFocus
          />
        </div>
        <button
          onClick={() => name.trim() && setStep(1)}
          disabled={name.trim() === ''}
          className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-bold py-4 px-8 rounded-xl text-lg transition-colors"
        >
          Next
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-8">
      <h2 className="text-2xl font-bold text-amber-900 mb-2">Pick Your Theme, {name}!</h2>
      <p className="text-amber-600 mb-6">How do you want to earn rewards?</p>

      <div className="grid gap-4 w-full max-w-sm mb-8">
        {themes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => setThemeId(theme.id)}
            className={`border-2 rounded-xl p-4 text-left transition-all ${
              themeId === theme.id
                ? 'border-amber-600 bg-amber-100 shadow-md'
                : 'border-amber-300 bg-white hover:bg-amber-50'
            }`}
          >
            <p className="font-bold text-amber-900">{theme.name}</p>
            <p className="text-sm text-amber-600 mt-1">{theme.description}</p>
            <p className="text-xs text-amber-500 mt-1">
              Earn {theme.rewardMechanic.unitName} for each correct answer!
            </p>
          </button>
        ))}
      </div>

      <button
        onClick={handleFinish}
        className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-4 px-8 rounded-xl text-lg transition-colors"
      >
        Start Forging!
      </button>
    </div>
  );
}
