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
