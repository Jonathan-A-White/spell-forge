# Measured contract sizes

Measured with sCrypt compiler `1.20.0+commit.693498a` (pinned in `COMPILER`, installed by
`sh scripts/bsv-contracts-setup.sh`), compiled via `npm run bsv:contracts:build`.

## License, spec v0.13 §3.7 (mw-5wuz6.2)

Measured on the transactions `tests/unit/bsv-contracts-license.test.ts` builds
(`tests/fixtures/bsv/license-contract.ts`: fixed keys, so the signatures and sizes are
reproducible), reading `lockingScript.toBuffer().length` and input 0's
`script.toBuffer().length`. The two happy-path tests assert these numbers, so they fail
when a change to the contract moves them.

| Contract | Locking script | Unlocking script (`write`) | Unlocking script (`transfer`) |
|----------|---------------:|---------------------------:|------------------------------:|
| License, §3.7 rules (a)–(f) | 4,307 B | 6,012 B | 6,153 B |
| Prototype: License (exact layout, ALL) | 4,171 B | 5,828 B | — |

**Conditions**, for both methods: 32-byte `collectionId`, 33-byte compressed
`ownerPubKey`, and as output 1 a 1,171-byte stand-in Fuel script (the prototype
`FuelSingle`'s length). The unlocking script carries the whole Push TX preimage (which
holds the 4,307-byte locking script), `prevouts` (36 B per input), output 1's script and
output 2's script, so it grows with each of them.

| | `write` | `transfer` |
|--|--------:|-----------:|
| Inputs (so `prevouts`) | 2: token, fuel (72 B) | 3: token, fuel, buyer payment (108 B) |
| Output 1 script (stand-in Fuel) | 1,171 B | 1,171 B |
| Output 2 script (Data) | 216 B: a 14-byte header (`OP_FALSE OP_RETURN`, `nftgate`, version, `W`), then a 200-byte payload in an `OP_PUSHDATA1` push | 217 B: the same with `TR` (15-byte header) |
| Outputs 3+ (`restOutputs`) | none | 68 B: two P2PKH outputs (payment, change) |
| New owner key | — | 33 B |

The unlocking size can differ by a byte with a different signer or transaction (a DER
signature with its flag byte is 71–73 bytes).

**Against the prototype** (1 input, a 204-byte Data script): the locking script grew by
136 B with the §3.7 checks the prototype lacked (the signature flag, the `nftgate` prefix
and the record type; see `NOTES.md`). The write's unlocking script grew by 184 B: those
136 B again inside the preimage, 36 B for the second input's outpoint in `prevouts`,
and 12 B for the longer Data script.

## Fuel(C), spec v0.13 §3.7 `spend` (mw-yo97u.2)

Measured on the happy write `tests/unit/bsv-contracts-fuel.test.ts` builds
(`tests/fixtures/bsv/fuel-contract.ts`): a §4.3 write whose input 0 is a real License and
input 1 a real Fuel(C), both created by the same source transaction, reading
`lockingScript.toBuffer().length`, input 1's and input 0's `script.toBuffer().length` and
`tx.toBuffer().length`. The happy-path test asserts these numbers.

| | Measured | Spec v0.13 | Prototype `FuelSingle`, measured here |
|--|---------:|-----------:|--------------------------------------:|
| `FEE_CAP`, as compiled | 2,000 sat (`d007`) | 2,000 sat (§3.9) | 1,000 sat |
| Fuel locking script | 1,204 B | 1,171 B (§3.7) | 1,171 B |
| Fuel `spend` unlocking script, prevouts 72 B (2 inputs) | 1,443 B | 1,374 B (§3.7) | 1,410 B |
| The whole License + Fuel write, 200-byte payload | 13,341 B | ≈ 12.9 KB (§3.9, §6) | — |

**Conditions**: 32-byte `collectionId`, two inputs (License, Fuel: a 72-byte `prevouts`),
output 1 at own value − 1,290 sat. The unlocking script carries the Push TX preimage (which
holds the 1,204-byte locking script), `prevouts` and `fuelValue`, so it grows with each.

**Against the prototype.** Fuel's locking script is 33 B longer: check (3), "the Fuel is
input 1" (`NOTES.md`); `FEE_CAP` 1,000 → 2,000 is the same two bytes. Compiled here and
spent in the same two-input transaction, the prototype's unlocking script is 1,410 B; the
spec's 1,374 B is that less 36 B, one outpoint of `prevouts`, so the spec's row appears to
have been measured with a one-input `prevouts`. Fuel's 1,443 B is those 1,410 B plus the
33 B of locking script inside the preimage.

