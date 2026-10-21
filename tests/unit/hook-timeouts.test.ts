// @vitest-environment node
// The contract-mint beforeAll hooks (mint, build, write) outran vitest's 10 s hook default on a loaded host.
// This holds the config to the preset's hook budget, so dropping it again fails here and not in a gate run.
import { describe, expect, it } from 'vitest';
import { vitestTimeouts } from 'pwa-kit/test-preset';
import config from '../../vitest.config';

describe('vitest config timeouts', () => {
  it('keeps hookTimeout at or above the preset hookTimeout', () => {
    expect(config.test?.hookTimeout).toBeGreaterThanOrEqual(vitestTimeouts.hookTimeout);
  });

  it('keeps testTimeout at or above the preset testTimeout', () => {
    expect(config.test?.testTimeout).toBeGreaterThanOrEqual(vitestTimeouts.testTimeout);
  });
});
