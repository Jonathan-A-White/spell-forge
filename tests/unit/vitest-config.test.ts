// @vitest-environment node
import { describe, it, expect } from 'vitest';
import config from '../../vitest.config';

// The per-test limit must stay above Testing Library's asyncUtilTimeout
// (tests/setup.ts), or one slow waitFor under load kills the whole test.
const ASYNC_UTIL_TIMEOUT = 5000;

describe('vitest.config.ts', () => {
  it('gives each test 20 s, above Testing Library\'s asyncUtilTimeout', () => {
    const timeout = config.test?.testTimeout;
    expect(timeout).toBe(20000);
    expect(timeout).toBeGreaterThan(ASYNC_UTIL_TIMEOUT);
  });
});
