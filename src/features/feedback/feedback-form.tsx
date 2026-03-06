// src/features/feedback/feedback-form.tsx — Send feedback UI

import { useState, useCallback } from 'react';

interface FeedbackFormProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function FeedbackForm({ onSubmit, onCancel }: FeedbackFormProps) {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(() => {
    if (text.trim() === '') return;
    onSubmit(text.trim());
    setSubmitted(true);
  }, [text, onSubmit]);

  if (submitted) {
    return (
      <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-8">
        <h2 className="text-2xl font-bold text-amber-900 mb-4">Thank You!</h2>
        <p className="text-amber-700 mb-8 text-center">
          Your feedback has been saved. It will be sent when connected to the internet.
        </p>
        <button
          onClick={onCancel}
          className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-amber-50 p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onCancel} className="text-amber-600 hover:text-amber-800">
          Cancel
        </button>
        <h1 className="text-xl font-bold text-amber-900">Send Feedback</h1>
        <div />
      </div>

      <p className="text-amber-700 mb-4">
        Help us make SpellForge better! Tell us what you think, report a bug, or suggest a feature.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="Type your feedback here..."
        className="w-full border border-amber-300 rounded-lg px-4 py-3 text-amber-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 mb-4"
        autoFocus
      />

      <button
        onClick={handleSubmit}
        disabled={text.trim() === ''}
        className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-xl text-lg transition-colors"
      >
        Send Feedback
      </button>
    </div>
  );
}
