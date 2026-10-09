// src/features/about/about-screen.tsx — About: why we credit, then everything SpellForge builds on (mw-vtjxh4.4).

import { APP_VERSION } from '../../version';
import { CREDITS, NEWTON_ATTRIBUTION, NEWTON_QUOTE, WHY_WE_CREDIT } from './credits';

interface AboutScreenProps {
  onBack: () => void;
}

const LINK_CLASS = 'text-sf-primary underline underline-offset-2 break-words';

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
      {children}
    </a>
  );
}

export function AboutScreen({ onBack }: AboutScreenProps) {
  return (
    <div className="min-h-screen bg-sf-bg">
      <div className="bg-sf-surface border-b border-sf-border px-4 py-4">
        <div className="max-w-lg md:max-w-4xl mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
            aria-label="Go back"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-sf-heading">About &amp; Credits</h1>
        </div>
      </div>

      <div className="max-w-lg md:max-w-4xl mx-auto px-4 py-6 space-y-6">
        <section>
          <figure>
            <blockquote className="text-xl font-bold text-sf-heading">&ldquo;{NEWTON_QUOTE}&rdquo;</blockquote>
            <figcaption className="text-sm text-sf-muted mt-1">&mdash; {NEWTON_ATTRIBUTION}</figcaption>
          </figure>
          <p className="text-sm text-sf-text mt-4">{WHY_WE_CREDIT}</p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-sf-muted uppercase tracking-wider mb-3">Credits</h2>
          <ul className="space-y-3">
            {CREDITS.map((credit) => (
              <li key={credit.name} className="p-4 rounded-xl border-2 border-sf-border bg-sf-surface">
                <p className="font-bold text-sf-text">
                  <ExternalLink href={credit.url}>{credit.name}</ExternalLink>
                </p>
                <p className="text-sm text-sf-text mt-1">{credit.use}</p>
                <p className="text-xs text-sf-muted mt-1">
                  Licence: <ExternalLink href={credit.licence.url}>{credit.licence.name}</ExternalLink>
                </p>
                <p className="text-xs text-sf-muted mt-1">
                  <span className="font-bold">Changes:</span> {credit.changes}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-xs text-sf-muted text-center">{`SpellForge v${APP_VERSION}`}</p>
      </div>
    </div>
  );
}
