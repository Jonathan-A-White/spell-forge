// src/features/feedback/feedback-form.tsx — Send feedback UI (opens native email)

import { useState, useCallback } from 'react';
import { FEEDBACK_EMAIL, buildMailtoUrl } from './mailto';

interface FeedbackFormProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function FeedbackForm({ onSubmit, onCancel }: FeedbackFormProps) {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(() => {
    if (text.trim() === '') return;
    const trimmed = text.trim();

    // Open native email client
    window.location.href = buildMailtoUrl(trimmed);

    // Also persist locally via the existing sync queue
    onSubmit(trimmed);
    setSubmitted(true);
  }, [text, onSubmit]);

  if (submitted) {
    return (
      <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-center p-8">
        <h2 className="text-2xl font-bold text-sf-heading mb-4">Thank You!</h2>
        <p className="text-sf-text mb-8 text-center">
          Your email app should have opened with your feedback.
          If it didn&apos;t, you can email us directly at{' '}
          <a href={`mailto:${FEEDBACK_EMAIL}`} className="text-sf-primary underline">
            {FEEDBACK_EMAIL}
          </a>.
        </p>
        <button
          onClick={onCancel}
          className="bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sf-bg p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onCancel} className="text-sf-muted hover:text-sf-secondary">
          Cancel
        </button>
        <h1 className="text-xl font-bold text-sf-heading">Send Feedback</h1>
        <div />
      </div>

      <p className="text-sf-text mb-4">
        Help us make SpellForge better! Tell us what you think, report a bug, or suggest a feature.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="Type your feedback here..."
        className="w-full border border-sf-input-border rounded-lg px-4 py-3 text-sf-heading bg-sf-input-bg focus:outline-none focus:ring-2 focus:ring-sf-primary mb-4"
        autoFocus
      />

      <button
        onClick={handleSubmit}
        disabled={text.trim() === ''}
        className="w-full bg-sf-primary hover:bg-sf-primary-hover disabled:bg-sf-disabled text-sf-primary-text font-bold py-4 rounded-xl text-lg transition-colors"
      >
        Send Feedback
      </button>
    </div>
  );
}
