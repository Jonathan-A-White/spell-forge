#!/usr/bin/env node
// scripts/bsv-fix-dist-extensions.mjs — appends an explicit .js extension to relative
// import/export specifiers in packages/bsv/dist/**/*.{js,d.ts} (mw-1589l.1). tsc's
// "bundler" moduleResolution emits the extensionless specifiers src/bsv's own source
// already uses; a bundler resolves those fine, but plain Node ESM (e.g. a consumer's
// vitest run, which externalizes node_modules packages to Node's own loader) requires
// the extension. Never touches src/bsv/contracts/*.ts, which is copied as raw source
// (see scripts/bsv-pack.sh) and stays extensionless for the consumer's own bundler to
// resolve, same as it already does inside SpellForge's own app.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const distDir = process.argv[2];
if (!distDir) {
  console.error('Usage: bsv-fix-dist-extensions.mjs <dist-dir>');
  process.exit(1);
}

const SPECIFIER = /((?:from|import)\s+['"])(\.\.?\/[^'"]*)(['"])/g;

function fixExtensions(source) {
  return source.replace(SPECIFIER, (match, prefix, spec, suffix) => {
    if (extname(spec)) return match; // already has an extension (e.g. a .json import)
    return `${prefix}${spec}.js${suffix}`;
  });
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts')) {
      const original = readFileSync(path, 'utf-8');
      const fixed = fixExtensions(original);
      if (fixed !== original) writeFileSync(path, fixed);
    }
  }
}

walk(distDir);
