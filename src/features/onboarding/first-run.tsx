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
      <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-center p-8">
        <h1 className="text-4xl font-bold text-sf-heading mb-4">Welcome to SpellForge!</h1>
        <p className="text-sf-text mb-8 text-center max-w-md">
          Let's set up your profile so you can start practicing spelling.
        </p>
        <div className="w-full max-w-sm md:max-w-xl lg:max-w-2xl mb-6">
          <label className="block text-sm font-medium text-sf-secondary mb-2">
            What's your name?
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="w-full border-2 border-sf-input-border rounded-xl px-4 py-3 text-lg text-sf-heading bg-sf-input-bg focus:outline-none focus:ring-2 focus:ring-sf-primary"
            autoFocus
          />
        </div>
        <button
          onClick={() => name.trim() && setStep(1)}
          disabled={name.trim() === ''}
          className="bg-sf-primary hover:bg-sf-primary-hover disabled:bg-sf-disabled text-sf-primary-text font-bold py-4 px-8 rounded-xl text-lg transition-colors"
        >
          Next
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-center p-8">
      <h2 className="text-2xl font-bold text-sf-heading mb-2">Pick Your Theme, {name}!</h2>
      <p className="text-sf-muted mb-6">How do you want to earn rewards?</p>

      <div className="grid gap-4 w-full max-w-sm md:max-w-xl lg:max-w-2xl mb-8">
        {themes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => setThemeId(theme.id)}
            className={`border-2 rounded-xl p-4 text-left transition-all ${
              themeId === theme.id
                ? 'border-sf-primary bg-sf-surface-active shadow-md'
                : 'border-sf-border-strong bg-sf-surface hover:bg-sf-surface-hover'
            }`}
          >
            <p className="font-bold text-sf-heading">{theme.name}</p>
            <p className="text-sm text-sf-muted mt-1">{theme.description}</p>
            <p className="text-xs text-sf-faint mt-1">
              Earn {theme.rewardMechanic.unitName} for each correct answer!
            </p>
          </button>
        ))}
      </div>

      <button
        onClick={handleFinish}
        className="bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-4 px-8 rounded-xl text-lg transition-colors"
      >
        Start Forging!
      </button>
    </div>
  );
}
