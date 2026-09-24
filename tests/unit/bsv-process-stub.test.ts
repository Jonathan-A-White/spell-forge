import { describe, it, expect, afterEach } from 'vitest';
import { installProcessStub } from '../../src/bsv/process-stub';

describe('installProcessStub', () => {
  const originalProcess = globalThis.process;

  afterEach(() => {
    (globalThis as { process?: unknown }).process = originalProcess;
  });

  it('installs nothing when globalThis.process already exists', () => {
    installProcessStub();
    expect(globalThis.process).toBe(originalProcess);
  });

  it('installs a stand-in with no versions key when globalThis.process is absent', () => {
    delete (globalThis as { process?: unknown }).process;

    installProcessStub();

    expect(globalThis.process).toBeDefined();
    expect((globalThis.process as { versions?: unknown }).versions).toBeUndefined();
  });
});
