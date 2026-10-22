// src/features/tutor/shared-picture.tsx: a picture another app shared with SpellForge (Share > SpellForge, src/share), waiting on the tutor's
// start screen. It is never sent by itself: a tap on Send this picture sends it as if it had been taken with the camera, and Not this one drops it.
import { useEffect, useMemo } from 'react';

export interface SharedPictureProps {
  file: Blob;
  onSend: (file: Blob) => void;
  onDrop: () => void;
  className: { primary: string; secondary: string; tap: React.CSSProperties };
}

export function SharedPicture({ file, onSend, onDrop, className }: SharedPictureProps) {
  const url = useMemo(
    () => (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined),
    [file],
  );
  useEffect(
    () => () => {
      if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <section aria-label="Shared picture" data-testid="shared-picture" className="space-y-3 rounded-xl border border-sf-border bg-sf-surface p-3">
      {url && <img src={url} alt="The picture shared with SpellForge" className="mx-auto max-h-64 rounded-lg" />}
      <div className="flex gap-3">
        <button onClick={() => onSend(file)} className={className.primary} style={className.tap}>Send this picture</button>
        <button onClick={onDrop} className={className.secondary} style={className.tap}>Not this one</button>
      </div>
    </section>
  );
}
