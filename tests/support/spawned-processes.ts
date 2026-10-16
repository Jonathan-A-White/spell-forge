// Spawn a wrapper (npx, npm) and kill it together with everything it started.
//
// `npx vite preview` is a wrapper: kill() on the ChildProcess ends npx and leaves the vite process listening on
// its port. Spawned detached, the child leads its own process group, and killGroup ends the whole group.
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

export function spawnGroup(command: string, args: readonly string[], options: SpawnOptions = {}): ChildProcess {
  return spawn(command, args, { ...options, detached: true });
}

export function killGroup(child: ChildProcess | undefined): void {
  if (!child) return;
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch {
      // the group is already gone (ESRCH) or was never one: fall back to the child itself
    }
  }
  child.kill('SIGKILL');
}
