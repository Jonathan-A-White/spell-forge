// src/features/word-lists/tts-setup-help.tsx — Shows TTS installation instructions per language/platform.

import { useState } from 'react';
import { getTtsInstructionsForLanguage } from '../../i18n/tts-instructions.ts';
import { getLanguageConfig } from '../../i18n/language-registry.ts';
import { getTtsStatus } from '../../audio/speech.ts';

interface TtsSetupHelpProps {
  languageCode: string;
}

export function TtsSetupHelp({ languageCode }: TtsSetupHelpProps) {
  const [expanded, setExpanded] = useState(false);
  const status = getTtsStatus(languageCode);
  const config = getLanguageConfig(languageCode);
  const instructions = getTtsInstructionsForLanguage(config.code);

  if (status === 'available' || instructions.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-amber-800 font-medium"
      >
        <span>
          {status === 'no-voices'
            ? `No ${config.displayName} voice detected — tap for setup help`
            : `Speech not available — tap for setup help`}
        </span>
        <span className="text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          {instructions.map((instr) => (
            <div key={`${instr.platform}-${instr.languageCode}`}>
              <h4 className="font-bold text-amber-900 text-xs uppercase mb-1">
                {instr.title}
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-amber-800">
                {instr.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
