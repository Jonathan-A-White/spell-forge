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
    // One file at a time: every file spends from the same three harness addresses, and two
    // at once would race for the same UTXOs.
    fileParallelism: false,
    testTimeout: 5 * 60 * 1000,
    hookTimeout: 5 * 60 * 1000,
  },
});
