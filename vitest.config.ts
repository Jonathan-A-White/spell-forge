import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { timingFilter, vitestTimeouts } from 'pwa-kit/test-preset';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Timeouts sized for a loaded host (testTimeout, hookTimeout, expect.poll.timeout): above asyncUtilTimeout in
    // tests/setup.ts. A file that needs more sets its own.
    ...vitestTimeouts,
    // MW_TIMING=skip|only reads MW_TIMING_TESTS; unset, every test below runs.
    ...timingFilter({
      include: [
        'tests/unit/**/*.test.ts',
        'tests/unit/**/*.test.tsx',
        'tests/steps/**/*.steps.ts',
        'tests/features/**/*.test.ts',
      ],
    }),
  },
});
