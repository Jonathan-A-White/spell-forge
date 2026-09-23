# sCrypt size prototype (reference only)

Recovered verbatim from the spec review of `docs/bsv-nft-gated-app-spec.md`
(rounds 3 and 4, 2026-09-17). These are the contracts that produced the
measured sizes in spec §3.7 and §6.

| File | What it is | Measured (sCrypt compiler 1.20.0) |
|------|------------|-----------------------------------|
| `licenseExact.ts` | License, SIGHASH_ALL, exact three-output layout; `write` and `transfer` | locking 4,171 B, unlocking (`write`) 5,828 B |
| `fuelSingle.ts` | Fuel `spend`, SIGHASH_SINGLE | locking 1,171 B, unlocking 1,374 B |
| `measure3.ts` | The harness that produced the License numbers (DummyProvider, no network) | — |

Measurement conditions: 32-byte collection ID, 33-byte owner key, 200-byte
payload, the real `FuelSingle` locking script as output 1. Toolchain:
scrypt-cli 0.2.3, scrypt-ts (latest from the template on 2026-09-17),
sCrypt compiler 1.20.0.

**Not the contract.** These are minimal size prototypes. Before building on
them, diff against spec v0.13 §3.7 rules (a)–(f): the signature-flag rule (e)
and the transaction-version check are absent, and `FuelSingle.FEE_CAP` is
`1000n` where §3.9 now sets 2,000 sat per restricted input (F49).

**Excluded from the build.** scrypt-ts is not a dependency of this app yet,
so this directory is excluded from `tsconfig.app.json` and from ESLint.
`measure3.ts` imports from `./src/contracts/…` as it did in the prototype
project; fix the paths when moving it.
