// src/features/tutor/pictures.tsx — The child's pictures (mw-kuy7rx.10): what the tutor screens show in place of a sentence.
// A waiting picture (a spinner and the seconds), and icons for the buttons. The icons are decorative: the button carries the name.

const SVG = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export function SpeakerIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...SVG} width={size} height={size}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

export function PencilIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...SVG} width={size} height={size}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

export function CameraIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...SVG} width={size} height={size}>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function RetryIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...SVG} width={size} height={size}>
      <path d="M4 12a8 8 0 1 0 3-6.2" />
      <path d="M4 4v4h4" />
    </svg>
  );
}

export function SendIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...SVG} width={size} height={size}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

export function CheckIcon({ size = 24 }: { size?: number }) {
  return (
    <svg {...SVG} width={size} height={size}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/** The waiting picture: a spinner and the seconds, no sentence to read. `label` is for a screen reader only. */
export function Waiting({ seconds, label }: { seconds?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col items-center py-10 gap-3 text-sf-heading">
      <svg {...SVG} strokeLinecap="round" width="96" height="96" className="motion-safe:animate-spin">
        <path d="M12 3a9 9 0 1 0 9 9" />
      </svg>
      {seconds !== undefined && <p className="text-sf-muted text-xl">{`${seconds} second${seconds === 1 ? '' : 's'}`}</p>}
    </div>
  );
}

/** "Say it again" as an icon button: a speaker, named for a screen reader. */
export function SayAgainButton({ onClick, className, style }: { onClick: () => void; className: string; style?: React.CSSProperties }) {
  return (
    <button type="button" onClick={onClick} aria-label="Say it again" className={`${className} px-3`} style={style}>
      <SpeakerIcon />
    </button>
  );
}
