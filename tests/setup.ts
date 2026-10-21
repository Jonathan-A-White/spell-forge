import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { ASYNC_WAIT_MS } from 'pwa-kit/test-preset';

// findBy*/waitFor default to 1 s, which a cold lazy-loaded screen (Tutor)
// overruns when the machine is loaded: they wait the preset's loaded-host budget.
configure({ asyncUtilTimeout: ASYNC_WAIT_MS });
