# Measured contract sizes

Measured with `sh scripts/bsv-contracts-setup.sh` (sCrypt compiler `1.20.0+commit.693498a`,
pinned in `COMPILER`), against `license.ts` (the unmodified copy of
`prototype/licenseExact.ts`), compiled via `npm run bsv:contracts:build`.

| Contract | Locking script | Unlocking script (`write`) |
|----------|---------------:|----------------------------:|
| License (exact layout, ALL) | 4,171 B | 5,828 B |

This matches spec §3.7's "License (exact layout, ALL) v0.5" row exactly (4,171 B / 5,828 B,
measured there with sCrypt compiler 1.20.0). The toolchain in this repo reproduces the
spec's measurement.

**Measurement conditions** (same as `prototype/measure3.ts`): 32-byte `collectionId`,
33-byte compressed `owner` public key, a 200-byte `write` payload (204 bytes once wrapped
in `OP_FALSE OP_RETURN <push> <payload>`), and a real `FuelSingle` script (from
`prototype/fuelSingle.ts`, compiled with the same toolchain) as output 1 — 1,171 bytes,
matching spec §3.7's Fuel `spend` locking-script row.

`FuelSingle` is not part of this story's shipped contracts (only `license.ts` is); it was
compiled to a scratch location for this measurement only and is not committed.
