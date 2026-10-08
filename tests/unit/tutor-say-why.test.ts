// tests/unit/tutor-say-why.test.ts — sayWhy words a failed send for the person who tapped.

import { describe, expect, it } from 'vitest';
import { door } from 'bsv-kit/bsv';
import { grist } from 'bsv-kit/grist';
import { sayWhy } from '../../src/features/tutor/tutor-flow';

describe('sayWhy', () => {
  it('says the tutor cannot be reached when the factory is offline, on standby or too slow', () => {
    expect(sayWhy(new door.BackendUnreachableError('no connection'))).toMatch(/cannot be reached/);
    expect(sayWhy(new door.ApiTimeoutError(false))).toMatch(/cannot be reached/);
    expect(sayWhy(new door.RefusedError('The image upload failed.', 503))).toMatch(/cannot be reached/);
  });

  it('says the device holds no licence when the factory says so', () => {
    expect(sayWhy(new door.RefusedError(door.LICENCE_REQUIRED, 401))).toBe('This device holds no licence to use the factory.');
  });

  it('passes on the words of a grist the mill would refuse for its shape, nothing having been sent', () => {
    expect(sayWhy(new grist.GristInputError('5 files is over the 4 a grist may carry.'))).toBe('5 files is over the 4 a grist may carry.');
  });

  it('otherwise says the plain thing it was given', () => {
    expect(sayWhy(new Error('boom'), 'The problem could not be sent. You can try again.')).toBe('The problem could not be sent. You can try again.');
    expect(sayWhy(new door.RefusedError('No.', 400), 'The question could not be sent. You can try again.')).toBe('The question could not be sent. You can try again.');
  });
});
