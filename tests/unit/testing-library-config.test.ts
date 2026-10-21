import { getConfig } from '@testing-library/react';
import { ASYNC_WAIT_MS } from 'pwa-kit/test-preset';
import { describe, expect, it } from 'vitest';

describe('shared test setup', () => {
  it("gives Testing Library async helpers the preset's loaded-host budget, not the 1 s default, so cold lazy loads survive a loaded machine", () => {
    expect(getConfig().asyncUtilTimeout).toBe(ASYNC_WAIT_MS);
    expect(ASYNC_WAIT_MS).toBeGreaterThan(1000);
  });
});
