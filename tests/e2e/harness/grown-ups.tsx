// tests/e2e/harness/grown-ups.tsx: How is it going in a real browser, for tests/e2e/grown-ups.spec.ts. No screen of the app draws it yet
// (it takes the solid nodes and the drill count from its caller), so this page hands it a learner who is solid on the first 12 spelling
// skills, did 5 drills last week, and aims at the SAT maths goal with 20 maths skills solid.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { order } from 'learn-kit/graph';
import '../../../src/index.css';
import { HowIsItGoing } from '../../../src/worlds/grown-ups/HowIsItGoing';
import { SAT_MATHS_800, mathsGraph } from '../../../src/learn/maths';
import { spellingGraph } from '../../../src/learn/spelling';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="min-h-screen bg-sf-bg max-w-lg mx-auto px-4 py-5">
      <HowIsItGoing
        spelling={{ solid: new Set(order(spellingGraph).slice(0, 12)), drillsLastWeek: 5 }}
        maths={{ solid: new Set(order(mathsGraph).slice(0, 20)), goal: SAT_MATHS_800, drillsLastWeek: 0 }}
      />
    </div>
  </StrictMode>,
);
