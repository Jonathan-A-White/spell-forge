// src/worlds/grown-ups/first-line.tsx: the one plain sentence every Grown-ups screen opens with, straight after its
// title: short enough to read at a glance (under 100 characters; tests/unit/first-line.test.tsx holds it).

import type { ReactNode } from 'react';

export function FirstLine({ children }: { children: ReactNode }) {
  return (
    <p data-testid="first-line" className="text-sf-text">
      {children}
    </p>
  );
}
