// src/features/tutor/parent-screen.tsx — The Grown-ups screen: an empty shell for now (mw-kuy7rx.2).
// Later stories fill the four sections; they are behind the PIN gate (parent-gate.tsx).

export interface ParentScreenProps {
  onBack: () => void;
}

const SECTIONS = ['This week', 'Sessions', 'Ask the tutor', 'Tutor settings'] as const;

export function ParentScreen({ onBack }: ParentScreenProps) {
  return (
    <div className="min-h-screen bg-sf-bg">
      <div className="bg-sf-surface border-b border-sf-border px-4 py-3">
        <div className="max-w-lg md:max-w-4xl mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            className="px-3 rounded-lg text-sf-heading font-bold hover:bg-sf-surface-hover"
            style={{ minHeight: 'var(--sf-tap-target-size)' }}
          >
            <span aria-hidden="true">&larr; </span>Back
          </button>
          <h1 className="text-xl font-bold text-sf-heading">Grown-ups</h1>
        </div>
      </div>
      <div className="max-w-lg md:max-w-4xl mx-auto px-4 py-5 space-y-4">
        {SECTIONS.map((title) => (
          <section key={title} className="rounded-xl bg-sf-surface border border-sf-border p-4">
            <h2 className="text-sf-heading font-bold text-lg">{title}</h2>
            <p className="text-sf-muted text-sm">Coming soon.</p>
          </section>
        ))}
      </div>
    </div>
  );
}
