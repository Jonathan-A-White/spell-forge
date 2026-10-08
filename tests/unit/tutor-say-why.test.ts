// tests/unit/tutor-say-why.test.ts — sayWhy words a failed send for the person who tapped.

import { describe, expect, it } from 'vitest';
import { GristNeedsUpdate, GristOffline } from '../../src/grist';
import { sayWhy } from '../../src/features/tutor/tutor-flow';

describe('sayWhy', () => {
  it("says 'SpellForge needs an update' when the factory refuses this build's signing scheme, not 'cannot be reached'", () => {
    expect(sayWhy(new GristNeedsUpdate())).toBe('SpellForge needs an update');
  });

  it('still says the tutor cannot be reached when the factory is offline', () => {
    expect(sayWhy(new GristOffline())).toMatch(/cannot be reached/);
  });
});
