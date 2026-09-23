# Contracts toolchain (isolated)

Not part of the app. `scripts/bsv-contracts-build.ts` and `scripts/bsv-contracts-check.ts`
run `npm ci` here on first use, then drive this directory's own `scrypt-cli` to transpile
`src/bsv/contracts/*.ts` (scrypt-ts) into sCrypt artifacts.

**Why a separate `package.json`.** `scrypt-cli` pulls in `scrypt-ts-transpiler`, which
requires TypeScript ~5.3 and patches it via `ts-patch` (adds support for the `plugins`
transform tsc doesn't have natively). `ts-patch` 3.0.1/3.3.0 cannot apply that patch to
TypeScript 5.9 cleanly enough for the transpiler to run (confirmed by trial: patching
succeeds, but the transpiler's own AST-walking code throws on TS 5.9's node shapes). The
app's `package.json` pins TypeScript 5.9.3 and must not move. So this directory pins
TypeScript 5.3.3 for the transpile step only, entirely separate from the app's
`node_modules`. `npm ci` here never touches the root `package.json`/`package-lock.json`.

`node_modules/` here is covered by the repo's blanket `node_modules` ignore.
