// src/features/settings/import-filter-settings.tsx — Manage words/phrases to auto-exclude from camera import

import { useState, useCallback, useRef, useEffect } from 'react';

interface ImportFilterSettingsProps {
  filterPhrases: string[];
  onUpdate: (phrases: string[]) => void;
}

export function ImportFilterSettings({ filterPhrases, onUpdate }: ImportFilterSettingsProps) {
  const [newPhrase, setNewPhrase] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus the edit input when entering edit mode
  useEffect(() => {
    if (editingIndex !== null) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingIndex]);

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
      setEditingIndex(null);
      onUpdate(filterPhrases.filter((_, i) => i !== index));
    },
    [filterPhrases, onUpdate],
  );

  const handleEditStart = useCallback(
    (index: number) => {
      setEditingIndex(index);
      setEditValue(filterPhrases[index]);
    },
    [filterPhrases],
  );

  const handleEditSave = useCallback(() => {
    if (editingIndex === null) return;

    const trimmed = editValue.trim();
    if (trimmed === '') {
      // Treat empty save as delete
      handleRemove(editingIndex);
      return;
    }

    // Check for duplicates (case-insensitive), excluding the item being edited
    const lowerTrimmed = trimmed.toLowerCase();
    const isDuplicate = filterPhrases.some(
      (p, i) => i !== editingIndex && p.toLowerCase() === lowerTrimmed,
    );
    if (isDuplicate) {
      // Revert — duplicate exists
      setEditingIndex(null);
      return;
    }

    const updated = [...filterPhrases];
    updated[editingIndex] = trimmed;
    onUpdate(updated);
    setEditingIndex(null);
  }, [editingIndex, editValue, filterPhrases, onUpdate, handleRemove]);

  const handleEditCancel = useCallback(() => {
    setEditingIndex(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleEditSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleEditCancel();
      }
    },
    [handleEditSave, handleEditCancel],
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
          Tap a phrase to edit it.
        </p>

        {/* Existing phrases */}
        {filterPhrases.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {filterPhrases.map((phrase, index) =>
              editingIndex === index ? (
                <div key={`${phrase}-${index}`} className="flex gap-1">
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    onBlur={handleEditSave}
                    className="border border-sf-primary rounded-lg px-2 py-1 text-sm text-sf-heading bg-sf-input-bg focus:outline-none focus:ring-2 focus:ring-sf-primary w-40"
                  />
                </div>
              ) : (
                <span
                  key={`${phrase}-${index}`}
                  className="inline-flex items-center gap-1.5 bg-sf-track text-sf-text text-sm px-3 py-1.5 rounded-full cursor-pointer hover:bg-sf-track/80 transition-colors"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleEditStart(index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleEditStart(index);
                    }
                  }}
                  aria-label={`Edit "${phrase}"`}
                >
                  {phrase}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(index);
                    }}
                    className="text-sf-muted hover:text-sf-error ml-0.5 -mr-1"
                    aria-label={`Remove "${phrase}"`}
                  >
                    <RemoveIcon />
                  </button>
                </span>
              ),
            )}
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
