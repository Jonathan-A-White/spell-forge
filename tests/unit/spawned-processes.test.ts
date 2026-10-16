// mw-kuy7rx.24: the e2e specs spawn `npx vite preview` and used to end with previewProcess?.kill(), which ends
// npx and leaves vite listening. A stand-in wrapper (sh) starts a grandchild (sleep); killGroup must end both.
// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { killGroup, spawnGroup } from '../support/spawned-processes';

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function gone(pid: number, timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!alive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !alive(pid);
}

function startWrapper(): Promise<{ wrapper: ChildProcess; grandchild: number }> {
  const wrapper = spawnGroup('sh', ['-c', 'sleep 300 & echo $!; wait'], { stdio: 'pipe' });
  return new Promise((resolve, reject) => {
    wrapper.once('error', reject);
    wrapper.stdout?.once('data', (chunk: Buffer) => resolve({ wrapper, grandchild: Number(String(chunk).trim()) }));
  });
}

describe('killGroup (mw-kuy7rx.24)', () => {
  const grandchildren: number[] = [];
  afterEach(() => {
    for (const pid of grandchildren.splice(0)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
  });

  it('ends the wrapper and the process it started', async () => {
    const { wrapper, grandchild } = await startWrapper();
    grandchildren.push(grandchild);
    expect(alive(grandchild)).toBe(true);

    killGroup(wrapper);

    expect(await gone(grandchild), 'the grandchild is gone').toBe(true);
  });

  it('does nothing when nothing was spawned', () => {
    expect(() => killGroup(undefined)).not.toThrow();
  });

  it('does nothing when the group is already gone', async () => {
    const { wrapper, grandchild } = await startWrapper();
    grandchildren.push(grandchild);
    killGroup(wrapper);
    await gone(grandchild);
    expect(() => killGroup(wrapper)).not.toThrow();
  });
});
