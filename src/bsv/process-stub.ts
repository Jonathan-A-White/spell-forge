// src/bsv/process-stub.ts — scrypt-ts (loaded lazily by license-contract.ts's bridge
// loaders) pulls in scryptlib, whose compilerWrapper requires rimraf, which reads
// `process.platform` at module top level (node_modules/rimraf/rimraf.js); the bundled chunk
// also touches process.nextTick, cwd, argv, pid, binding, chdir, version, emitWarning, env
// and stderr. There is no `process` global in a real browser, so merely evaluating that
// chunk throws "process is not defined" (mw-yo97u.11). Installing this minimal stand-in
// first, only when no `process` global exists, lets that top-level code evaluate.

interface ProcessStub {
  platform: string;
  env: Record<string, string | undefined>;
  argv: string[];
  version: string;
  pid: number;
  nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) => void;
  cwd: () => string;
  chdir: (dir: string) => void;
  emitWarning: (...args: unknown[]) => void;
  binding: (name: string) => unknown;
  stderr: { write: (...args: unknown[]) => boolean };
}

/**
 * Installs a minimal browser stand-in for the Node `process` global, only when one is not
 * already present. Deliberately carries no `versions` key, so `process.versions?.node`
 * checks still say "not Node".
 */
export function installProcessStub(): void {
  if (typeof globalThis.process !== 'undefined') return;
  const stub: ProcessStub = {
    platform: 'browser',
    env: {},
    argv: [],
    version: '',
    pid: 0,
    nextTick: (fn, ...args) => {
      queueMicrotask(() => fn(...args));
    },
    cwd: () => '/',
    chdir: () => {},
    emitWarning: () => {},
    binding: () => ({}),
    stderr: { write: () => true },
  };
  (globalThis as { process?: unknown }).process = stub;
}
