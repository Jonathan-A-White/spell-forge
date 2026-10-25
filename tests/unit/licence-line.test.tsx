// LicenceLine (12e): the one child-safe line a gated control shows, and no other control.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LicenceLine } from '../../src/shell/LicenceLine';
import { NO_LICENCE_LINE } from '../../src/shell/licence-gate';

describe('LicenceLine', () => {
  it('renders the one line, and no control', () => {
    const { container } = render(<LicenceLine />);
    expect(screen.getByText(NO_LICENCE_LINE)).toBeTruthy();
    expect(container.textContent).toBe(NO_LICENCE_LINE);
    for (const role of ['button', 'link', 'textbox', 'checkbox']) expect(screen.queryAllByRole(role)).toEqual([]);
    expect(container.querySelectorAll('button, a, input, select, textarea, [tabindex]')).toHaveLength(0);
  });

  it('is short and child-safe: under 100 characters, no licence, no blame', () => {
    expect(NO_LICENCE_LINE.length).toBeLessThan(100);
    expect(NO_LICENCE_LINE).not.toMatch(/licen[cs]e|error|fail|refus|wrong|denied/i);
  });
});
