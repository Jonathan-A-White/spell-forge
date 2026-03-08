// src/features/settings/import-filter-settings.tsx — Manage words/phrases to auto-exclude from camera import

import { useState, useCallback } from 'react';

interface ImportFilterSettingsProps {
  filterPhrases: string[];
  onUpdate: (phrases: string[]) => void;
}

export function ImportFilterSettings({ filterPhrases, onUpdate }: ImportFilterSettingsProps) {
  const [newPhrase, setNewPhrase] = useState('');

  const handleAdd = useCallback(() => {
    const trimmed = newPhrase.trim();
    if (trimmed === '') return;

    // Avoid duplicates (case-insensitive)
    const lowerTrimmed = trimmed.toLowerCase();
    if (filterPhrases.some((p) => p.toLowerCase() === lowerTrimmed)) {
      setNewPhrase('');
      return;
    }

    onUpdate([...filterPhrases, trimmed]);
    setNewPhrase('');
  }, [newPhrase, filterPhrases, onUpdate]);

  const handleRemove = useCallback(
    (index: number) => {
      onUpdate(filterPhrases.filter((_, i) => i !== index));
    },
    [filterPhrases, onUpdate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  return (
    <section>
      <h2 className="text-sm font-bold text-sf-muted uppercase tracking-wider mb-3">
        Photo Import Filters
      </h2>

      <div className="bg-sf-surface rounded-xl border border-sf-border p-4 space-y-3">
        <p className="text-xs text-sf-muted">
          Words and phrases listed here will be automatically removed when
          importing from a photo. Useful for filtering headings like
          &ldquo;Challenge Words&rdquo; or &ldquo;High Frequency Words&rdquo;.
        </p>

        {/* Existing phrases */}
        {filterPhrases.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {filterPhrases.map((phrase, index) => (
              <span
                key={`${phrase}-${index}`}
                className="inline-flex items-center gap-1.5 bg-sf-track text-sf-text text-sm px-3 py-1.5 rounded-full"
              >
                {phrase}
                <button
                  onClick={() => handleRemove(index)}
                  className="text-sf-muted hover:text-sf-error ml-0.5 -mr-1"
                  aria-label={`Remove "${phrase}"`}
                >
                  <RemoveIcon />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Add new phrase */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newPhrase}
            onChange={(e) => setNewPhrase(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., Challenge Words"
            className="flex-1 border border-sf-input-border rounded-lg px-3 py-2 text-sm text-sf-heading bg-sf-input-bg focus:outline-none focus:ring-2 focus:ring-sf-primary"
          />
          <button
            onClick={handleAdd}
            disabled={newPhrase.trim() === ''}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-sf-primary text-sf-primary-text hover:bg-sf-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </section>
  );
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
