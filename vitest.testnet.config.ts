import { defineConfig } from 'vitest/config';

// A separate vitest project for tests/testnet/: real network calls against the
// WhatsOnChain testnet API with the funded harness keys. Never picked up by `npm
// test` (vitest.config.ts) or `npm run test:bsv` — run by hand with `npm run
// test:bsv:testnet`.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/testnet/**/*.test.ts'],
    testTimeout: 5 * 60 * 1000,
    hookTimeout: 5 * 60 * 1000,
  },
});
