import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// findBy*/waitFor default to 1 s, which a cold lazy-loaded screen (Tutor)
// overruns when the machine is loaded.
configure({ asyncUtilTimeout: 5000 });
