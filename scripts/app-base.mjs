// The base path the build is made for. GitHub Pages serves the app under /spell-forge/ (the default, so that address is unchanged);
// the VPS serves it at the root of kestrel.allmymind.org and builds with SF_BASE=/ (scripts/deploy-vps.sh, docs/hosting.md).
export function appBase(env) {
  const base = env.SF_BASE || '/spell-forge/';
  if (!/^\/([\w.-]+\/)*$/.test(base)) throw new Error(`SF_BASE must be a path that starts and ends with a slash, such as / or /spell-forge/ (got "${base}")`);
  return base;
}
