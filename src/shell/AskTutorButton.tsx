// src/shell/AskTutorButton.tsx: the Shell's one Ask button (M37). It shows when the screen has told the tutor where the child
// is (report-screen.ts), and opens the tutor with that; it is not drawn on the tutor itself.
import { askTheTutor, useScreenReported } from './report-screen';
import type { ViewId } from './worlds';

export function AskTutorButton({ view, open }: { view: ViewId; open: (view: ViewId) => void }) {
  const reported = useScreenReported();
  if (!reported || view === 'tutor') return null;
  return (
    <div className="flex-none flex justify-end px-3 py-1">
      <button
        type="button"
        aria-label="Ask the tutor"
        className="px-5 rounded-xl font-bold bg-sf-primary text-sf-primary-text active:scale-[0.97]"
        style={{ minHeight: 'var(--sf-tap-target-size, 48px)' }}
        onClick={() => askTheTutor(open)}
      >
        Ask
      </button>
    </div>
  );
}
