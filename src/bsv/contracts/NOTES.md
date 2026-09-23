# License contract: from the prototype to spec v0.13 §3.7

`license.ts` began as a verbatim copy of `prototype/licenseExact.ts`, the size
prototype behind spec §3.7's "License (exact layout, ALL) v0.5" row. This note is the
rule-by-rule diff between that prototype and spec v0.13 §3.7 rules (a)–(f), with the
line of `license.ts` that now enforces each rule (mw-5wuz6.2). Tests:
`tests/unit/bsv-contracts-license.test.ts`.

## Rules (a)–(f)

| Rule | Spec v0.13 §3.7 | Enforced at `license.ts` | Prototype | What changed, and why |
|------|-----------------|--------------------------|-----------|-----------------------|
| (a) | `prevouts`, checked against the preimage's `hashPrevouts`, has the contract's own outpoint at index 0 | line 63 (`slice(this.prevouts, 0n, 36n) == me`); scrypt-ts adds the `hash256(prevouts) == hashPrevouts` check itself wherever `this.prevouts` is read | present | Unchanged, moved into the shared `checkSpend`. No other input is restricted: a funding input at index 1 or later is allowed (the Governor's Q1 condition 2). Both happy-path tests carry one. |
| (b) | output 0 holds exactly 1 satoshi | lines 42 and 53 (`buildStateOutput(1n)`), bound by the `hashOutputs` asserts at 45 and 56 | present | Unchanged. |
| (c) | output 0's script is the contract's own, only the owner key substituted, and only in `transfer`, whose Data output has record type `TR` | lines 42 and 53 rebuild output 0 from the running script's own code (so `collectionId` and `fuelScriptHash` cannot change) and the state prop `ownerPubKey`; only `transfer` assigns it (line 52); line 51 requires the `TR` record type; bound at 45 and 56 | partly: the owner key changed only in `transfer`, but nothing tied `transfer` to a `TR` record | **Added** the `TR` record-type check (line 51), so an owner-key change is always carried by a `TR` Data output. The owner prop is renamed `owner` → `ownerPubKey` (§3.1's "mutable owner public key"). |
| (d) | a valid signature by the current owner key | line 65 (`checkSig(sig, this.ownerPubKey)`) | present | Unchanged. In `transfer` the signature is checked against the key *before* substitution (line 65 runs from `checkSpend`, line 50, before line 52). |
| (e) | that signature carries SIGHASH_ALL\|FORKID (0x41), so the owner commits to every input | line 64 (last byte of `sig` is `41`); lines 38 and 48 (`@method(SigHash.ALL)`) make the Push TX preimage ALL\|FORKID too | **absent**: the preimage was ALL (scrypt-ts's default), but the owner's signature could carry any flag, e.g. ANYONECANPAY, which commits to its own input only | **Added** line 64. The Push TX preimage commits to every input, but anyone can build a preimage; only the owner's signature flag says the *owner* committed to them. With ANYONECANPAY\|ALL, whoever completes the transaction could change the other inputs after the owner signed. |
| (f) | outputs are exactly [0] itself (1 sat), [1] `Fuel(C)` identified by a script hash compiled into the contract, [2] a zero-value `OP_FALSE OP_RETURN` Data output; in `transfer` only, any further outputs | line 66 (`hash256(fuelScript) == this.fuelScriptHash`); line 67 (output 2 starts `OP_FALSE OP_RETURN` + push `nftgate` + a one-byte push); line 41 (a write's record type is `W`); lines 43–44 and 54–55 (`Utils.buildOutput(dataScript, 0n)`: zero value); line 45 (a write's outputs are exactly these three); line 56 (a transfer's are these three, then `restOutputs`) | partly: exact layout and Fuel hash present; output 2 was only checked to start `006a` | **Added** the `nftgate` prefix (line 67) and the `W` record type on a write (line 41), so output 2 is a Data output of the right type, not any `OP_RETURN`. `fuelScriptHash` stays a constructor prop, not a literal: the artifact's hex carries `<fuelScriptHash>`, filled with the stand-in's hash in tests and Fuel's once the Fuel contract exists. |

## Data output bytes the contract reads

Spec §3.8 fixes the protocol identifier (7 bytes `nftgate`) and a one-byte format
version, then the record type, but not the record type's byte encoding. The contract
reads the Data output script as:

| Bytes | Content | Checked |
|-------|---------|---------|
| 0–1 | `00 6a` (OP_FALSE OP_RETURN) | yes, line 67 |
| 2–9 | `07 6e 66 74 67 61 74 65` (push 7 `nftgate`) | yes, line 67 |
| 10 | `01` (push 1: the format version) | yes, line 67 |
| 11 | the format version | **no**: future format versions keep working with a minted token |
| 12– | the record type as a data push of its ASCII name: `01 57` (`W`), `02 54 52` (`TR`) | yes, lines 41 and 51 |

Everything after the record type (§3.8 fields 3–5) is opaque to the contract. This
encoding is the contract's; the record encoder (not yet written for format 0x02) must
match it.

## Not enforced, and open

- **`W` only on a write.** The story asks for record type `W` in `write`. Spec §4.3 says
  rotation (`R`, `R+`) and re-wrap (`W2`) transactions use the same three-output layout,
  and `MG` is a holder record too (R4.6.2), so as written `write` refuses them. If they
  are to be spent through `write`, line 41 becomes "not `TR`" or a set of types.
- **Transaction version > 1** (§3.7 "Common") is not checked: it is outside rules
  (a)–(f), and the test transactions are version 1.
- **The Fuel script hash is `hash256`** (double SHA-256), as in the prototype. §3.7 says
  only "a script hash".
- **The format version byte** (byte 11) is not checked, as above.

## Other differences from the prototype

- The class is `License` (was `LicenseExact`); the artifact's contract name follows.
- The checks common to both methods live in one non-public `@method()`, `checkSpend`
  (lines 60–68); sCrypt inlines it into both public methods.
- Assert messages name the rule they enforce; scrypt-ts reports them when the contract's
  TypeScript runs (`exec`), while the compiled script fails with an opaque interpreter
  error (see the test).

# Fuel(C): from the prototype to spec v0.13 §3.7

`fuel.ts` began as a copy of `prototype/fuelSingle.ts`, the size prototype behind spec
§3.7's "Fuel `spend` (SINGLE)" row. This is the rule-by-rule diff between that prototype
and spec v0.13 §3.2/§3.7's `spend`, with the line of `fuel.ts` that now enforces each
(mw-yo97u.2). `consolidate` (Fuel) and `merge` (TopUp) are not written yet. Tests:
`tests/unit/bsv-contracts-fuel.test.ts`.

## `spend`, under a SIGHASH_SINGLE|FORKID (0x43) preimage

| Check | Spec v0.13 | Enforced at `fuel.ts` | Prototype | What changed, and why |
|-------|------------|-----------------------|-----------|-----------------------|
| (1) `hash256(prevouts)` equals the preimage's `hashPrevouts` | §3.7 FB-1 needs the prevouts list, verified | scrypt-ts, wherever `this.prevouts` is read (lines 30–31); the list and the preimage are the hidden ABI arguments `__scrypt_ts_prevouts` and `__scrypt_ts_txPreimage` after `fuelValue` | present, the same way | Unchanged. The test proves it is in the compiled script: a forged list claiming the License at input 0 fails, and the same explicit-argument path with the real list verifies. |
| (2) FB-1: `prevouts[0]` is `(T, 0)`, `T` the txid of the Fuel's own outpoint | §3.7 FB-1 (tightened v0.4) | line 30 | present | Unchanged. |
| (3) the Fuel is input 1: `prevouts[1]` is its own outpoint | §3.7 `spend`, "the fuel input is at index 1" | line 31 | **absent** | **Added.** Under SINGLE the Fuel's input index picks the one output its preimage binds, so this also fixes that (4) reads output 1. Without it a Fuel at input 2 would bind output 2 instead (in a §4.3 write, the Data output). Costs 33 B of locking script. |
| (4) output 1 is `Fuel(C)`, its own locking script unchanged, with value ≥ own value − `FEE_CAP` | §3.7 `spend`; §3.9 `FEE_CAP` 2,000 sat, compiled in | line 32 (value); line 33 (`hashOutputs` is exactly one output: `ctx.utxo.script`, the running script, at `fuelValue`) | present, `FEE_CAP = 1000n` as a plain static | `FEE_CAP` is **2,000** (§3.9, F49), and a `@prop()` static, the style of `license.ts`'s constants: still a compile-time constant, inlined as `d007`. Assert messages name what they check. |
| no signature | §3.2: Fuel has no spending key | — | none | Unchanged: `spend` takes no `Sig`. |

The class is `Fuel` (was `FuelSingle`); the artifact's contract name follows. Its only
constructor prop is `collectionId`, so Fuel(C)'s script, and with it the License's
`fuelScriptHash`, is per collection. There is no mutable state.

## Why FB-1 needs the prevouts list as an argument

A sighash preimage carries only `hashPrevouts`, the double SHA-256 of every input's
outpoint, never the outpoints themselves. FB-1 is a statement about another input
(`prevouts[0]` must be `(T, 0)`), so the unlocking script has to push the whole serialised
list (36 B per input), and the contract hashes it and compares it to the preimage's
`hashPrevouts` before trusting any entry. SIGHASH_SINGLE without ANYONECANPAY still
commits to `hashPrevouts`, which is why the cheap preimage suffices. Check (3) reads the
same list.

## No circular hashes

Fuel embeds only the collection id; it never embeds the License's script or its hash. Its
`spend` requires output 1's script to be its own running locking script, unchanged, so a
Fuel(C) output is byte-identical on every hop and `hash256` of it (the License's
`fuelScriptHash`) stays valid for the token's whole life. The License's `fuelScriptHash` is
a constructor prop (`license.ts` line 26): the License artifact's hex carries
`<fuelScriptHash>`, so a changed Fuel script needs only a new value at mint, not a License
recompile (though every License already minted pins the old hash).

## Not enforced, and open

- **Transaction version > 1** (§3.7 "Common") is not checked, as in the License.
- **A Fuel spent without its License.** FB-1 trusts that `(T, 0)` is the License: every
  license transaction puts it there (§3.7 invariant, §4.3). Fuel does not read input 0's
  script; a `T` whose output 0 is not a License (a mint built otherwise) would leave its
  Fuel spendable next to whatever `(T, 0)` is.
- **What the License does not check.** In a §4.3 write, the License accepts output 1 at any
  value and the Fuel at any input after 0; the Fuel alone refuses under-conservation and a
  wrong input index (the test verifies input 0 passes in both). Output 1's script is
  refused by both: by Fuel's check (4) and by the License's `fuelScriptHash`.
