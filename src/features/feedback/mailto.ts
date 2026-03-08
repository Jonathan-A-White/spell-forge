// src/features/feedback/mailto.ts — Shared mailto utilities

import { APP_VERSION } from '../../version';

export const FEEDBACK_EMAIL = 'jonathan.jawhite@gmail.com';

export function buildMailtoUrl(body: string): string {
  const deviceInfo = [
    `App Version: ${APP_VERSION}`,
    `Platform: ${navigator.platform}`,
    `Screen: ${window.innerWidth}x${window.innerHeight}`,
    `User Agent: ${navigator.userAgent}`,
  ].join('\n');

  const fullBody = `${body}\n\n---\n${deviceInfo}`;
  const subject = 'SpellForge Feedback';

  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fullBody)}`;
}
