// src/features/word-lists/list-editor.tsx — Word list CRUD UI

import { useState, useCallback } from 'react';
import type { WordList } from '../../contracts/types';

interface ListEditorProps {
  list?: WordList | null;
  existingWords: string[];
  onSave: (name: string, words: string[], testDate: Date | null) => void;
  onCancel: () => void;
}

export function ListEditor({ list, existingWords, onSave, onCancel }: ListEditorProps) {
  const [name, setName] = useState(list?.name ?? '');
  const [wordsText, setWordsText] = useState(existingWords.join('\n'));
  const [testDate, setTestDate] = useState(
    list?.testDate ? formatDate(list.testDate) : '',
  );

  const handleSave = useCallback(() => {
    const words = wordsText
      .split(/[\n,]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 0);

    if (name.trim() === '' || words.length === 0) return;

    onSave(name.trim(), words, testDate ? new Date(testDate) : null);
  }, [name, wordsText, testDate, onSave]);

  const wordCount = wordsText
    .split(/[\n,]+/)
    .filter((w) => w.trim().length > 0).length;

  return (
    <div className="min-h-screen bg-amber-50 p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onCancel} className="text-amber-600 hover:text-amber-800">
          Cancel
        </button>
        <h1 className="text-xl font-bold text-amber-900">
          {list ? 'Edit List' : 'New Word List'}
        </h1>
        <button
          onClick={handleSave}
          className="text-amber-600 hover:text-amber-800 font-bold"
          disabled={name.trim() === '' || wordCount === 0}
        >
          Save
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-amber-800 mb-1">
            List Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Week 12"
            className="w-full border border-amber-300 rounded-lg px-4 py-3 text-amber-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-amber-800 mb-1">
            Test Date (optional)
          </label>
          <input
            type="date"
            value={testDate}
            onChange={(e) => setTestDate(e.target.value)}
            className="w-full border border-amber-300 rounded-lg px-4 py-3 text-amber-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-amber-800 mb-1">
            Words (one per line or comma-separated)
          </label>
          <textarea
            value={wordsText}
            onChange={(e) => setWordsText(e.target.value)}
            rows={10}
            placeholder="knight&#10;bridge&#10;light&#10;because"
            className="w-full border border-amber-300 rounded-lg px-4 py-3 text-amber-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
          />
          <p className="text-sm text-amber-600 mt-1">{wordCount} words</p>
        </div>
      </div>
    </div>
  );
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
