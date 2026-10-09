// The checks behind tests/unit/credits.test.tsx: credits follow additions AND removals (mw-vtjxh4.17).
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface CreditLike {
  name: string;
  kind: string;
  packages?: string[];
  files?: string[];
}

interface PackageJsonLike {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** Runtime dependencies no credit names. */
export function uncreditedPackages(credits: readonly CreditLike[], pkg: PackageJsonLike): string[] {
  const credited = new Set(credits.flatMap((c) => c.packages ?? []));
  return Object.keys(pkg.dependencies ?? {}).filter((name) => !credited.has(name));
}

/**
 * Credited packages that package.json (dependencies or devDependencies) no longer has, and credits of kind
 * 'package' that name none. Credits of any other kind (text, font, data, service, idea, tool) are left alone
 * unless they list packages, which must then exist.
 */
export function stalePackageCredits(credits: readonly CreditLike[], pkg: PackageJsonLike): string[] {
  const known = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  const stale: string[] = [];
  for (const c of credits) {
    if (c.kind === 'package' && (c.packages ?? []).length === 0) stale.push(c.name);
    for (const p of c.packages ?? []) if (!known.has(p)) stale.push(p);
  }
  return stale;
}

// The app's own assets: not someone else's work, so no credit.
const OWN_ASSETS = new Set(['public/manifest.json', 'public/spell-forge.svg']);
const FONT_FILE = /\.(woff2?|ttf|otf|eot)$/i;

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
}

/** Repo-relative paths of every file the build ships that someone else made: all of public/ except the app's own assets, and any font file under src/. */
export function listShippedFiles(root: string): string[] {
  const files: string[] = [];
  walk(join(root, 'public'), files);
  walk(join(root, 'src'), files);
  return files
    .map((f) => relative(root, f).split(sep).join('/'))
    .filter((f) => (f.startsWith('public/') && !OWN_ASSETS.has(f)) || FONT_FILE.test(f))
    .sort();
}

/** Shipped files no credit names. A credit's `files` entry matches a file exactly, or a directory when it ends in '/'. */
export function uncreditedFiles(credits: readonly CreditLike[], shipped: readonly string[]): string[] {
  const named = credits.flatMap((c) => c.files ?? []);
  return shipped.filter((f) => !named.some((n) => (n.endsWith('/') ? f.startsWith(n) : f === n)));
}
