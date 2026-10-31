// The base path the build is made for: the root, where the VPS serves the app (kestrel.allmymind.org; scripts/deploy-vps.sh, docs/hosting.md).
// SF_BASE names another path for a build served under one: the e2e build is made for /spell-forge/ (playwright.config.ts), so a base is still
// proved to work under a path. GitHub Pages at /spell-forge/ serves only the moved page (vite.moved.config.ts).
export function appBase(env) {
  const base = env.SF_BASE || '/';
  if (!/^\/([\w.-]+\/)*$/.test(base)) throw new Error(`SF_BASE must be a path that starts and ends with a slash, such as / or /spell-forge/ (got "${base}")`);
  return base;
}
