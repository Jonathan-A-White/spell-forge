// src/shell/LicenceLine.tsx: the one line a gated control shows. A line to read, not a control.
import { NO_LICENCE_LINE } from './licence-gate';

export function LicenceLine() {
  return <p className="text-sf-text text-base">{NO_LICENCE_LINE}</p>;
}
