import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
// Not '@testing-library/react': importing it here would register its auto-unmount before a step file's
// dont-cleanup-after-each import can switch that off (a feature's steps are separate tests over one rendered screen).
import { configure } from '@testing-library/dom';
import { ASYNC_WAIT_MS } from 'pwa-kit/test-preset';

// findBy*/waitFor default to 1 s, which a cold lazy-loaded screen (Tutor)
// overruns when the machine is loaded: they wait the preset's loaded-host budget.
configure({ asyncUtilTimeout: ASYNC_WAIT_MS });
