// src/features/feedback/feedback-form.tsx — Send feedback UI (opens native email)

import { useState, useCallback } from 'react';
import { Composer } from 'voice-kit/composer';
import type { ComposerLabels, ComposerMessage } from 'voice-kit/composer';
import 'voice-kit/composer/styles.css';
import '../composer/composer-theme.css';
import { SPELLFORGE_COMPOSER_SETTINGS } from '../composer/composer-settings';
import { FEEDBACK_EMAIL, buildMailtoUrl } from './mailto';

const LABELS: Partial<ComposerLabels> = {
  typeInstead: 'Type your feedback',
  placeholder: 'Type your feedback here...',
  message: 'Your feedback',
};

interface FeedbackFormProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function FeedbackForm({ onSubmit, onCancel }: FeedbackFormProps) {
  const [submitted, setSubmitted] = useState(false);

  // The Composer hands over the words trimmed; it empties its box when this returns.
  const handleSubmit = useCallback(({ text }: ComposerMessage) => {
    if (text === '') return false;

    // Open native email client
    window.location.href = buildMailtoUrl(text);

    // Also persist locally via the existing sync queue
    onSubmit(text);
    setSubmitted(true);
  }, [onSubmit]);

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
    <div className="min-h-screen bg-sf-bg p-4 max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto">
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

      <Composer className="sf-composer" settings={SPELLFORGE_COMPOSER_SETTINGS} labels={LABELS} appName="SpellForge" minRows={8} autoFocus onSend={handleSubmit} />
    </div>
  );
}