**The write, part by part** (13,341 B): input 0's License `write` unlocking script
6,044 B (which carries Fuel's 1,204-byte script as output 1's argument), input 1's Fuel
unlocking script 1,443 B, output 0 the License 4,307 B, output 1 Fuel 1,204 B, output 2
the Data output 216 B, and 127 B of transaction framing. The spec's parts (5,828 + 1,374 +
4,171 + 1,171 + a 204-byte Data output, with the same framing) sum to 12,875 B, ≈ 12.9 KB;
the 466 B between are the License's §3.7 checks (136 B, twice: its locking script and its
preimage), Fuel's check (3) (33 B, three times: its locking script, its preimage, the
License's argument), the second outpoint in both `prevouts` lists (36 B, twice), the
12-byte longer Data header (twice: output 2 and the License's argument), less one byte of
DER signature. At 100 sat/kB it costs 1,334 sat: above `FEE_W` ≈ 1,290 sat, still under `FEE_CAP`.

## Real testnet transactions with Fuel(C) (mw-yo97u.5)

Measured on the real mint, write and transfer built by `license-contract.ts`'s production
builders (`buildContractMintTransaction` at `MINT_FUEL` = 10,000 sat, `buildContractTokenRecordTransaction`,
`buildContractTransferTransaction`) and broadcast against WhatsOnChain testnet by
`tests/testnet/license-token.testnet.test.ts` (`npm run test:bsv:testnet`), reading
`transaction.inputs[1].unlockingScript.toBinary().length` (the Fuel input), the write's
`transaction.toBinary().length`, and (total input satoshis − total output satoshis) for the
fee. Beside the §3.7/§6 estimates above (measured on the fixture's Push TX preimage, not a
real broadcast tx):

| | Measured | Spec v0.13 / fixture estimate |
|--|---------:|--------------------------------------:|
| Fuel `spend` unlocking script (`write`, real tx) | 1,440 B | 1,374 B (§3.7) / 1,443 B (fixture, mw-yo97u.2) |
| Fuel `spend` unlocking script (`transfer`, real tx) | 1,440 B | — |
| The whole write tx, full size | 13,105 B | ≈ 12.9 KB (§3.9, §6) / 13,341 B (fixture, mw-yo97u.2) |
| Write fee actually paid | 14 sat | ≈ 1,290 sat (`FEE_W`, §6) |
| Transfer fee actually paid | 14 sat | — |

**Conditions**: `MINT_FUEL` 10,000 sat (two `FEE_CAP` burns plus headroom), `feeRateSatPerKb`
1 (this app's testnet config) — at that rate the write's real 13,105-byte size costs 14 sat,
comfortably under `FEE_CAP` (2,000 sat) and far under the fixture's 100-sat/kB estimate of
1,334 sat (§3.7's own comparison above). Both the write and the transfer spend the License
at input 0 and the Fuel at input 1, with no holder coin input at all — the fee is paid
entirely from the Fuel's own value, output 1 landing at 9,986 sat (own − 14) on the write.

## Real testnet transactions (mw-5wuz6.6)

Measured on the real write and transfer built by `license-contract.ts`'s production
builders (`buildContractTokenRecordTransaction`, `buildContractTransferTransaction`) and
broadcast against WhatsOnChain testnet by `tests/testnet/license-token.testnet.test.ts`
(`npm run test:bsv:testnet`, confirmed in block 1759641), reading
`transaction.inputs[0].unlockingScript.toBinary().length`, `transaction.outputs[1/2].lockingScript.toBinary().length`,
and (total input satoshis − total output satoshis) for the fee. Beside the estimates
above, which size output 1 as the prototype's 1,171-byte `FuelSingle` stand-in: the real
builders' output 1 is instead a genuine 25-byte P2PKH to the holder (`new
P2PKH().lock(holderAddress)`, the Fuel stand-in "until the Fuel contract exists" —
license-contract.ts's own header), so the real unlocking scripts run far smaller than the
fixture's spec-comparison estimate.

| | `write` | `transfer` |
|--|--------:|-----------:|
| Unlocking script (input 0) | 4,784 B | 4,738 B |
| Output 1 script (real P2PKH Fuel stand-in) | 25 B | 25 B |
| Output 2 script (Data), incl. header | 102 B | 59 B |
| Fee paid | 10 sat | 10 sat |

## Prototype measurement (mw-5wuz6.1)

Against the unmodified copy of `prototype/licenseExact.ts`: locking 4,171 B, unlocking
(`write`) 5,828 B. This matched spec §3.7's "License (exact layout, ALL) v0.5" row
exactly (4,171 B / 5,828 B, measured there with sCrypt compiler 1.20.0), so the toolchain
in this repo reproduced the spec's measurement.

Conditions (as `prototype/measure3.ts`): 32-byte `collectionId`, 33-byte compressed
`owner` public key, one input, a 200-byte `write` payload (204 bytes once wrapped in
`OP_FALSE OP_RETURN <push> <payload>`), and a real `FuelSingle` script (from
`prototype/fuelSingle.ts`, compiled with the same toolchain) as output 1: 1,171 bytes,
matching spec §3.7's Fuel `spend` locking-script row. `FuelSingle` was compiled to a
scratch location for that measurement only and is not committed.
