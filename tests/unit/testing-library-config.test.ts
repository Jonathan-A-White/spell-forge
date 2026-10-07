import { getConfig } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('shared test setup', () => {
  it('gives Testing Library async helpers 5 s, not the 1 s default, so cold lazy loads survive a loaded machine', () => {
    expect(getConfig().asyncUtilTimeout).toBe(5000);
  });
});
