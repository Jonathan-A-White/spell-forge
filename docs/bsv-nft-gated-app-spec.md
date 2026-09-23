# Spec: NFT-Gated, Self-Funded On-Chain Application Data

**Status:** Draft v0.15 — v0.2 (F1–F34, D1–D10), v0.3 (F35, F36, F38, F44, D11), v0.4 (F42, F43, F46, D12–D16), v0.5 (F47, D17), v0.6 (F48, F49, D18), v0.7 (F40, F45, F50, D19–D22), v0.8 (F51, F52, D23), v0.9 (F53, F54, D24), v0.10 (F37, D25), v0.11 (F55, D26), v0.12 (F39, D27), round 12 (F41, D28–D30), v0.14 (F57), and v0.15 (docs consistency); see §11
**Target chain:** BSV
**Target client:** Offline-capable PWA (mobile-first), no full node

---

## 1. Purpose

Define a reusable architecture for an application where:

1. Access is **purchased**, and the purchase is represented by a transferable on-chain token.
2. Holders can **write** application data to the blockchain, and writes are enforced cryptographically rather than by a trusted server.
3. Holders can **read** application data that non-holders cannot read.
4. Users never need to acquire cryptocurrency, use an exchange, or understand wallets.
5. Access is **resellable** — selling the token transfers the capability.

> **v0.2 qualifications.**
> - Item 3: the issuer is an intentional exception and can read all application data (D9; §5, NG9).
> - Item 4: applies to the primary purchase. Resale buyers must already hold BSV (D8; C2, NG6).
> - Item 2: "enforced" is interpreted per the C3 note in §2 (D10).

The canonical example used throughout is a **private leaderboard**, but the pattern generalizes to any append-only, multi-writer, holder-gated dataset (shared logs, collaborative registries, licensed datasets, membership rolls).

---

## 2. Design constraints

These are non-negotiable inputs to the design. An agent reviewing this spec should flag any proposed change that violates one.

| ID | Constraint |
|----|-----------|
| C1 | Client is a PWA. No blockchain download, no local node. SPV only. |
| C2 | User must not need an exchange account or pre-existing crypto **for the primary purchase. Resale requires the buyer to hold BSV (decision D8, v0.2).** |
| C3 | Write authorization must be enforced on-chain, not by an application server. |
| C4 | Access must be transferable by the holder without issuer involvement. |
| C5 | Perceived write latency must be comparable to a normal REST call (< ~2s). |
| C6 | Per-write cost must be negligible at scale (target: **≤ 2,000 satoshis per write at the live broadcaster fee policy**; ≈ $0.32 per thousand writes at 2026-09-17 prices). *(Revised v0.4, decision D15; the v0.1 target was sub-cent per thousand writes.)* |
| C7 | No shared mutable UTXO may be contended by multiple users. |

**C3 interpretation note (v0.2, D10, F5).**
- **What the chain enforces:** that a write spends and recreates one specific License Token output, signed by its current owner key.
- **What it cannot enforce:** whether that output is a *genuine* license. Script cannot prevent anyone from creating a byte-identical copy of the license script as a new output.
- **How genuineness is established:** by a public validity rule (lineage to an issuer mint, §4.6), which any client checks from on-chain data without trusting a server.
- C3 is satisfied in that sense and in no stronger sense. See NG7.

**C5 interpretation note (v0.4, D14, F42).**
- **Measured separately:** writes that must first perform a fork-merge rotation (R4.2.7). Forks arise only from transfers that overlap before either is visible.
- **Target for those writes:** AC-C5-2.
- **Unchanged for every write:** it MUST appear as `pending` within the normal bound.

---

## 3. Core concepts

### 3.1 License Token
A transferable on-chain token representing purchased access. Implemented as a 1-satoshi inscribed ordinal whose locking script is a smart contract rather than a plain key-hash lock.

Identified permanently by its **origin** — the outpoint where it was minted. The origin survives every transfer and is the stable identifier for the license across its entire lifetime.

*(v0.2)* The license script has three parts: fixed contract code, the immutable **collection ID** (§3.9), and a mutable **owner public key**. Origin is determined by 1Sat Ordinals sat-ordering lineage (BRC-159), not by any field in the script.

### 3.2 Fuel Tank *(rewritten v0.2, F3, D1)*
A single contract-locked output, `Fuel(C)`, that pays a license's transaction fees.
- It has **no spending key**. It is spendable only under the Fuel contract rules (§3.7): only in a transaction that also spends the License Token created in the same transaction as the fuel (rule FB-1).
- Its satoshis can move only into the next `Fuel(C)` output or to miners as fees (rule VC-B).
- Holders can burn fuel but cannot withdraw it (NG8).
- Because FB-1 binds fuel to a specific token output, no two licenses ever contend for the same output (C7).

### 3.3 Write Record
An application data entry (a leaderboard score, a log line, a registry update). Committed as a transaction that simultaneously spends and recreates the License Token, proving current ownership.

*(v0.2)* The same transaction spends and consolidates the license's fuel (§4.3). The record is one of several **record types** carried in a Data output (§3.8).

### 3.4 Epoch Key *(replaces "Read Key", v0.2, F1, F2, D3)*
A random 256-bit symmetric key `k(e)` shared by the current holders of all licenses in one collection, and by the issuer (D9).
- **Not derived.** It is not derived from any party's identity key, so no BRC-42 counterparty can compute it.
- **Commitment.** Each epoch `e` is identified by the commitment `c(e) = SHA-256("nftgate-epoch" ‖ k(e))`.
- **Rotation.** A new epoch is created by an **exclusion rotation** (§4.4).
- **Backward link.** Each epoch links back to its predecessor with `L(e) = nonce ‖ AES-256-GCM(k(e+1), nonce, k(e))`, where `nonce` is 12 random bytes. Anyone holding `k(e+1)` can therefore recover every earlier key.
- **Merged epoch** *(new v0.10, F37, D25)*. When a fork is merged, the key is **derived**, not generated:

  ```
  k_merge = HKDF-SHA256( k_1 ‖ k_2 ‖ … ‖ k_n , info = "nftgate-merge" )
  ```

  with the branch keys concatenated in ascending order of their epoch commitments, over every branch of the fork. Every party holding all branch keys derives the same key; a holder excluded on any branch is missing an input and cannot, because the derivation is one-way. A merge therefore needs **no wraps**, and concurrent merges converge on the same key. The commitment is computed as for any other epoch, and the exact HKDF parameters are pinned with the other wire formats (§8 Q14).

### 3.5 Indexer
An off-chain service that watches the chain for valid Write Records under this application's protocol identifier and serves queries. Holds no authority — it validates, it does not authorize.

*(v0.2, F6)* Clients do not rely on the indexer's validation. They re-verify every record they count (R4.6.5). The indexer can withhold records; it cannot make a verifying client accept a forged one.

### 3.6 Rotation Record *(new v0.2, F14, F21)*
A Data output of type `R`, or the rotation part of a `TR` transfer record (v0.4, D12), that anchors a new epoch on chain. It contains:
- the new epoch number `e+1`
- the parent commitment `c(e)` and the new commitment `c(e+1)`
- the backward link `L(e)`
- a **wrap** of `k(e+1)` for every current holder not being excluded, and for the issuer reader key

A wrap is an encryption of the epoch key to a recipient public key. It uses an ephemeral-key **P-256** ECDH + HKDF-SHA256 + AES-256-GCM construction *(curve fixed v0.13, F41, D29)*; the exact construction is **UNVERIFIED** and to be pinned at implementation (§8 Q14). Epoch keys themselves are random symmetric keys, not curve points, and are unaffected by the curve choice.

The record is carried in a transaction that spends and recreates the rotator's own License Token (§4.3 layout). For a transfer, the record is the transfer transaction itself (`TR`, R4.4.3).

If the wraps exceed the per-transaction limit, the rotation continues in type `R+` continuation records chained from the same rotator's token. The limit is `WRAP_MAX` when a payment input funds the fee, and otherwise what `FEE_CAP` can pay for.

### 3.7 Contracts *(new v0.2, F3, F20, D1)*

*(v0.4, D16; revised v0.5, D17)* Contracts use a **hybrid** introspection scheme:
- The License contract uses a SIGHASH_ALL preimage and binds the **exact** output list, so that fuel slack has nowhere to go but miner fees (F47).
- The Fuel contract's everyday `spend` uses a SIGHASH_SINGLE preimage, which binds only the output at its own index. It stays small because the License already fixes the layout.
- Merging methods use a SIGHASH_ALL preimage.

**License contract.** Methods `write` and `transfer`, both with an ALL preimage. On any spend:
- (a) the prevouts list, verified against the sighash preimage's `hashPrevouts`, has the contract's own outpoint at index 0;
- (b) output 0 holds exactly 1 satoshi;
- (c) output 0's script equals the contract's own script, with only the owner public key substituted, and substitution permitted only in `transfer`, whose transaction's Data output has record type `TR`;
- (d) a valid signature by the current owner key is present;
- (e) *(v0.4)* that signature carries the SIGHASH_ALL|FORKID flag (0x41), so the owner commits to every input as well;
- (f) *(v0.5, F47, D17)* the outputs are exactly:
  - output 0: itself, 1 satoshi;
  - output 1: `Fuel(C)`, identified by a script hash compiled into the License contract;
  - output 2: a zero-value `OP_FALSE OP_RETURN` Data output;
  - and, in `transfer` only, any further outputs (payment and change).

  So a non-`TR` license transaction has **exactly three outputs**.

Rules (a) and (b) together guarantee the token satoshi moves from input 0 to output 0 under BRC-159 sat ordering.

**Fuel contract, `Fuel(C)`.**
- **FB-1** *(tightened v0.4)*: a `Fuel(C)` output created in transaction `T` may be spent only if the spending transaction's `prevouts[0]` is `(T, 0)`.
- **Method `spend`** *(SINGLE preimage; v0.4, D16)*, used on ordinary writes and transfers:
  - FB-1 holds;
  - the fuel input is at index 1;
  - output 1 is `Fuel(C)`, with value ≥ own value − `FEE_CAP`.

  The License's rule (f) supplies what `spend` cannot see: with the output list fixed, the slack (`FEE_CAP` − actual fee) can only become miner fee.
- **Methods `consolidate` (Fuel) and `merge` (TopUp)** *(ALL preimage)*, used whenever a transaction has more than one restricted input. Layout: the spending transaction's outputs, checked via `hashOutputs`, MUST begin with:
  - output 0: a 1-satoshi License contract output of collection `C`
  - output 1: `Fuel(C)`
  - output 2: a Data output

  Outputs 3 and later are unrestricted (e.g. swap payment and change, R4.4.12). VC-B still prevents restricted value from reaching them.
- **VC-B:** the Data output carries a value manifest of `(inputIndex, value)` for every restricted input. A restricted input is a `Fuel(C)` or `TopUp` input. Each restricted input checks that its own entry matches its own value. Output 1's value MUST be ≥ Σ(manifest values) − `FEE_CAP` × n, where n is the number of manifest entries *(amended v0.6, F49, D18: a consolidation needs more fee headroom than a single write, and n cannot be understated because each restricted input verifies its own entry)*.

**TopUp contract, `TopUp(C, ownerPub)`.** Spendable only through `merge`: a signature by `ownerPub`, in a transaction satisfying the consolidation layout and VC-B, with itself listed in the manifest.

**Invariant** *(v0.4)*: every license transaction leaves exactly one `Fuel(C)` output, at output 1.

**Slack** *(v0.5, F47; v0.6)*: slack can only become miner fee, except in `TR` transactions, where it may reach outputs 3+ — at most `FEE_CAP` × n once per transfer (NG8). A `spend` transaction's slack is one `FEE_CAP`; a consolidation's is `FEE_CAP` × n.

**Common.** All contracts use Push TX (BRC-21) introspection and require transaction version > 1.

**Measured sizes** *(v0.4, F43; remeasured v0.14, F57, on the shipped `write` transaction, sCrypt compiler 1.20.0+commit.693498a, 200 B payload; `src/bsv/contracts/SIZES.md`, measured by mw-yo97u.2)*:

| Contract | Locking script | Unlocking script (`write`) |
|----------|---------------:|----------------------------:|
| License (exact layout, ALL, rules (a)–(f)) *(v0.5; remeasured v0.14)* | 4,307 B | 6,044 B |
| Fuel `spend` (SINGLE) *(remeasured v0.14)* | 1,204 B | 1,443 B |
| Data output (`W` record, 200 B payload) and transaction overhead *(new v0.15; `SIZES.md`)* | 216 B | 127 B |
| Fuel `consolidate` (ALL) *(v0.6)* | 1,725 B | ≈ 6,322 B |
| TopUp `merge` (ALL) *(v0.6)* | 1,148 B | ≈ 6,994 B |

The License, Fuel `spend`, and Data-output/overhead rows above sum to 13,341 B, the write size §3.9's `FEE_W` and §6 use (`SIZES.md`, "The write, part by part").

*Prototype (v0.4, research round 3; same toolchain, before License rules (e)/(f) and Fuel's check (3), and measured with a one-input `prevouts`)*: License (exact layout, ALL) 4,171 B locking / 5,828 B unlocking; Fuel `spend` (SINGLE) 1,171 B locking / 1,374 B unlocking. F57 found that these parts, each measured in isolation and summed, undercount a real combined transaction: see F57 in §11.

The two ALL-mode rows were measured against a stand-in License output and adjusted to the real License script size; see round-5 research.

The License unlocking script carries the fuel output's script and the Data output, so a payload's bytes are paid for twice. Fuel `consolidate` and TopUp `merge` sizes are estimates (§6). Sizes may shrink with optimization (§8 Q16).

### 3.8 Data output and record types *(new v0.2, F14, F33)*
An `OP_FALSE OP_RETURN` output carrying, in order:
1. the protocol identifier — the 7 ASCII bytes `nftgate` *(fixed v0.13, D30)*, followed by a one-byte format version; version `0x01` is the plaintext proof-out format used before this spec's records exist, and versions `0x02+` are the typed, encrypted records defined here
2. the record type
3. the epoch commitment used (or created)
4. the value manifest (empty when the transaction has no restricted inputs)
5. the type-specific payload

It does not carry the license origin in plaintext.

| Type | Meaning | Payload |
|------|---------|---------|
| `G` | Collection genesis (issuer) | collection parameters, collection nonce `n_C`, issuer reader public key, issuer mint public key, `c(0)`, wrap of `k(0)` to the issuer reader key *(amended v0.3, F35, F44)* |
| `M` | Mint | the buyer's **wrap public key** *(v0.12, F39)*; wrap of the current `k(e)` to it; stamp (§3.10) *(amended v0.3, F35)* |
| `W` | Write | ciphertext under an epoch key |
| `T` | *Retired v0.4 (D12); reserved, invalid for new records* | — |
| `TR` | Transfer + rotation *(new v0.4, D12)* | the recipient's **wrap public key** *(v0.12, F39)*; wrap of the current `k(e)` to it; departure marker for the previous owner; the rotation fields of §3.6, built by the recipient |
| `R` / `R+` | Rotation / continuation | see §3.6 |
| `MG` | Fork merge *(new v0.10, F37)* | the parent commitment of every branch, the merged commitment, and backward links `Enc(k_i, k_merge)` per branch. No wraps: the key is derived (§3.4) |
| `W2` | Re-wrap (holder) | wrap of an existing `k(e)` to one holder, for R4.4.10 |
| `IW2` | Re-wrap (issuer) *(new v0.3, F36)* | wrap of an existing `k(e)` to one holder; stamp (§3.10) |
| `K` | Issuer key record (issuer) *(new v0.13, F41)* | new issuer reader public key (P-256), monotonic sequence number; stamp (§3.10) |
| `B` | Epoch beacon (issuer) *(new v0.7, F40)* | current epoch commitment, block height at publication, monotonic sequence number; stamp (§3.10) |
| `V` | Release record (issuer) *(new v0.7, F45)* | client release version and the build hash of the deployed artifact; stamp (§3.10) |

### 3.9 Collection and parameters *(new v0.2)*
A **collection** is the set of licenses minted by one issuer under one genesis record (type `G`). Its **collection ID** is the genesis transaction ID.

*(v0.3, F44)* The **collection nonce** `n_C` is 16 random bytes chosen by the issuer *before* the genesis transaction is built and published inside it. Collection-scoped issuer keys are derived from `n_C`, never from the collection ID, because the collection ID does not exist until the genesis transaction is complete. Client configuration pins the collection ID; that pin authenticates the `G` record.

| Parameter | Default | Status |
|-----------|---------|--------|
| `D_MAX` (unconfirmed writes chained per license) | 20 | Conservative; node policy only partly verified (§8 Q9) |
| `GAP` (owner-key gap limit) *(renamed v0.3 from `G` to avoid clashing with record type `G`)* | 20 | — |
| `FEE_W` (fee for one write) *(new v0.4; remeasured v0.5; remeasured v0.14, F57)* | ≈ 1,334 sat | Measured write size (13,341 B for a 200 B payload; sCrypt compiler 1.20.0, on the shipped `write` transaction, measured by mw-yo97u.2 in `SIZES.md`) × live policy (100 sat/kB, GorillaPool, 2026-09-17). 466 B over v0.5's ≈12,875-B estimate: License's §3.7 rule growth beyond the prototype (272 B), the real Data-output header vs. the prototype's bare payload push (24 B), Fuel's own §3.7 check (3) (99 B), and the second input's `prevouts` outpoint counted in both unlocking scripts (72 B), less 1 B of DER signature noise (F57) |
| `FEE_CAP` (max fuel burned **per restricted input**, v0.6 D18) | 2,000 sat | ≈ 1.5 × `FEE_W` *(restated v0.15 for `FEE_W` ≈1,334 sat)*; compiled into the Fuel contract (changing it is a contract version change, §8 Q7, Q17) |
| `V_MIN` (minimum TopUp value) *(raised v0.6, F49)* | 25,000 sat | ≈ 10 × `FEE_CONS`, so merging costs ≈ 10% of a TopUp |
| `FEE_CONS` (reference consolidation cost) *(new v0.6)* | ≈ 2,486 sat | Measured consolidation ≈ 24.9 KB × live policy; exceeds a single `FEE_CAP`, which is why D18 scales the cap |
| `WRAP_MAX` (max wrap bytes per payment-funded transaction) | 1,000,000 B | ≈ 9,000 wraps; below the observed broadcaster limit of 100 MB (GorillaPool). Other broadcasters UNVERIFIED |
| `TOPUP_WINDOW` (issuer auto-top-up rate limit) | 24 h | Business parameter |
| `FORK_WATCH` *(new v0.4, D14)* | 2 blocks | How long a transfer recipient watches for forks |
| `MERGE_JITTER` *(new v0.10, F37)* | 15 s | Randomized delay before publishing an `MG`, to keep duplicates rare |
| `MERGE_REKEY_DEADLINE` *(new v0.11, F55)* | 2 blocks | After an accepted `MG` with no child rotation, any holder performs the post-merge re-key |
| `BEACON_PERIOD` *(new v0.7, F40)* | 1 h | How often the issuer publishes a `B` record |
| `BEACON_MAX_AGE` *(new v0.7, F40)* | 6 h | Age beyond which a client treats the newest beacon as stale |
| `HEAD_TTL` *(new v0.8, F51)* | 60 s | Maximum age of a cached epoch-head view before a refresh. *(v0.9, D24)* Evaluated lazily, when a write or transfer is about to be built; an idle client does not poll |
| `STREAM_MAX_SILENCE` *(new v0.8, F51)* | 120 s | Silence after which a rotation subscription counts as down. *(v0.9, F54)* Tracked per endpoint |

### 3.10 Issuer stamp *(new v0.3, F35, D11)*
A **stamp** is an ECDSA signature by the issuer mint key (§4.2) over:

```
SHA-256( "nftgate-stamp" ‖ n_C ‖ recordType ‖ prevouts ‖ bound )
```

- `prevouts` is the transaction's input outpoints (txid ‖ vout, 36 bytes each), serialized in input order.
- `bound` depends on the record type:
  - `M`: output 0's script ‖ output 0's value ‖ output 1's script ‖ output 1's value ‖ SHA-256(payload without the stamp) *(values added v0.4, F46)*
  - `IW2`: SHA-256(payload without the stamp)

Outpoints can be spent only once, so a stamp cannot be reused in any other transaction. The stamp commits to prevouts, which are fixed before the outputs are finalized, so it does not depend on the transaction's own ID. The exact byte format and test vectors are open (§8 Q14).

### 3.11 Issuer record transaction *(new v0.3, F36)*
The layout for issuer-originated records other than mints:

```
inputs:
  [0..]  issuer funding outputs (none of them 1-satoshi)
outputs:
  [0]    Data output (type G or IW2)
  [1..]  change
```

`G` is authenticated by the configured collection ID; `IW2` by its stamp.

---

## 4. Lifecycle

### 4.1 Purchase and mint

```
Buyer                    Issuer                   Chain
  |-- fiat payment ------>|
  |-- owner public key -->|
  |                       |-- mint tx ------------>|
  |                       |   [0] License Token (contract-locked to buyer owner key)
  |                       |   [1] Fuel(C)
  |                       |   [2] Data: type M, wrap k(e) -> buyer
  |<-- mint txid + BEEF --|
```

**Trust note (v0.2, F32).** The buyer pays in fiat before the mint and relies on the issuer to mint. The protocol does not protect this step (§5).

**Requirements:**

- **R4.1.1** *(amended v0.2, F3; amended v0.3, F35)* The mint transaction MUST create the License Token at output 0, `Fuel(C)` at output 1, and a type-`M` Data output at output 2, atomically. A license without fuel is unusable; fuel without a license is a giveaway. The mint's inputs MUST NOT include any 1-satoshi output, so that output 0 is a new BRC-159 origin. *(v0.4, F46)* Every issuer input in a mint or issuer record transaction MUST be signed with SIGHASH_ALL|FORKID.
- **R4.1.2** *(amended v0.2, F30)* The Fuel Tank MUST be a single output. Fan-out is removed: the License Token already serializes writes, and FB-1 requires all fuel created by one transaction to be spent together.
- **R4.1.3** Total seeded fuel SHOULD cover the expected lifetime write volume of one user with generous headroom. At prevailing fee policy this is a trivial amount; size it so that running dry is an exceptional event, not a routine one.
- **R4.1.4** *(amended v0.2, F11)* The mint MUST lock the License Token to an owner key the buyer derived under R4.2.5, so the license can be rediscovered from the seed (§4.7). The client SHOULD also persist the origin locally.
- **R4.1.5** *(new v0.2, F17)* The issuer MUST partition its funding UTXOs so that concurrent mint and top-up jobs never select the same UTXO.
- **R4.1.6** *(new v0.2, D9; amended v0.3, F35; amended v0.12, F39)* The mint's Data output MUST declare the buyer's wrap public key, include a wrap of the collection's current `k(e)` to that key, and carry a stamp (§3.10). To do this, the issuer MUST hold every epoch key (see R4.2.3).
- **R4.1.7** *(reserved; not assigned)*
- **R4.1.9** *(new v0.7, F40)* The issuer MUST publish a type-`B` beacon at least every `BEACON_PERIOD`, and MUST publish one as soon as it observes a new rotation. A beacon carries no authority: it lets clients detect that they are behind, and can only make a client wait (R4.6.8).
- **R4.1.10** *(new v0.7, F45)* The issuer MUST publish a type-`V` release record for every client release, no later than the moment that release is served, carrying the build hash of the deployed artifact.
- **R4.1.8** *(new v0.3, F38)* If a rotation's wraps omit a holder whose mint the rotator could not yet see, the issuer MUST publish an `IW2` record wrapping that rotation's key to the holder. The issuer learns of every rotation through its own wrap (R4.2.3).

**Open question for review:** should the issuer retain any ability to mint a replacement license if a user loses their key? See §8.

### 4.2 Key derivation *(rewritten v0.2, F15, F29, D3)*

Derived keys use BRC-42 with BRC-43 invoice numbers and counterparty `self`. No other party is a derivation counterparty, so no other party can compute or link a holder's derived keys.

| Key | BRC-43 protocol ID (security level 2) | Key ID | Used for |
|-----|--------------------------------------|--------|----------|
| Owner key *i* | `nftgate owner` | `o/<i>` (decimal i ≥ 0) | Owner field of a License Token; signing token spends |
| Wrap key *i* *(new v0.12, F39; P-256 v0.13, D29)* | `nftgate wrap` | `w/<i>` | Receiving and decrypting wraps. **P-256**, derived from the seed by the scheme pinned in §8 Q14, not by BRC-42 |
| Issuer reader key *(P-256 v0.13, D29)* | `nftgate reader` | `<n_C hex>` *(amended v0.3, F44)* | Receiving wraps (issuer only). **P-256**, derived from the issuer seed as for wrap keys; held under §4.9 |
| Issuer mint key *(new v0.3, D11)* | `nftgate mint` | `<n_C hex>` | Signing stamps (issuer only) |
| Epoch key `k(e)` | — (random, not derived) | — | Encrypting and decrypting Write Record payloads |
| Fuel | — (no key; §3.7) | — | — |

**Requirements:**

- **R4.2.1** *(amended v0.2, F11, F29)* Derivation MUST be deterministic from (holder root key, BRC-43 invoice number) with counterparty `self`, so a holder can recover all owner keys from their seed alone.
- **R4.2.2** *(amended v0.2, F4, D2)* The top-up destination for a license MUST be the `TopUp(C, ownerPub)` script, where `ownerPub` is the owner key currently in the License Token's script. `ownerPub` is public on chain, so any party can compute the destination from the license's current token output, which it finds by lookup. The destination changes when the license is transferred.
- **R4.2.3** *(amended v0.2, F14, D4, D9)* Epoch keys MUST change only through Rotation Records (§3.6) anchored on chain. Every rotation MUST include a wrap to the issuer reader key. The current epoch is the newest rotation in the verified record set, subject to R4.2.7.
- **R4.2.4** *(new v0.2, F29)* Implementations MUST NOT use the issuer, or any party other than `self`, as a BRC-42 counterparty for owner, reader, or wrap keys.
- **R4.2.5** *(new v0.2, F11; amended v0.12, F39)* Key indices MUST be allocated sequentially, one fresh index per license acquired (by mint, purchase, or gift), and each index MUST be used for the paired keys `o/<i>` and `w/<i>`. A client MUST NOT leave more than `GAP` consecutive unused indices.
- **R4.2.6** *(new v0.2, F15)* The canonical origin string MUST be the lowercase 64-hex txid, `_`, and the decimal output index with no leading zeros. Parsers MUST also accept the `txid.vout` form and normalize it.
- **R4.2.7** *(new v0.2, F21, D4; rewritten v0.10, F37, D25)* If a client observes two or more valid rotations with the same parent commitment (a fork), it MUST treat the collection as needing a **merge**, and:
  - derive `k_merge` from every branch key per §3.4, publishing **no wraps**;
  - publish an `MG` record (§3.8) if no valid `MG` with that commitment is already visible, after a randomized delay of up to `MERGE_JITTER`;
  - treat two `MG` records carrying the same merged commitment as duplicates, not a new fork;
  - not encrypt new records under any branch key once the fork is known.
  - *(v0.4, D14)* A transfer recipient's client MUST watch for forks involving its own `TR` for `FORK_WATCH` blocks and MUST merge if it finds one. Otherwise the first holder that needs to write after observing the fork MUST merge.
  - *(v0.5, D17)* An `MG` is paid from fuel within `FEE_CAP`. Because it carries no wraps, it is a fixed-size record and needs no `R+` continuations. *(v0.11, F55)* An `MG` is never the end state: R4.2.12 requires a post-merge re-key.
- **R4.2.12** *(new v0.11, F55, D26)* An `MG` MUST be followed by a **post-merge re-key**: an ordinary exclusion rotation (`R`), parented on the merged epoch, whose key is randomly generated and wrapped to the holders the rotator can verify.
  - The client that published the `MG` MUST publish the re-key as soon as its `MG` is `accepted`.
  - Any holder that sees an accepted `MG` with no child rotation after `MERGE_REKEY_DEADLINE` MUST perform the re-key, subject to `MERGE_JITTER` and the no-duplicate rule of R4.2.7.
  - Concurrent re-keys are an ordinary fork, resolved by R4.2.7. Their inputs are keys no departed seller holds, so the resulting merge excludes departed sellers too, and the process terminates.
  - Writes MAY continue under the merged key while the re-key is pending; the residual exposure is stated in NG1.

  Rationale: the merged key is derived from exactly the branch keys, so the two sellers of a fork hold its inputs between them (F55). By re-key time both transfers are visible, so R4.4.11's verified holder set excludes both.
- **R4.2.11** *(new v0.10, F37)* A client that lacks any branch key MUST NOT attempt the merge. It MUST show "access pending" and first obtain the missing branch key through `W2` or `IW2` (R4.4.10).
- **R4.2.13** *(new v0.12, F39, D27)* Wraps MUST be encrypted to the **wrap key** declared in the holder's most recent valid `M` or `TR` record. Token spends MUST be signed with the **owner key**. Neither key may be used for the other purpose.
- **R4.2.14** *(new v0.13, F41, D29)* Wrap keys and the issuer reader key MUST be **P-256** keys, and MUST be derived deterministically from the party's seed, so that seed-only recovery (§4.7) still holds. Token-spending keys (owner keys) and the issuer mint key remain **secp256k1** under BRC-42, because miners verify those signatures. A key MUST NOT be used outside its declared role or curve; a wrap addressed to a secp256k1 key is malformed.
  - Declaring the wrap key in a record rather than the License script keeps the two independent at no per-write cost: the record is authorised by the token spend that carries it, so the owner vouches for the key, and the holder-set lookup rotators already perform returns it.
  - A leaked wrap key grants read access only; it cannot spend the token or its fuel.
- **R4.2.8** *(new v0.2, F2)* Epoch keys MUST be generated from a cryptographically secure random source. They MUST be transmitted only inside wraps.
- **R4.2.9** *(new v0.3, F44)* No key or script parameter published inside a transaction may be derived from that transaction's own ID. Collection-scoped issuer keys MUST use `n_C`.
- **R4.2.10** *(new v0.3, F35, D11)* The issuer mint key MUST NOT lock or control any funding output. It SHOULD be held in hardware or offline custody.

### 4.3 Write

A Write Record transaction:

```
inputs:
  [0]      License Token UTXO            (owner signature, SIGHASH_ALL flag)
  [1]      the Fuel(C) created by the previous license tx   (spend, SINGLE)
  -- when merging (v0.4): [1..m] Fuel(C) + TopUp(C, ownerPub) (consolidate/merge, ALL)
outputs (exactly these three; v0.5, R4.3.15):
  [0]      License Token, recreated      (same script)
  [1]      Fuel(C)                       (>= own value - FEE_CAP; or >= sum(manifest) - FEE_CAP when merging)
  [2]      Data output                   (zero value; type W: epoch commitment, manifest (empty unless merging), ciphertext)
```

Rotation (`R`, `R+`) and re-wrap (`W2`) transactions use the same layout.

**Requirements:**

- **R4.3.1** *(amended v0.2, F20)* The transaction MUST spend and recreate the License Token in the same transaction, satisfying License contract rules (a)–(f) of §3.7. This is the authorization mechanism (C3, as interpreted in §2).
- **R4.3.2** *(amended v0.2, F5; v0.4, D12)* The contract MUST enforce that output 0 reproduces its own script with the collection ID unchanged, and that the owner key changes only in type-`TR` transactions. It cannot prevent look-alike outputs from being created elsewhere; genuineness is enforced by R4.6.2.
- **R4.3.3** *(amended v0.2, F1, D3, D7)* The data payload MUST be encrypted, before broadcast, under the newest epoch key the writer holds whose rotation excluded every departed seller known to the writer. That rotation must have reached at least *accepted* status (R4.3.6). If no such key exists, the writer MUST first perform the exclusion rotation, or queue the write (R4.3.13) until one exists.
- **R4.3.4** *(amended v0.2, F33)* The Data output MUST carry the fields listed in §3.8, in order. It MUST NOT carry the license origin in plaintext. The indexer matches records by protocol identifier and by the token lineage it tracks.
- **R4.3.5** *(amended v0.2, F16; amended v0.8, F51)* The client MUST track the recreated token outpoint and fuel outpoint locally. It MUST chain subsequent writes from them, up to `D_MAX` unconfirmed transactions after the last *proven* one, without any **per-write** lookup. Epoch-head freshness is maintained separately (R4.6.7, R4.6.9), at most once per `HEAD_TTL` across a burst.
- **R4.3.6** *(amended v0.2, F31)* Broadcast goes to ARC. The client MUST track each transaction through these UI states:
  - **`pending`**: built and signed locally. Shown optimistically (C5).
  - **`accepted`**: the broadcaster reports `SEEN_ON_NETWORK`, and either that broadcaster is confirmed to run rejection detection (ZMQ), or two independent broadcasters report it.
  - **`proven`**: `MINED`, with a Merkle path the client has verified against block headers.
  - **`failed`**: `REJECTED`; or `DOUBLE_SPEND_ATTEMPTED` where the competing transaction is not the client's own; or `MINED_IN_STALE_BLOCK` without being re-mined.

  A `SEEN_ON_NETWORK` report MUST NOT be treated as final.

**Failure handling:**

- **R4.3.7** If broadcast fails, the client MUST NOT advance its local token outpoint. Retry from the last known-good state.
- **R4.3.8** *(amended v0.2, F9, D5)* If the local token outpoint is stale (e.g. the license was used on another device), the client MUST:
  1. re-query the Indexer for the current token location;
  2. verify its lineage (R4.6.5);
  3. replay every one of its own records that has not reached `accepted`, on top of the current tip, as new transactions with the same plaintext.
- **R4.3.9** *(new v0.2, F8)* If any transaction in the local chain reaches `failed`, the client MUST:
  1. mark it and every local descendant `failed-pending-replay`;
  2. reset its local tip to the last non-failed ancestor;
  3. rebuild and broadcast the affected records in their original order.
- **R4.3.10** *(new v0.2, F8)* On `DOUBLE_SPEND_ATTEMPTED`, the client MUST NOT replay until one competing transaction is `MINED`. It then applies R4.3.9 if the mined transaction is not its own.
- **R4.3.11** *(new v0.2, F16)* When `D_MAX` unconfirmed transactions are outstanding, further writes MUST be queued (R4.3.13) until the oldest becomes `proven`.
- **R4.3.12** *(new v0.2, F3, D1; amended v0.4, D16)* Every license transaction MUST spend every unspent `Fuel(C)` output created by the previous license transaction, and MUST leave exactly one `Fuel(C)` at output 1. Any fuel it omits becomes permanently unspendable. A transaction with any TopUp input, or more than one fuel input, MUST use `consolidate`/`merge`.
- **R4.3.13** *(new v0.2, F27, D7)*
  - While offline, or while blocked by R4.3.3 or R4.3.11, the client MUST store each write as a locally signed plaintext intent, not as a built transaction, and show it as `queued`.
  - When unblocked, it MUST verify the current tip and epoch, then build and broadcast queued intents in order.
  - A record MAY include a client timestamp, which MUST be labeled self-reported wherever it is displayed.
- **R4.3.15** *(new v0.5, F47, D17)* A non-`TR` license transaction MUST have exactly three outputs (§4.3). Any fee beyond the fuel slack MUST come from extra inputs, whose excess is also fee. No output may pay fuel value to any party.
- **R4.3.14** *(new v0.2, F3, D1; amended v0.4, D16; amended v0.6, F49, D18)* When a transaction uses `consolidate`/`merge`, its Data output MUST carry a value manifest covering every restricted input, as defined in §3.7 VC-B. Output 1 MUST hold at least Σ(manifest values) − `FEE_CAP` × n. Otherwise the manifest is empty and the single-input cap applies.

### 4.4 Transfer (resale)

```
inputs:
  [0]      License Token                    (seller owner-key signature)
  [1..m]   all Fuel(C) + any TopUp(C, sellerOwnerPub)
  [m+1..]  buyer payment inputs             (sale only)
outputs:
  [0]      License Token -> buyer owner key
  [1]      Fuel(C)
  [2]      Data: type TR (wrap k(e) -> recipient, departure marker, rotation to k(e+1), manifest)
  [3..]    payment to seller, buyer change  (sale only)
```

**Requirements:**

- **R4.4.1** *(amended v0.2, F10)* Transfer is a token transfer in the layout above: the current holder spends the License Token to a contract output locked to the buyer's owner key. No issuer involvement (C4).
- **R4.4.2** *(amended v0.2, SHOULD → MUST, F25, D1, D2)* The transfer MUST carry every `Fuel(C)` output and every `TopUp(C, sellerOwnerPub)` output known to the seller, so access transfers complete rather than partial.
- **R4.4.3** *(amended v0.2, F7, F21, D3)*
  - After any transfer, the collection MUST undergo an exclusion rotation that omits the departed seller before any holder encrypts new records under a key the seller holds.
  - *(v0.4, D12)* The exclusion rotation MUST be carried in the transfer transaction's `TR` record, built by the recipient's client. The recipient learns `k(e)` from the wrap before signing (R4.4.12).
  - If the wraps do not fit (§3.6), the recipient MUST publish `R+` continuations chained from its new token immediately after the transfer.
  - A separate post-transfer rotation happens only on the fork-merge path (R4.2.7).
  - Existing records are not re-encrypted.
- **R4.4.4** *(amended v0.2, F21)* The new holder MUST be able to read every epoch up to and including the current one, using the backward links (§3.4).
- **R4.4.5** *(new v0.2, F10)* The seller's client MUST NOT build a transfer while any of its own transactions is `pending`. It MUST build from its current tip, and MUST either drain its queued intents or discard them with the user's explicit confirmation.
- **R4.4.6** *(new v0.2, F10, D8)* A sale MUST settle atomically: the buyer's payment inputs and the seller's token input are in the same transfer transaction. The application MUST NOT offer a fiat resale flow. Transfers without payment (gifts, moving to one's own new owner key) remain valid.
- **R4.4.7** *(new v0.2, F10)* Before accepting any transfer, the receiving client MUST verify the token's lineage (R4.6.5) and the output 1 fuel value.
- **R4.4.8** *(new v0.2, F14; amended v0.4)* The type-`TR` Data output MUST mark the previous owner's key as departed. Clients MUST use this marker to decide which rotations are required.
- **R4.4.9** *(new v0.2, D3; amended v0.12, F39)* The transfer MUST declare the recipient's wrap public key and include a wrap of the current `k(e)` to that key.
- **R4.4.10** *(new v0.2, F21)*
  - A holder whose declared wrap key received no wrap in a rotation it can see, or that receives a wrap addressed to a superseded wrap key, MUST show an "access pending" state *(v0.12, F39)*.
  - It MUST verify any wrap it receives against the rotation's `c(e+1)`, and MUST reject a mismatch.
  - Any holder MAY supply a missing wrap in a type-`W2` record; the issuer MAY do so in a type-`IW2` record *(amended v0.3, F36)*.
- **R4.4.11** *(new v0.2, F5; amended v0.7, F40)* A rotator MUST wrap `k(e+1)` only to the declared wrap keys *(v0.12, F39)* of License Tokens whose lineage it has verified (R4.6.5), plus the issuer reader key. It MUST omit any token it cannot verify. It MUST build the holder set from the union of both endpoints (R4.6.6), and MUST record in the rotation payload which endpoints it used, so that an omission is attributable afterwards.
- **R4.4.12** *(new v0.2, D8)* A sale MUST follow this swap sequence:
  1. The buyer's client sends a fresh owner public key and the paired wrap public key *(v0.12, F39)*.
  2. The seller's client builds the transfer, including the payment output to the seller.
  3. **Before adding and signing its payment inputs**, the buyer's client MUST verify:
     - the token's lineage
     - the output 1 fuel value
     - that the type-`TR` wrap, addressed to its declared wrap key, decrypts to a key matching the current `c(e)`
  4. *(v0.4, D12)* The buyer's client builds the `TR` rotation payload and adds it with its payment inputs. The buyer's inputs pay the rotation fee, up to `WRAP_MAX` of wraps.
  5. The buyer signs, then the seller signs last (SIGHASH_ALL), and the transaction is broadcast.

  If any check fails, the buyer's client MUST refuse to sign.
- **R4.4.13** *(new v0.4, D13)* A transfer without payment (a gift) MUST follow the R4.4.12 sequence without payment inputs.
  - The recipient's client builds the `TR` payload.
  - The fee is paid from fuel, within `FEE_CAP`.
  - Wraps that do not fit go into `R+` continuations, each within `FEE_CAP`.
  - Until the recipient's client has returned its payload and the transfer is broadcast, the card remains the giver's.

### 4.5 Top-up

**Requirements:**

- **R4.5.1** *(amended v0.2, F3, D2)* Any party MAY create a `TopUp(C, ownerPub)` output for a license. No permission required. It can be spent only by merging it into that license's `Fuel(C)` under the current owner key's signature (§3.7); it MUST NOT be withdrawable, subject to NG8's bounded transfer exception.
- **R4.5.2** *(amended v0.6, F48)* The client SHOULD surface remaining fuel and warn before exhaustion. The warning threshold MUST be at least `FEE_W` + `FEE_CONS`, so that a holder is warned while enough fuel remains to merge a TopUp.
- **R4.5.3** *(amended v0.2, F3)* The issuer SHOULD run an automated top-up for licenses below a threshold, if the business model subsidizes fees. *(amended v0.5, F47, D17)* Any such top-up MUST replace at most the **expected** fee of the valid Write Records observed since the previous top-up, where expected fee = the reference write size (§3.9) × the policy rate at the time. It MUST NOT be based on fuel consumed or on actual fees paid, since a holder controls both. It MUST be rate-limited to at most one per license per `TOPUP_WINDOW`.
- **R4.5.4** *(amended v0.2, F19, F30; amended v0.6, F49)* A top-up MUST be a single output of at least `V_MIN` satoshis (25,000), which keeps the consolidation fee at roughly a tenth of the top-up.
- **R4.5.7** *(new v0.6, F48)* When fuel falls below `FEE_W`, the client MUST show that writes are paused and offer the top-up path:
  - any wallet, including the holder's own, creates a `TopUp(C, ownerPub)` output of at least `V_MIN`;
  - that transaction is an ordinary transaction, not a license transaction, so it may carry change;
  - once it is `proven`, the client merges it (R4.5.5), and the merge pays its own fee from the merged value.

  A license transaction has no change output (R4.3.15), so this is the only way a holder can fund their own license from their own coins.
- **R4.5.5** *(new v0.2, F18)* The client MUST discover pending TopUps by a lookup keyed on its `TopUp(C, ownerPub)` script hash, outside the write hot path. It MUST merge only TopUps that are `proven`, in its next license transaction.
- **R4.5.6** *(new v0.2, F19)* The client MUST NOT merge any output below `V_MIN`, and MUST NOT merge any 1-satoshi output.

### 4.6 Read

**Requirements:**

- **R4.6.1** *(amended v0.2, F23)* Reads MUST query an Indexer by protocol identifier, not the chain directly. On failure, the client MUST fail over to a second, independent indexer endpoint.
- **R4.6.2** *(amended v0.2, F5, F24; restructured v0.3, F35, F36)* Validity depends on record type.
  - **Genesis (`G`)** is valid if and only if its transaction ID equals the collection ID pinned in client configuration.
  - **Mint (`M`)** is valid if and only if all of the following hold:
    - (m1) its outputs match R4.1.1;
    - (m2) none of its inputs is a 1-satoshi output, so output 0 is a new BRC-159 origin;
    - (m3) its stamp verifies under the `G` record's mint public key, computed over this transaction's actual prevouts and outputs (§3.10);
    - (m4) its transaction is `proven`, or `accepted` and not conflicted.
  - **Issuer re-wrap (`IW2`), beacon (`B`) and release record (`V`)** are valid if and only if their outputs match §3.11, their stamps verify, and (m4) holds. A `B` or `V` record confers no authority over application data; a `B` record only signals freshness (R4.6.8), and a `V` record only records a release (R4.8).
  - **Issuer key record (`K`)** *(new v0.13, F41)* is valid if and only if its outputs match §3.11, its stamp verifies under the `G` record's **mint** key, its sequence number exceeds every earlier valid `K`, and (m4) holds. Rotators MUST wrap to the reader key of the newest valid `K`, or to the `G` record's reader key if no valid `K` exists. Because a `K` record is stamped by the mint key, a compromised *reader* key cannot redirect future wraps to itself.
  - **Merge (`MG`)** *(new v0.10, F37)* is valid under the holder-record rules below, and additionally: its merged commitment MUST equal the §3.4 derivation over the branch commitments it names. A client holding the branch keys MUST verify this and MUST reject a mismatch; a client lacking them treats the record as pending (R4.2.11).
  - **Holder records (`W`, `T`, `R`, `R+`, `W2`, `MG`)** are valid if and only if all of the following hold:
    - (a) the transaction spends, at input 0, a 1-satoshi output whose BRC-159 lineage reaches output 0 of a mint that is valid under the Mint rule;
    - (b) sat ordering maps the token satoshi 1→1 on every hop of that lineage;
    - (c) its outputs match the layout for its record type (§3.7, §3.8);
    - (d) its transaction is `proven`, or `accepted` and not conflicted;
    - (e) its epoch commitment is known to the reader, or is pending under R4.4.10.

  The Indexer MUST exclude invalid records. Invalid records are not application data regardless of payload.
- **R4.6.3** *(amended v0.2, D9)* Decryption happens client-side with epoch keys obtained from wraps. The Indexer MUST NOT hold epoch keys. An issuer-operated indexer does not change this: the issuer reader key is held by the issuer service, not the indexer.
- **R4.6.4** The client SHOULD cache decrypted records locally for offline use (PWA requirement, C1).
- **R4.6.5** *(new v0.2, F6)* Before counting a record in any result, the client MUST verify the record's BEEF (BRC-62) and the tip-to-origin lineage of the token it spends (R4.6.2 a–b).
  - It MAY extend a previously verified lineage by one hop instead of re-walking it.
  - Unverified records MUST be excluded from rankings and aggregates. If displayed, they MUST be labeled unverified.
- **R4.6.6** *(new v0.2, F6, F23; amended v0.7, F40)* The client MUST be configured with at least two indexer endpoints that are **independent in operation**: run by different operators, on different upstream data sources. Two front doors onto one feed (for example two deployments backed by the same chain-data subscription) do not satisfy this. It SHOULD compare per-license record counts between them and show discrepancies. Before a rotation, it MUST compare the current holder sets from both endpoints, and wrap to the union of the holders it can verify (R4.4.11).
- **R4.6.7** *(new v0.7, F40; amended v0.8, F51, D23)* The client MUST maintain a current **view** of the collection's epoch head — the newest rotation commitment — rather than querying before each write. A refresh is a comparison of the head across both endpoints (R4.6.6).
  - *(v0.9, D24)* The age of the cached view MUST be evaluated when a write or transfer is about to be built, not on a timer. If it is older than `HEAD_TTL` at that moment, the client MUST refresh before encrypting; otherwise it writes from the cached view. An idle client MUST NOT poll.
  - The client MUST also refresh when: the app starts; a new local chain begins after a *proven* tip; a queued batch resumes; a rollback occurs (R4.3.9); or a rotation event arrives (R4.6.9).
  - Before building a transfer, the client MUST refresh unconditionally.
  - Between refreshes it MAY write from the cached view.
  - If the endpoints differ, the client MUST adopt the newer rotation once it has verified it, or queue the write if it cannot establish which is newer.
- **R4.6.9** *(new v0.8, F51, D23; amended v0.9, F54)* The client SHOULD subscribe to a rotation event stream at every endpoint that offers one, and MUST subscribe at no fewer than two where two are available, so that suppressing an event requires both operators rather than one.
  - A rotation event on **either** stream MUST trigger an immediate refresh.
  - `STREAM_MAX_SILENCE` MUST be tracked per endpoint. Losing one stream MUST set the degraded-witness state (R4.6.8); losing all streams falls back to lazy `HEAD_TTL` refreshes (R4.6.7).
- **R4.6.10** *(new v0.8, F52)* The client MUST record the highest `B` beacon sequence number it has seen. A gap in that sequence, or a beacon whose sequence is lower than the highest seen, MUST set the degraded-witness state (R4.6.8).
- **R4.6.8** *(new v0.7, F40; amended D22; amended v0.8, F51)* The client MUST treat both endpoints and the newest valid `B` beacon as three witnesses to the epoch head, evaluated at each refresh (R4.6.7) rather than per write. Anything that invalidates the cached view — a stale beacon, an endpoint becoming unreachable, or a rotation event — MUST force a refresh before the next write. The client MUST queue the write (R4.3.13) when any of the following holds:
  - a witness names an epoch commitment the client does not hold;
  - the witnesses disagree;
  - the newest valid beacon is older than `BEACON_MAX_AGE` **and** fewer than two independent endpoints are reachable and agreeing.

  A stale beacon alone, with two reachable endpoints that agree, MUST NOT pause writes. While a write is queued for this reason, the UI MUST say that the epoch key may have changed and that writing now could be readable by a departed holder. The user MAY override for a single write, and the override MUST NOT be remembered. The client SHOULD surface a degraded-witness state.

### 4.7 Recovery *(new v0.2, F11)*

**Requirements:**

- **R4.7.1** A seed-only restore MUST:
  1. derive owner keys `o/0 … o/(n+GAP)` and their paired wrap keys `w/0 … w/(n+GAP)` *(v0.12, F39)*, where `n` is the highest index found in use;
  2. query License Tokens by owner public key;
  3. verify the lineage of each token found.
- **R4.7.2** *(amended v0.12, F39)* A restore MUST recover epoch keys by decrypting the on-chain wraps addressed to the recovered wrap keys, then following backward links. The issuer restores the same way, using its reader key reconstructed from its offline seed backup (R4.9.2).
- **R4.7.3** Queued intents (R4.3.13) exist only on the device. While any exist, the client MUST show a warning that they are not yet backed up.

### 4.8 Client delivery *(new v0.7, F45, F50)*

**Requirements:**

- **R4.8.1** Every subresource MUST be loaded with Subresource Integrity, under a strict Content Security Policy.
- **R4.8.2** The collection ID MUST be part of the build covered by the published build hash. It MUST NOT be fetched at runtime.
- **R4.8.3** The published build hash MUST be reproducible from published sources, and MUST match the newest type-`V` record, so that the release history is auditable on chain.
- **R4.8.4** Verification of a running client against `V` records MUST be performed outside that client — by a verifier extension, an independent monitor, or the user. A compromised build can claim anything about itself, so the spec MUST NOT claim self-verification.
- **R4.8.5** *(F50)* The client MUST be served from an origin dedicated to it. Browser storage is scoped to an origin, not a path, so a shared multi-application origin (for example a static-hosting account origin under which several projects are published) MUST NOT be used: owner keys, epoch keys and the write queue live in origin-scoped storage and would be reachable by every other application on that origin. A dedicated subdomain is sufficient; the parent domain MAY serve something else. Application data MUST NOT be placed in cookies scoped to the parent domain.
- **R4.8.6** *(F50)* The release pipeline MUST:
  - pin every CI action to a commit hash, with least-privilege permissions;
  - produce a signed build provenance attestation for the deployed artifact;
  - protect the deployment branch against force-push, and require review;
  - build reproducibly from a tagged commit.

### 4.9 Issuer key custody *(new v0.13, F41, D28)*

The issuer reader key receives a wrap of every epoch key (D9), and each epoch carries a backward link to its predecessor (§3.4), so holding any current epoch key yields all history. The key cannot be offline (R4.1.6 needs it on every mint), and losing it is as damaging as leaking it: without it the issuer cannot complete a mint at all.

**Requirements:**

- **R4.9.1** The issuer reader key and the issuer mint key MUST be held in a hardware security module or a secure enclave, and MUST NOT be extractable by the minting service. The service requests *unwrap-and-re-wrap* (reader key) and *stamp* (mint key) as operations of the module. This does not stop a compromised service from requesting those operations; it bounds the loss to the window in which the attacker holds service access, rather than all history, and it survives host compromise and backup theft.
- **R4.9.2** The issuer seed MUST be backed up offline, in a form from which the reader key and mint key can be reconstructed (R4.2.14, R4.7.2). Availability of the reader key is a business-continuity concern, not only a confidentiality one.
- **R4.9.3** On suspected compromise of the reader key, the issuer MUST publish a type-`K` record declaring a new reader public key, and an epoch rotation MUST follow immediately. Records written before the compromise remain readable with the old key (NG9).
- **R4.9.4** If the custody module is unavailable, the issuer MUST pause minting rather than issue a license whose buyer cannot read the collection. It MAY instead arrange a holder-sponsored wrap (the D9 option-B path).

---

## 5. Component inventory *(trust levels revised v0.2)*

| Component | Responsibility | Trust level |
|-----------|---------------|-------------|
| PWA client | Key derivation, signing, encryption, lineage and BEEF verification, local cache and queue | Holds user secrets. Trusted by its own user only |
| License / Fuel / TopUp contracts | Spend-and-recreate, sat alignment, fuel binding, value conservation | Trustless, on-chain. **Does not establish that a token is genuine** (NG7) |
| ARC broadcaster | Transaction submission, status callbacks | Availability only. Status is advisory until `proven`. Cannot forge |
| Indexer / overlay | Query serving, lineage tracking, validity filtering, holder-set and TopUp lookups, rotation event streams | Availability and completeness. Cannot make a verifying client accept a forged record. Can withhold records or holders; detectable only by cross-checking (R4.6.6) and by the beacon (R4.6.8). Suppressing a rotation event is caught by the other endpoint's stream or by the next lazy refresh (R4.6.9, R4.6.7). Distinct from the broadcaster and from a general block explorer, which cannot evaluate this spec's validity rules |
| Client delivery channel *(new v0.7, F45, F50)* | Serving the client's code and configuration: the hosting platform, the CI system, whoever can push to the deployment branch, and every action or dependency in the build | **Full control over every user who loads the client.** Can substitute the collection, skip verification, or exfiltrate keys. Mitigations (R4.8.1–R4.8.6) make tampering detectable and attributable; they do not prevent it. See NG10 |
| Issuer service | Collection genesis, minting, top-ups | Controls issuance, not writes or transfers. **Standing reader of all epochs** (D9, NG9). Trusted by primary buyers to mint after fiat payment (F32). No revocation authority (D6). Holds the mint key: compromise of that key allows forged licenses (v0.3, R4.2.10). *(v0.13, F41)* Reader and mint keys live in a hardware module or enclave the service cannot extract from (R4.9.1); a breach of the service exposes what was unwrapped during the breach window, not all history |
| Rotating holder | Performs exclusion and merge rotations | Can withhold or corrupt wraps; corruption is detectable (R4.4.10). Cannot read data encrypted after its own exclusion |
| Resale counterparty | Seller in an atomic swap | Untrusted. Atomic settlement makes cheating impossible to profit from (R4.4.6, R4.4.12) |

Note the trust envelope: no component can write on a user's behalf, and no component can grant access it did not mint — as seen by clients that verify lineage (R4.6.5). The issuer's read access is intentional and stated.

---

## 6. Cost and performance model

Fill in current values at implementation time; the shape is what matters.

| Item | Basis | Notes |
|------|-------|-------|
| Miner fee per write | Fee rate × tx size | Dominated by fee policy, not payload. Verify current ARC policy. |
| Covenant input overhead *(v0.2; measured v0.4; restated v0.15)* | Push TX token input + fuel input per write | ≈ 13.0 KB of the ≈ 13.3 KB write — 12,998 B of 13,341 B, §3.7's License and Fuel `spend` rows (`SIZES.md`); the remaining 343 B is the Data output and transaction overhead (§3.7). Each covenant input costs about twice its script size, because the preimage carries the scriptCode. |
| Write size and fee *(v0.4; remeasured v0.5; remeasured v0.14, F57)* | Measured parts + 200 B payload | 13,341 B ≈ 1,334 sat ≈ $0.22 per 1,000 writes (100 sat/kB, $16.18/BSV, 2026-09-17). The payload is counted twice (Data output and License unlocking script). |
| Consolidation *(v0.4)* | ALL-mode Fuel + TopUp + License | Estimate ≈ 16–20 KB; rare and rate-limited (R4.5.3). UNVERIFIED |
| Fuel per license at mint | ~~N outputs × unit size~~ one output *(v0.2, F30)* | Sized for expected lifetime writes |
| Rotation Record *(v0.2; v0.4)* | Number of holders × wrap size | ~110 B per wrap (estimate). Sales: paid by the buyer. Gifts: paid by fuel, ≈ 90 wraps per transaction under `FEE_CAP`. |
| Fork merge *(v0.10, F37)* | Fixed | No wraps: parent commitments plus one backward link per branch. Independent of holder count. |
| Key separation *(v0.12, F39)* | ≈ 33 B per transfer, nothing per write | The wrap key is declared in the `M` / `TR` record. The in-script alternative was measured at +970 B locking and +970 B unlocking (≈ +194 sat, +15% per write) and rejected. |
| Post-merge re-key *(v0.11, F55)* | Number of holders × wrap size | One ordinary rotation per fork — roughly a 50% surcharge on an event that already involved two rotation-bearing transfers. |
| Broadcast latency | ARC `SEEN_ON_NETWORK` | Target < 2s perceived |
| Proof latency | Next block | Asynchronous, non-blocking |
| Broadcaster fees | Provider tier | Primary recurring cost |
| Custody hardware *(v0.13, F41)* | One-off | An HSM or enclave for the issuer's reader and mint keys (R4.9.1); no per-write change. A managed KMS is possible now that wrap keys are P-256 (D29) |
| Indexer hosting | Self-hosted and third party | Second recurring cost; two operator-independent endpoints are required (R4.6.6). Self-hosting an overlay/indexer alongside a hosted one satisfies this |

**Key economic insight:** on-chain fees are negligible; the real costs are broadcaster access, indexer hosting, and subsidized fuel. Model those three, not the satoshis.

*(v0.4)* Measured: the covenant overhead makes on-chain fees about 20× a plain write. Fees are still small in absolute terms, but they now dominate per-write cost planning (C6 revised, D15).

---

## 7. Explicit non-goals and known limits

An agent reviewing this spec should verify these are acknowledged rather than accidentally "solved" with a weaker design.

- **NG1 — Limited backward secrecy on resale.** *(rewritten v0.2, F21; noted v0.10, F37; amended v0.11, F55)* A merged epoch key is derivable by exactly those parties holding every branch key. Individually, each departed seller of a fork is missing one branch key and cannot derive it — but the two sellers of a fork hold its inputs **between them**, so a colluding pair can. The post-merge re-key (R4.2.12) restores forward secrecy, because its key is random and is wrapped only to holders verified once both transfers are visible. **Residual:** records written between the merge and the re-key stay readable by such a pair; the window is bounded by `MERGE_REKEY_DEADLINE`. Closing it entirely would mean pausing writes after every fork.
  - A former holder keeps every epoch key up to the exclusion rotation that follows their sale, and anything they already decrypted.
  - Rotation protects data written afterward.
  - No server is required.
  - New holders can read all history through backward links.
- **NG2 — No DRM.** A determined holder can extract their own keys from their own device. The design proves *who purchased*; it does not prevent a purchaser from sharing what they see.
- **NG3 — No revocation or expiry.** *(reworded v0.2, F22, D6)*
  - Once minted, a license is the holder's property indefinitely.
  - Revocation or expiry *could* be enforced without a server, as a public validity rule. It is declined because it would give the issuer power over a transferable asset (the spirit of C4).
  - **Accepted risk:** a fraudulent or charged-back primary purchase cannot be cancelled.
- **NG4 — Public metadata.** Transaction graph, timing, and record counts are public even when payloads are encrypted. Do not assume anonymity. *(v0.2, F29, F33)* In addition:
  - The protocol identifier reveals collection membership.
  - Rotation Record wrap counts reveal the number of holders.
  - The mint transaction links a fiat purchase to the buyer's first owner key, and each transfer publishes both of the new holder's public keys *(v0.12, F39)*; both are already tied to that transfer, so the exposure is unchanged in kind.
  - Because derived keys use counterparty `self` (R4.2.4), the issuer cannot link a holder's other keys to one another.
- **NG5 — Indexer availability is a real dependency.** *(rewritten v0.2, F23)*
  - Writes need an indexer to recover a stale tip (R4.3.8), discover TopUps (R4.5.5), learn the holder set for rotations (R4.6.6), and restore from seed (R4.7.1).
  - Reads fail over to a second indexer (R4.6.1). This is safe because clients verify what they receive (R4.6.5).
- **NG6 — On-ramp is closed.** Users cannot easily buy the native asset on major exchanges. This is *why* the pre-funded fuel model exists; do not design a fallback that assumes users can top up themselves. *(v0.2, D8)* Consequences for resale:
  - The resale market is limited to people who already hold BSV.
  - Sellers are paid in BSV.
  - Off-protocol fiat deals cannot be prevented. They leave the buyer exposed to seller double-spends and are outside this spec.
- **NG7 — Genuineness is a validity rule, not a script rule.** *(new v0.2, F5, D10)* Anyone can put a copy of a license script on chain. Such copies are invalid under R4.6.2 but not rejected by miners.
- **NG8 — Fuel can be burned, and a transfer can skim once.** *(rewritten v0.5, F47, D17)*
  - The current holder can spend fuel on miner fees, up to `FEE_CAP` per transaction (2,000 sat).
  - In ordinary transactions the output list is fixed (R4.3.15), so slack can only become fee: no party can take fuel value.
  - In a `TR` transfer, outputs 3+ exist for payment and change, so up to `FEE_CAP` of slack may reach the seller or buyer — at most once per transfer.
  - Issuer auto-top-ups replace only expected fees and are rate-limited (R4.5.3), so neither burning nor the transfer skim is refilled.
- **NG11 — Freshness is time-boxed.** *(new v0.8, F51; amended v0.9, D24)* Between refreshes a client writes from a cached view of the epoch head. The window is measured from the last refresh before a burst, and a rotation landing inside it leaves the records that client wrote in the window readable by the holder the rotation excluded: at most `HEAD_TTL` of one client's records, or the stream latency for rotations that land mid-burst where a subscription is live. Closing the window entirely would require a lookup before every write, which contradicts offline-capable chained writes (R4.3.5).
- **NG10 — Browser delivery is not trustless.** *(new v0.7, F45, F50)* Whoever serves the client can compromise any user who loads it. Subresource integrity, a strict CSP, reproducible builds, build provenance attestations and on-chain `V` records narrow the window and leave evidence; they do not prevent it. A dedicated origin (R4.8.5) limits the blast radius to this application. Signed installable packaging would reduce this further and is an open question (§8 Q18), not a requirement.
- **NG9 — The issuer can read everything.** *(new v0.2, D9)* Application data is confidential against everyone except current holders, former holders (for data up to their exclusion), and the issuer. If the issuer reader key is compromised, every epoch up to the rotation that follows the `K` record (R4.9.3) is exposed; the key is rotatable going forward, but past records stay exposed to the compromised key. *(v0.13, F41)* *(v0.3)* If the issuer mint key is compromised, an attacker can mint licenses that verifying clients accept, and so gain read and write access; R4.2.10 reduces this exposure but does not remove it.

---

## 8. Open questions for review

1. **Key loss.** *(narrowed v0.2)* Seed-only restore is now defined (§4.7). If a user loses their seed, the license and its fuel are unrecoverable. Is a custodial or social-recovery option needed, and does it compromise C3/C4?
2. ~~**Multi-device.**~~ *Resolved v0.2 (D5):* detect-and-replay (R4.3.8–R4.3.10).
3. ~~**Epoch re-encryption cost.**~~ *Resolved v0.2 (F7, D3):* no re-encryption. Backward links provide history.
4. ~~**Indexer trust.**~~ *Resolved v0.2 (F6):* clients MUST verify every counted record (R4.6.5).
5. ~~**Fuel exhaustion UX.**~~ *Resolved v0.6 (F48):* R4.5.7 defines the paused state and the top-up path, and R4.5.2 warns early enough to merge. The NG6 caveat stands: most users cannot obtain coins themselves, which is why the R4.5.3 subsidy exists. Open sub-question: what should the app do for a user who has neither fuel nor coins and whose issuer does not subsidize?
6. **Patent posture.** Several relevant techniques (blockchain-enforced smart contracts, shared-secret key derivation) appear in third-party patent portfolios. Confirm licensing posture before commercial release. Not a legal opinion; obtain counsel.
7. **Protocol versioning.** How are records written under an older payload schema handled after an upgrade?
8. *(new v0.2)* **Wrap scaling.** What are the size and fee of a Rotation Record for large holder counts (e.g. 10,000)? Where should `WRAP_MAX` sit?
9. *(new v0.2)* **Unconfirmed chain policy.** The SV Node default ancestor limit is 1000. What are the Teranode and next-generation broadcaster limits? What is the `limitcpfpgroupmemberscount` default? `D_MAX` must stay below all of them.
10. ~~**C6 feasibility.**~~ *Partly resolved v0.4:* sizes measured (§3.7, §6); C6 restated (D15). The ALL-mode method sizes are still estimates.
11. *(new v0.2)* **Fork-merge liveness.** If no holder writes after a fork, the fork persists. Is that acceptable, given that nothing new is encrypted meanwhile?
12. *(new v0.2)* **Rejection detection.** Which broadcaster endpoints run ZMQ-backed rejection detection (R4.3.6)?
13. *(new v0.2, D5)* **Ordering.** Replay can reorder records relative to other writers. Applications that need a total order must add their own sequencing.
14. *(new v0.2; extended v0.3; amended v0.13)* **Wire formats.** Pin the exact ephemeral **P-256** ECDH + HKDF-SHA256 + AES-256-GCM wrap format, the deterministic P-256 derivation of wrap and reader keys from a seed (R4.2.14; BRC-42 covers secp256k1 only), and the stamp serialization (§3.10), each with test vectors.
15. *(new v0.3)* **Mint-key compromise.** How is a compromised mint key replaced without starting a new collection, and how are forged mints made after the compromise told apart from genuine ones?
16. *(new v0.4)* **Size optimization.** Can `OP_CODESEPARATOR` (shrinking the preimage scriptCode), newer toolchains, or hand-written script reduce covenant inputs? Re-measure and revisit `FEE_CAP`.
17. *(new v0.4)* **Fee-rate rise.** `FEE_CAP` is compiled into the contract. If the live fee rate exceeds `FEE_CAP` ÷ write size (v0.14, F57: ≈ 150 sat/kB, down from v0.5's ≈ 155 sat/kB now that the write size is remeasured at 13,341 B), fuel can no longer pay for writes. What is the upgrade path?
18. *(new v0.7, F45)* **Signed packaging.** Should the client also ship as a signed installable package where platforms allow it, and how does that sit with C1's PWA assumption?
19. *(new v0.7, F45)* **External verification.** Who operates the verifier that compares a served build against `V` records, and what should a user do when it reports a mismatch?
20. *(new v0.13, F41)* **Custody choice and cadence.** Dedicated HSM, secure enclave, or managed KMS for the issuer keys; and how often the offline seed backup is exercised (R4.9.2) so that a restore is known to work before it is needed.

---

## 9. Acceptance criteria *(rewritten v0.2 as Given/When/Then; F12, F13, F24–F28, F34)*

Each scenario lists the requirements it covers. "Rejected by consensus" means every broadcaster returns `REJECTED`, or refuses submission, for the transaction. "Excluded" means the record is absent from both indexers' responses **and**, when injected directly into the client, is labeled invalid and absent from rankings.

### 9.1 Purchase and mint

- **AC-4.1.1-1 Purchase without crypto.**
  - **Given** a new device with no wallet software and no cryptocurrency
  - **When** the user completes a fiat purchase
  - **Then** a mint transaction exists with a 1-sat License Token at output 0, `Fuel(C)` at output 1, and a type-`M` Data output at output 2.
  - **And** the token is locked to owner key `o/0` of the user's seed, and the fuel output is the only fuel output.
  - *Covers: R4.1.1, R4.1.2, R4.1.4, R4.2.1, R4.2.5, C2.*
- **AC-4.1.5-1 Concurrent mints.**
  - **Given** the issuer processes 50 mint and top-up jobs concurrently
  - **When** all are broadcast
  - **Then** none is `failed` because of a conflicting issuer input.
  - *Covers: R4.1.5.*
- **AC-4.1.6-1 Immediate read access.**
  - **Given** a freshly minted license
  - **When** the buyer opens the app
  - **Then** it decrypts the mint's wrap to a key matching the current `c(e)`, and decrypts existing records.
  - *Covers: R4.1.6, R4.4.4.*
- **AC-4.1.8-1 Mint racing a rotation.** *(new v0.3)*
  - **Given** a mint that becomes `accepted` while a rotation, built without knowledge of that mint, is in flight
  - **When** the rotation becomes `accepted`
  - **Then** the issuer publishes an `IW2` record for the new holder, and the new holder decrypts records under the rotation's key.
  - *Covers: R4.1.8, R4.4.10.*

### 9.2 Keys

- **AC-4.2.4-1 No foreign counterparty.**
  - **Given** a client implementation
  - **When** every derivation call is logged during mint, write, transfer, rotation, and restore
  - **Then** every call uses counterparty `self`.
  - *Covers: R4.2.1, R4.2.4.*
- **AC-4.2.6-1 Origin normalization.**
  - **Given** an origin in `txid.vout` form with an uppercase txid
  - **When** it is parsed
  - **Then** it is stored as lowercase `txid_vout`, and both forms resolve to the same license.
  - *Covers: R4.2.6.*
- **AC-4.2.3-1 Anchored rotation with backward links.**
  - **Given** epochs 0..3 created by rotations
  - **When** a holder who only received `k(3)` reads history
  - **Then** it recovers `k(2)`, `k(1)`, and `k(0)` from the on-chain backward links and decrypts all records.
  - **And** each rotation's Data output includes a wrap to the issuer reader key.
  - *Covers: R4.2.3, R4.4.4.*
- **AC-4.2.7-1 Fork triggers merge.**
  - **Given** two accepted rotations with the same parent, each made after a different sale
  - **When** any holder next attempts a write
  - **Then** it first broadcasts a merge rotation that excludes both sellers.
  - **And** no record is encrypted under either branch key after the fork is known.
  - **And** neither seller can decrypt the merge key.
  - *Covers: R4.2.7, R4.3.3.*
- **AC-4.2.8-1 Epoch keys stay wrapped.**
  - **Given** a packet capture of all client and indexer traffic plus all on-chain data
  - **When** it is searched for any epoch key value
  - **Then** no occurrence is found outside wrap ciphertext.
  - *Covers: R4.2.8, R4.6.3.*
- **AC-4.2.9-1 No self-referential keys.** *(new v0.3)*
  - **Given** an issuer about to create a collection
  - **When** it derives its reader and mint keys
  - **Then** both derive from `n_C` alone, before the genesis transaction is built, and the published `G` record's keys match a re-derivation from `n_C`.
  - *Covers: R4.2.9.*
- **AC-4.2.10-1 Mint key isolation.** *(new v0.3)*
  - **Given** every output the issuer has ever created
  - **When** their locking scripts are inspected
  - **Then** none is spendable by the mint key.
  - *Covers: R4.2.10.*

### 9.3 Write

- **AC-4.3.1-1 Layout enforced.**
  - **Given** a license
  - **When** a write is built with a funding input placed before the token input, or with output 0 carrying 2 satoshis
  - **Then** the transaction is rejected by consensus.
  - *Covers: R4.3.1.*
- **AC-4.3.1-2 Owner signature flag.** *(new v0.4)*
  - **Given** a license
  - **When** the owner signature uses SIGHASH_SINGLE or ANYONECANPAY instead of SIGHASH_ALL|FORKID
  - **Then** the transaction is rejected by consensus.
  - *Covers: R4.3.1.*
- **AC-4.3.2-1 Owner change only on transfer.**
  - **Given** a type-`W` transaction (or any non-`TR` transaction)
  - **When** output 0 carries a different owner key or collection ID
  - **Then** it is rejected by consensus.
  - *Covers: R4.3.2.*
- **AC-4.3.3-1 Confidentiality from outsiders.**
  - **Given** a party holding all public on-chain data, and no current wrap key, no issuer reader key, and no wrap addressed to it
  - **When** it attempts to decrypt any Write Record
  - **Then** it fails.
  - *Covers: R4.3.3, R4.2.8.*
- **AC-4.3.3-2 Issuer can read.**
  - **Given** the issuer reader key
  - **When** records from every epoch are decrypted
  - **Then** all decrypt.
  - *Covers: R4.2.3, R4.1.6.*
- **AC-4.3.3-3 Write waits for a fork merge.** *(retargeted v0.4)*
  - **Given** two accepted `TR` transfers with the same parent epoch, and no merge yet
  - **When** a holder writes
  - **Then** the client first performs the merge rotation (or queues the write), and the record's epoch commitment is the merge's commitment.
  - *Covers: R4.3.3, R4.2.7.*
- **AC-4.3.3-4 No write pause after a transfer.** *(new v0.4)*
  - **Given** a `TR` transfer that is `accepted`, with all wraps in one transaction
  - **When** another holder writes immediately
  - **Then** the write proceeds without a rotation step, under the `TR`'s `c(e+1)`.
  - *Covers: R4.3.3, R4.4.3.*
- **AC-4.3.4-1 No plaintext origin.**
  - **Given** any Data output
  - **When** it is parsed
  - **Then** it contains the §3.8 fields in order and no origin string or origin txid.
  - *Covers: R4.3.4.*
- **AC-4.3.5-1 Chained writes without per-write lookups.** *(amended v0.8, F51)*
  - **Given** a license with its last transaction `proven`
  - **When** the user makes `D_MAX` consecutive writes within `HEAD_TTL`
  - **Then** all reach `accepted`, and the client makes no per-write lookup: at most one epoch-head refresh occurs across the whole burst.
  - *Covers: R4.3.5, R4.6.7.*
- **AC-4.6.7-2 Refresh triggers.** *(new v0.8, F51)*
  - **Given** a client with a cached epoch-head view
  - **When** each of these occurs — app start, a chain starting after a proven tip, a queue resuming, a rollback, and a transfer being built
  - **Then** a refresh happens each time, and writes made within `HEAD_TTL` of a refresh reuse the cached view.
  - *Covers: R4.6.7.*
- **AC-4.6.9-1 Subscription and fallback.** *(new v0.8, D23)*
  - **Given** a subscribed client
  - **When** a rotation event arrives
  - **Then** the client refreshes immediately and the next write uses the new epoch.
  - **And** when every stream is silenced for `STREAM_MAX_SILENCE`, the client falls back to lazy `HEAD_TTL` refreshes and shows a degraded-witness state.
  - *Covers: R4.6.9, R4.6.8.*
- **AC-4.6.7-3 Idle client is silent.** *(new v0.9, D24)*
  - **Given** the app left open for an hour with no writes
  - **When** its network activity is recorded
  - **Then** it makes no epoch-head queries.
  - **And** the first write after that hour refreshes before encrypting.
  - *Covers: R4.6.7.*
- **AC-4.6.9-2 Stream redundancy.** *(new v0.9, F54)*
  - **Given** two subscribed endpoints, one of which suppresses a rotation event
  - **When** the rotation is published
  - **Then** the other stream triggers an immediate refresh and the next write uses the new epoch.
  - **And** when the suppressing endpoint's stream is also silent past `STREAM_MAX_SILENCE`, the degraded-witness state is shown while writes continue from the remaining witnesses.
  - *Covers: R4.6.9, R4.6.8.*
- **AC-4.6.10-1 Beacon sequence.** *(new v0.8, F52)*
  - **Given** an endpoint that withholds a run of beacons, and one that replays an older beacon
  - **When** the client processes what it receives
  - **Then** the sequence gap and the regression each set the degraded-witness state.
  - *Covers: R4.6.10.*
- **AC-4.3.6-1 SEEN is not final.**
  - **Given** a single broadcaster without rejection detection reports `SEEN_ON_NETWORK`
  - **When** no second broadcaster confirms
  - **Then** the UI state remains `pending`, not `accepted`.
  - *Covers: R4.3.6.*
- **AC-4.3.7-1 Broadcast failure.**
  - **Given** the broadcaster is unreachable
  - **When** a write is attempted
  - **Then** the local token and fuel outpoints are unchanged, and a later retry succeeds from them.
  - *Covers: R4.3.7.*
- **AC-4.3.8-1 Two-device conflict converges.**
  - **Given** devices A and B share a license and are both at the same tip
  - **When** each broadcasts a write within 1 second of the other
  - **Then** within two blocks both records are `proven`, exactly once each, and the losing device's record was replayed on the winner's tip.
  - *Covers: R4.3.8, R4.3.10, R4.6.5.*
- **AC-4.3.9-1 Rollback replays descendants.**
  - **Given** a local chain of writes w1→w2→w3, all `accepted`
  - **When** w1 becomes `failed`
  - **Then** w2 and w3 are marked `failed-pending-replay`, the tip resets to w1's parent, and w1–w3 are rebuilt and reach `proven` in their original order.
  - *Covers: R4.3.9.*
- **AC-4.3.11-1 Chain limit queues.**
  - **Given** `D_MAX` unconfirmed writes outstanding
  - **When** another write is made
  - **Then** it is shown as `queued` and is broadcast only after the oldest outstanding transaction is `proven`.
  - *Covers: R4.3.11, R4.3.13.*
- **AC-4.3.12-1 Fuel lock.**
  - **Given** a `Fuel(C)` output created in transaction T
  - **When** a transaction spends it without spending `(T, 0)`
  - **Then** the transaction is rejected by consensus.
  - *Covers: R4.3.12, R4.1.1.*
- **AC-4.3.12-2 No withdrawal.**
  - **Given** a license with fuel value F
  - **When** its holder builds any of the following:
    - a `spend` transaction with output 1 below F − `FEE_CAP`;
    - a `consolidate` transaction with manifest entries understated;
    - a `consolidate` transaction with output 1 below Σmanifest − `FEE_CAP`
  - **Then** the transaction is rejected by consensus, and, outside a `TR` transfer, no transaction moves fuel value into an output other than output 1 or fees (R4.3.15).
  - *Covers: R4.3.14, R4.5.1, R4.3.12.*
- **AC-4.3.12-3 Single fuel invariant.** *(new v0.4)*
  - **Given** a license with a `proven` TopUp
  - **When** the holder tries to spend the TopUp together with fuel using `spend` (the SINGLE method)
  - **Then** the transaction is rejected by consensus.
  - **And** a `consolidate` transaction succeeds and leaves exactly one `Fuel(C)` at output 1.
  - *Covers: R4.3.12.*
- **AC-4.3.15-1 Exact layout.** *(new v0.5, F47)* Each of the following is rejected by consensus:
  1. a write with a fourth output paying the holder
  2. a write whose Data output carries value
  3. a write whose output 1 is not `Fuel(C)`
  4. a write with outputs in another order
  - *Covers: R4.3.15, R4.3.1.*
- **AC-4.3.15-2 Slack becomes fee.** *(new v0.5, F47)*
  - **Given** a license with fuel F and a holder-funded extra input
  - **When** the holder builds a write with output 1 = F − `FEE_CAP`
  - **Then** it is accepted, and every satoshi not in outputs 0–2 is miner fee.
  - **And** across 100 such writes, the holder's own balance never increases.
  - *Covers: R4.3.15, R4.3.14.*
- **AC-4.3.13-1 Offline queue.**
  - **Given** the device is offline
  - **When** the user makes three writes and then reconnects
  - **Then** the writes are shown `queued` immediately, are built against the current tip and epoch on reconnect, and reach `proven` in order.
  - **And** any client timestamp is displayed labeled self-reported.
  - *Covers: R4.3.13.*

### 9.4 Transfer

- **AC-4.4.2-1 Fuel moves with the token.**
  - **Given** a license with fuel and one `proven` TopUp addressed to the seller
  - **When** it is transferred
  - **Then** output 1 of the transfer holds both values less at most `FEE_CAP`.
  - *Covers: R4.4.1, R4.4.2.*
- **AC-4.4.2-2 Transfer without fuel.**
  - **Given** a license
  - **When** the seller builds a transfer that omits its fuel input
  - **Then** the client refuses to build it.
  - *Covers: R4.4.2, R4.3.12.*
- **AC-4.4.1-1 Seller locked out after sale.**
  - **Given** a transfer that is `proven`
  - **When** the seller attempts a write
  - **Then** the transaction is rejected (input already spent).
  - *Covers: R4.4.1.*
- **AC-4.4.3-1 Seller cannot read post-sale data.** *(updated v0.4)*
  - **Given** a `TR` sale
  - **When** the seller attempts to decrypt records written after it
  - **Then** it fails.
  - **And** the `TR` record contains no wrap for the seller's wrap key, and marks the seller's owner key departed.
  - **And** the seller, who signed the transaction, never received `k(e+1)`.
  - *Covers: R4.4.3, R4.4.8.*
- **AC-4.4.3-2 Large-club continuation.** *(new v0.4)*
  - **Given** a sale in a collection whose wraps exceed `WRAP_MAX`
  - **When** the sale is `accepted`
  - **Then** the buyer's client broadcasts `R+` continuations immediately.
  - **And** every verified holder has a wrap within `D_MAX` chained transactions or the following block, and holders show "access pending" until theirs arrives.
  - *Covers: R4.4.3, R4.4.10.*
- **AC-4.4.5-1 Seller quiesces.**
  - **Given** a seller with one `pending` write and two queued intents
  - **When** the seller starts a transfer
  - **Then** the client waits for the pending write, and requires the queued intents to be broadcast or explicitly discarded before building the transfer.
  - *Covers: R4.4.5.*
- **AC-4.4.6-1 Atomic settlement.**
  - **Given** a swap transaction signed by both parties
  - **When** the seller broadcasts a conflicting spend of the token and the conflicting spend is mined
  - **Then** the buyer's payment inputs remain unspent.
  - **And** the application offers no flow to sell for fiat.
  - *Covers: R4.4.6.*
- **AC-4.4.7-1 Buyer verifies a gift.**
  - **Given** a gift transfer of a copied (non-genuine) license script
  - **When** the receiving client processes it
  - **Then** it is marked not genuine and not added to the user's licenses.
  - *Covers: R4.4.7, R4.6.5.*
- **AC-4.4.9-1 Buyer reads immediately.**
  - **Given** a `proven` sale
  - **When** the buyer opens the app before any rotation
  - **Then** it decrypts the type-`TR` wrap and reads all existing records.
  - *Covers: R4.4.9, R4.4.4.*
- **AC-4.4.10-1 Withheld or corrupt wrap.**
  - **Given** a rotation that omits holder H, and another that gives holder J a key not matching `c(e+1)`
  - **When** H and J process them
  - **Then** H shows "access pending", and J rejects the key and shows "access pending".
  - **And** after a type-`W2` record addressed to each, both read normally.
  - *Covers: R4.4.10.*
- **AC-4.4.11-1 No wrap to copies.**
  - **Given** a copied license script on chain whose lineage does not reach an issuer mint
  - **When** a holder performs a rotation
  - **Then** the rotation contains no wrap for that copy's declared wrap key.
  - *Covers: R4.4.11, R4.6.6.*
- **AC-4.4.12-1 Buyer checks before paying.**
  - **Given** a swap where the seller supplies a wrap that does not match `c(e)`, or fuel below the advertised value, or a non-genuine token
  - **When** the buyer's client evaluates it
  - **Then** it refuses to sign, and no payment input is spent.
  - *Covers: R4.4.12.*
- **AC-4.4.12-2 Seller never sees the new key.** *(new v0.4)*
  - **Given** a completed swap
  - **When** the seller's client memory and all messages it received are inspected
  - **Then** they contain no `k(e+1)`, only ciphertext wraps.
  - **And** the buyer's payment inputs paid the rotation bytes.
  - *Covers: R4.4.12, R4.4.3.*
- **AC-4.4.13-1 Gift accepted.** *(new v0.4)*
  - **Given** a giver and a recipient with no BSV, in a collection of 300 holders
  - **When** the recipient accepts the gift
  - **Then** the `TR` transaction and its `R+` continuations are each paid within `FEE_CAP` from fuel, and all 300 holders plus the issuer receive wraps.
  - *Covers: R4.4.13, R4.4.3.*
- **AC-4.4.13-2 Gift not accepted.** *(new v0.4)*
  - **Given** a gift link that the recipient never opens
  - **When** the giver checks the card
  - **Then** the giver still owns it, and can write and transfer it normally.
  - *Covers: R4.4.13.*

### 9.5 Top-up

- **AC-4.5.1-1 Third-party top-up.**
  - **Given** a third party knowing only a license's origin
  - **When** it looks up the current token, creates `TopUp(C, ownerPub)` of at least `V_MIN` (25,000 sat), and the TopUp becomes `proven`
  - **Then** the holder's next write merges it into `Fuel(C)`.
  - *Covers: R4.2.2, R4.5.1, R4.5.4, R4.5.5.*
- **AC-4.5.1-2 TopUp not withdrawable.**
  - **Given** a `TopUp(C, ownerPub)` output
  - **When** its owner key signs a transaction paying it anywhere other than a `Fuel(C)` output 1 under `merge` and VC-B
  - **Then** the transaction is rejected by consensus.
  - *Covers: R4.5.1.*
- **AC-4.3.14-2 Per-input cap.** *(new v0.6, F49, D18)*
  - **Given** a consolidation of one fuel input and one TopUp input
  - **When** output 1 holds Σmanifest − 2 × `FEE_CAP`
  - **Then** it is accepted, and the same transaction with output 1 one satoshi lower is rejected by consensus.
  - **And** an ordinary write with a single fuel input is still rejected if output 1 falls below own value − one `FEE_CAP`.
  - *Covers: R4.3.14.*
- **AC-4.5.7-1 Empty-tank recovery.** *(new v0.6, F48)*
  - **Given** a license whose fuel is below `FEE_W`
  - **When** the holder opens the app
  - **Then** writes are shown paused, with the top-up path offered.
  - **And** when the holder funds a `V_MIN` TopUp from their own wallet (with change) and it becomes `proven`, the merge succeeds, paying its fee from the merged value, and writes resume.
  - *Covers: R4.5.7, R4.5.5, R4.5.4.*
- **AC-4.5.2-1 Early warning.** *(new v0.6, F48)*
  - **Given** fuel falling steadily
  - **When** it first drops below `FEE_W` + `FEE_CONS`
  - **Then** the low-fuel warning appears while there is still enough fuel to merge a TopUp.
  - *Covers: R4.5.2.*
- **AC-4.5.3-2 Refill basis.** *(new v0.5, F47)*
  - **Given** 10 valid Write Records whose transactions each burned the full `FEE_CAP`
  - **When** the issuer's auto-top-up runs
  - **Then** it sends at most 10 × expected fee, not 10 × `FEE_CAP`.
  - *Covers: R4.5.3.*
- **AC-4.5.3-1 Top-up rate limit.**
  - **Given** a license whose fuel was burned by transactions with no valid Write Records
  - **When** the issuer's auto-top-up runs
  - **Then** no top-up is sent.
  - **And** for a license with valid consumption, at most one top-up is sent per `TOPUP_WINDOW`.
  - *Covers: R4.5.3.*
- **AC-4.5.6-1 Dust ignored.**
  - **Given** a 1-satoshi output and an output below `V_MIN` sent to the TopUp script
  - **When** the holder writes
  - **Then** neither is merged.
  - *Covers: R4.5.6, R4.5.4.*

### 9.6 Read and verification

- **AC-4.6.1-1 Indexer failover.**
  - **Given** the primary indexer is down
  - **When** the user opens the leaderboard
  - **Then** results load from the secondary indexer and are verified.
  - *Covers: R4.6.1, R4.6.6.*
- **AC-4.6.2-1 Invalid records excluded.** For each of the following, the record is excluded:
  1. a Data output in a transaction that spends no License Token
  2. a transaction spending a copied license script whose lineage does not reach an issuer mint
  3. a transaction whose funding input precedes the token input
  4. a transaction whose output 0 is not 1 satoshi
  5. a transaction whose outputs don't match its record type's layout
  6. a token whose lineage passes through a burn (sat landed in a multi-sat output)
  7. a transaction that is `failed` or conflicted
  8. a record with an unknown epoch commitment and no pending rotation
  - *Covers: R4.6.2.*
- **AC-4.6.2-2 Mint validity.** *(new v0.3)* For each of the following, the mint and every record on its lineage are excluded:
  1. a mint with no stamp
  2. a genuine stamp copied into a transaction with different prevouts
  3. a correctly stamped mint that spends a 1-satoshi input
  4. a stamp signed by any key other than the `G` record's mint key
  5. a mint whose output 1 is not `Fuel(C)`
  6. *(v0.4, F46)* a stamped mint whose output 0 or output 1 value differs from the stamped value
  - *Covers: R4.6.2, R4.1.1, R4.1.6.*
- **AC-4.6.2-3 Clone attempt.** *(new v0.3)*
  - **Given** a holder of a genuine license
  - **When** they build a new transaction copying the genuine mint's output scripts and Data payload, funded from their own coins
  - **Then** the copy's stamp fails verification, and both indexers and the client exclude it and its descendants.
  - *Covers: R4.6.2, R4.6.5.*
- **AC-4.6.2-4 Genesis pin.** *(new v0.3)*
  - **Given** a `G` record whose transaction ID differs from the configured collection ID
  - **When** the client loads the collection
  - **Then** the record is ignored, and no mint stamped under its mint key is accepted.
  - *Covers: R4.6.2.*
- **AC-4.6.2-5 Issuer re-wrap validity.** *(new v0.3)*
  - **Given** an `IW2` record with a valid stamp, and a copy of its payload in a different transaction
  - **When** both are processed
  - **Then** the original is accepted and the copy is excluded.
  - *Covers: R4.6.2, R4.4.10.*

- **AC-4.6.3-1 Indexer holds no keys.**
  - **Given** full read access to the indexer's storage and configuration
  - **When** it is searched for epoch keys or owner private keys
  - **Then** none are found.
  - *Covers: R4.6.3.*
- **AC-4.6.4-1 Offline read.**
  - **Given** the app has synced once
  - **When** the device goes offline
  - **Then** the app functions read-only from cache.
  - *Covers: R4.6.4, C1.*
- **AC-4.6.5-1 Forged record from indexer.**
  - **Given** an indexer that injects a record from a copied license script
  - **When** the client loads results
  - **Then** the record is labeled unverified and does not appear in rankings.
  - *Covers: R4.6.5.*
- **AC-4.6.6-1 Indexer omission surfaced.**
  - **Given** two indexers where one omits a license's records
  - **When** the client compares them
  - **Then** a discrepancy is shown.
  - **And** before a rotation, the rotator uses the union of the verified holder sets.
  - *Covers: R4.6.6.*
- **AC-4.6.7-1 Epoch-head check.** *(new v0.7, F40)*
  - **Given** two endpoints reporting different newest rotations
  - **When** the client prepares a write
  - **Then** it verifies both and encrypts under the newer rotation's key, or queues the write if it cannot establish which is newer.
  - *Covers: R4.6.7, R4.6.6.*
- **AC-4.6.8-1 Hidden rotation.** *(new v0.7, F40)*
  - **Given** one endpoint that hides the newest rotation, a second that serves it, and a current beacon
  - **When** the client writes
  - **Then** it does not encrypt under the superseded key, and the departed holder cannot read the record.
  - *Covers: R4.6.8, R4.3.3.*
- **AC-4.6.8-2 Witness quorum.** *(new v0.7, D22)*
  - **Given** a beacon older than `BEACON_MAX_AGE`
  - **When** both endpoints are reachable and agree on the epoch head
  - **Then** writes proceed, and a degraded-witness state is shown.
  - **And** when one endpoint is also unreachable, writes queue with the warning, and any override applies to a single write only.
  - *Covers: R4.6.8, R4.3.13.*
- **AC-4.1.9-1 Beacon cadence.** *(new v0.7, F40)*
  - **Given** a running collection
  - **When** beacons are collected over a day, and a rotation occurs
  - **Then** no gap exceeds `BEACON_PERIOD`, and a beacon naming the new epoch follows the rotation.
  - *Covers: R4.1.9, R4.6.2.*
- **AC-4.4.11-2 Attributable holder set.** *(new v0.7, F40)*
  - **Given** a rotation
  - **When** its payload is parsed
  - **Then** it names the endpoints whose union produced the holder set.
  - *Covers: R4.4.11.*

### 9.7 Client delivery *(new v0.7; renumbered v0.13)*

- **AC-4.8.1-1 Subresource integrity.**
  - **Given** the deployed client
  - **When** any subresource is modified after publication
  - **Then** the browser refuses to load it, and every subresource reference carries an integrity attribute.
  - *Covers: R4.8.1.*
- **AC-4.8.3-1 Reproducible release.**
  - **Given** the tagged commit of a release
  - **When** it is rebuilt from published sources
  - **Then** the build hash matches the newest `V` record and the served artifact.
  - *Covers: R4.8.3, R4.8.2, R4.1.10.*
- **AC-4.8.4-1 External verification.**
  - **Given** a served build whose hash has no `V` record
  - **When** an independent verifier checks it
  - **Then** it reports a mismatch.
  - **And** no requirement or UI text claims the client verifies itself.
  - *Covers: R4.8.4.*
- **AC-4.8.5-1 Dedicated origin.** *(F50)*
  - **Given** the client's origin
  - **When** the operator's other applications are enumerated
  - **Then** none is served from that origin, and storage written by the client is unreachable from any of them.
  - **And** no cookie scoped to the parent domain carries application data.
  - *Covers: R4.8.5.*
- **AC-4.8.6-1 Pipeline provenance.** *(F50)*
  - **Given** a release
  - **When** its workflow and artifact are inspected
  - **Then** every action is pinned to a commit hash, the artifact has a verifiable provenance attestation, the deployment branch rejects force-push, and the attested digest matches the newest `V` record.
  - *Covers: R4.8.6, R4.1.10.*

### 9.8 Issuer key custody *(new v0.13, F41)*

- **AC-4.2.14-1 Wrap curve.**
  - **Given** a client and an issuer
  - **When** wrap keys are generated and used
  - **Then** each is a P-256 key derived from its owner's seed, and wraps are opened with the browser's built-in key agreement.
  - **And** a wrap addressed to a secp256k1 key is rejected as malformed.
  - *Covers: R4.2.14, R4.2.13.*
- **AC-4.9.1-1 Key stays in the module.**
  - **Given** a minting service backed by an HSM or enclave
  - **When** its memory, logs and configuration are searched after a series of mints
  - **Then** no reader or mint private key is present, and every mint still completed.
  - *Covers: R4.9.1.*
- **AC-4.9.2-1 Seed backup restores the reader key.**
  - **Given** only the offline issuer seed backup
  - **When** the reader key is reconstructed
  - **Then** wraps addressed to it from every past epoch open.
  - *Covers: R4.9.2, R4.2.14, R4.7.2.*
- **AC-4.9.3-1 Reader-key rotation.**
  - **Given** a suspected reader-key compromise
  - **When** the issuer publishes a `K` record and the following epoch rotation
  - **Then** subsequent rotations wrap to the new reader key, and the old key opens only records from before the rotation.
  - **And** a `K` record not stamped by the mint key is rejected, so a compromised reader key cannot redirect future wraps.
  - *Covers: R4.9.3, R4.6.2.*
- **AC-4.9.4-1 Minting pauses without the key.**
  - **Given** the custody module is unavailable
  - **When** a purchase is attempted
  - **Then** minting pauses, and no license is issued whose holder could not read the collection.
  - *Covers: R4.9.4, R4.1.6.*

### 9.9 Recovery

- **AC-4.2.13-1 Keys kept apart.** *(new v0.12, F39)*
  - **Given** a holder with a declared wrap key
  - **When** a rotator addresses a wrap to that holder
  - **Then** it is addressed to the wrap key, and the owner key alone cannot open it.
  - **And** a wrap addressed to the owner key instead is treated as missing, producing "access pending".
  - *Covers: R4.2.13, R4.4.11.*
- **AC-4.2.13-2 Leak blast radius.** *(new v0.12, F39)*
  - **Given** a leaked wrap key
  - **When** an attacker tries to spend the License Token or its fuel
  - **Then** it fails; the leak grants read access only.
  - *Covers: R4.2.13.*
- **AC-4.4.11-3 Wrap key follows the transfer.** *(new v0.12, F39)*
  - **Given** a completed `TR` transfer declaring a new wrap key
  - **When** the next rotation is built
  - **Then** wraps go to the newly declared key.
  - **And** a rotator using the superseded key produces "access pending" for that holder, repaired by `W2`.
  - *Covers: R4.4.11, R4.4.10.*
- **AC-4.7.1-1 Seed-only restore.** *(amended v0.12, F39)*
  - **Given** a user who acquired licenses at indices 0, 3, and 7, and a wiped device
  - **When** the user restores from seed only
  - **Then** all three licenses, their fuel, and all epoch keys they are entitled to are recovered and verified, deriving both `o/<i>` and `w/<i>` at each index.
  - *Covers: R4.7.1, R4.7.2, R4.2.5.*
- **AC-4.7.3-1 Queue warning.**
  - **Given** queued intents exist
  - **When** the user views the app
  - **Then** a "not yet backed up" warning is shown.
  - *Covers: R4.7.3.*

### 9.10 Constraints

- **AC-C5-1 Write latency.**
  - **Given** a network profile of 150 ms RTT, 1.6 Mbit/s down and 750 kbit/s up, and no rotation required
  - **When** 100 writes are made
  - **Then** the p95 time from user action to `pending` is ≤ 200 ms, and from user action to `accepted` is ≤ 2.0 s.
  - *Covers: C5, R4.3.6.*
- **AC-C5-2 Merge-write latency.** *(new v0.4, D14)*
  - **Given** the AC-C5-1 network profile and a collection of at most 1,000 holders with an unmerged fork
  - **When** a write triggers a merge rotation
  - **Then** the p95 time to `pending` is ≤ 200 ms, and to `accepted` is ≤ 10 s.
  - *Covers: C5, R4.2.7.*
- **AC-4.2.7-2 Fuel-paid merge.** *(new v0.5, D17; amended v0.10, F37)*
  - **Given** an unmerged fork in a collection of 300 holders
  - **When** a recipient's client merges
  - **Then** the `MG` transaction spends at most `FEE_CAP` of fuel, carries no change output, and carries no wraps, so its size does not grow with the 300 holders.
  - *Covers: R4.2.7, R4.3.15.*
- **AC-4.2.7-3 Concurrent merges converge.** *(new v0.10, F37, D25)*
  - **Given** a fork with two branches
  - **When** both transfer recipients merge at the same time
  - **Then** both `MG` records carry the same merged commitment, clients treat them as duplicates, and no second fork results.
  - *Covers: R4.2.7.*
- **AC-4.2.7-4 Sellers stay excluded.** *(new v0.10, F37; amended v0.11, F55)*
  - **Given** a merged fork, where each departed seller holds exactly one branch key
  - **When** each acts alone to derive the merged key
  - **Then** both fail.
  - **And** a continuing holder, holding both branch keys, derives the merged key and reads those records.
  - **And** the two sellers pooling their keys **do** derive the merged key — the exposure F55 records — and fail on every record written after the post-merge re-key.
  - *Covers: R4.2.7, R4.2.12, R4.3.3.*
- **AC-4.2.12-1 Re-key follows the merge.** *(new v0.11, F55)*
  - **Given** an `MG` that reaches `accepted`
  - **When** its publisher is online
  - **Then** a post-merge re-key rotation is published immediately, wrapped to the verified holders, and to neither departed seller.
  - *Covers: R4.2.12, R4.4.11.*
- **AC-4.2.12-2 Re-key fallback.** *(new v0.11, F55)*
  - **Given** an accepted `MG` whose publisher goes offline
  - **When** `MERGE_REKEY_DEADLINE` passes with no child rotation
  - **Then** another holder publishes the re-key.
  - *Covers: R4.2.12.*
- **AC-4.2.12-3 Concurrent re-keys terminate.** *(new v0.11, F55)*
  - **Given** two holders publishing re-keys at the same time
  - **When** the resulting fork is merged by the derived rule
  - **Then** the merged key is the same for both mergers, and neither departed seller can derive it, since neither holds either re-key.
  - *Covers: R4.2.12, R4.2.7.*
- **AC-4.2.11-1 Missing branch key.** *(new v0.10, F37)*
  - **Given** a holder that never received one branch's wrap
  - **When** a fork is merged
  - **Then** that holder shows "access pending" and does not publish an `MG`.
  - **And** after a `W2` supplies the missing branch key, it derives the merged key and resumes.
  - *Covers: R4.2.11, R4.4.10.*
- **AC-4.6.2-6 Merge commitment checked.** *(new v0.10, F37)*
  - **Given** an `MG` record whose merged commitment does not match the derivation over its named branches
  - **When** a client holding the branch keys processes it
  - **Then** it is rejected and excluded.
  - *Covers: R4.6.2.*
- **AC-C5-3 Recipient merges first.** *(new v0.4, D14)*
  - **Given** two overlapping `TR` transfers
  - **When** both recipients' clients are online for `FORK_WATCH` blocks
  - **Then** a merge rotation is published by a recipient, not by an ordinary writer.
  - *Covers: R4.2.7.*
- **AC-C6-1 Per-write cost.** *(new v0.4, D15)*
  - **Given** the reference contracts and the configured broadcaster's live fee policy
  - **When** 1,000 writes with 200-byte payloads are built
  - **Then** the median fee is ≤ 2,000 satoshis (expected ≈ 1,334 sat in v0.14, F57), and the measured size, fee, policy, date, and BSV price are recorded.
  - *Covers: C6, R4.3.12.*

---

## 10. Review prompt

When handing this to a reviewing agent, ask specifically:

> Review this spec for (a) UTXO contention failure modes I have not accounted for, (b) key derivation weaknesses, (c) any place where I have accidentally reintroduced a trusted server into a path I claimed was trustless, (d) whether the stated non-goals in §7 are genuinely unavoidable or whether I have given up too early, and (e) whether the acceptance criteria in §9 are actually testable as written.

---

## 11. Changelog

### 11.1 v0.1 → v0.2

Research: `thoughts/shared/research/2026-09-17-bsv-spec-v02-research.md`. Plan: `thoughts/shared/plans/2026-09-17-bsv-spec-v02-plan.md`.

| ID | Sections changed | Summary |
|----|------------------|---------|
| F1 | §3.4, §4.2, R4.3.3 | Per-holder Read Key replaced by a shared collection Epoch Key. |
| F2 | §3.4, R4.2.8 | Epoch key is random, not BRC-2-derived, so no counterparty can compute it. |
| F3 | §3.2, §3.7, R4.1.1, R4.3.12, R4.3.14, R4.5.1, R4.5.3, NG8 | Fuel contract-locked (FB-1 + VC-B); auto-top-up gated and rate-limited. |
| F4 | R4.2.2, §3.7 | TopUp destination is `TopUp(C, ownerPub)`, computed from the current token via lookup. |
| F5 | §2 note, §3.1, R4.3.2, R4.6.2, R4.4.11, NG7 | Genuineness stated as a validity rule; lineage required. |
| F6 | §3.5, R4.6.5, R4.6.6, §5 | Clients verify BEEF and lineage; indexer trust narrowed. |
| F7 | R4.4.3, §8 Q3 | No re-encryption; backward links provide history. |
| F8 | R4.3.6, R4.3.9, R4.3.10 | Status model and rollback/replay defined. |
| F9 | R4.3.8, §8 Q2 | Detect-and-replay (D5). |
| F10 | R4.4.1, R4.4.5, R4.4.6, R4.4.7, R4.4.12 | Seller quiescence, buyer verification, atomic settlement. |
| F11 | R4.1.4, R4.2.1, R4.2.5, §4.7 | Seed-only restore via sequential owner keys and on-chain wraps. |
| F12 | §9 (AC-4.3.3-1, AC-4.3.3-2) | Confidentiality AC made testable; issuer named as an allowed reader. |
| F13 | §9 (AC-4.5.1-1) | Top-up AC rewritten against R4.2.2. |
| F14 | §3.6, §3.8, R4.2.3, R4.4.8 | Rotations and seller departure anchored on chain. |
| F15 | R4.2.6, §4.2 | BRC-43 invoices; canonical origin string. |
| F16 | R4.3.5, R4.3.11, §3.9, §8 Q9 | `D_MAX` cap; node policy partly UNVERIFIED. |
| F17 | R4.1.5 | Issuer funding partitioned (operational; C7 unchanged). |
| F18 | R4.5.5 | TopUp discovery by lookup, off the hot path. |
| F19 | R4.5.4, R4.5.6 | `V_MIN`; 1-sat and dust outputs never merged. |
| F20 | §3.7 License rules (a)–(b), R4.3.1 | Sat alignment enforced (BRC-159 counts, not indexes). |
| F21 | §3.4, §3.6, R4.4.3, R4.4.4, R4.4.9, R4.4.10, R4.2.7, NG1 | Backward-linked epoch keys; withheld wraps and forks handled; NG1 rewritten. |
| F22 | NG3 | "Needs a server" removed; revocation declined (D6). |
| F23 | R4.6.1, R4.6.6, NG5 | Two indexers; NG5 rewritten. |
| F24 | §9 (AC-4.6.2-1) | Invalid-record cases enumerated; "excluded" defined. |
| F25 | R4.4.2, §9 (AC-4.4.2-1/2) | Fuel sweep is MUST. |
| F26 | §9 (AC-C5-1) | Measurable latency criterion. |
| F27 | R4.3.13, §9 (AC-4.3.13-1) | Offline writes queued (D7). |
| F28 | §9 (AC-4.3.9-1, AC-4.3.8-1, AC-4.7.1-1, AC-4.2.3-1, AC-4.2.7-1, AC-4.6.5-1, AC-4.3.12-1) | Added scenarios. |
| F29 | §4.2, R4.2.4, NG4 | Counterparty `self`; BIP32-style rationale removed. |
| F30 | R4.1.2, R4.5.4, §6 | Fuel fan-out removed. |
| F31 | R4.3.6 | `accepted` requires rejection detection or two broadcasters. |
| F32 | §4.1 trust note, §5 | Buyer trust in issuer stated. |
| F33 | §3.8, R4.3.4, NG4 | Plaintext origin removed; protocol-ID leak noted. |
| F34 | §9 (AC-4.1.1-1, AC-4.3.5-1) | Process claim replaced; chaining AC strengthened. |
| D1–D10 | see plan Decision log | D8 amends C2 (user-approved). D10 adds a C3 note without changing C3. |
| Design correction | §3.2, §3.7 | Implementation found that `Fuel` cannot embed the license origin: the origin's txid is the mint txid, which is unknown while the mint is being built. Fuel and TopUp are therefore parameterized by collection ID `C`; per-license binding comes from FB-1 and the owner key. |
| Validation fix V1 | §3.7 Fuel layout | Clarified that outputs 3+ are unrestricted, matching the approved plan (B4) and R4.4.12; the draft read as "exactly three outputs", which would have blocked swaps. |
| Validation fix V2 | R4.6.6 | Added "wrap to the union of verified holders", matching AC-4.6.6-1. |
| Discussion addition | R4.4.11 | Rotators wrap only to lineage-verified tokens (raised while explaining D3). |
| Validation fix V3 (v0.3) | §3.9, R4.2.5, R4.7.1 | Gap-limit parameter renamed `G` → `GAP` to avoid clashing with record type `G`. |

### 11.2 v0.2 → v0.3

Research: `thoughts/shared/research/2026-09-17-bsv-spec-v03-mint-auth-research.md`. Plan: `thoughts/shared/plans/2026-09-17-bsv-spec-v03-mint-auth-plan.md`.

| ID | Sections changed | Summary |
|----|------------------|---------|
| F35 | §3.8 (`G`, `M`), §3.10, R4.1.1, R4.1.6, R4.2.10, R4.6.2, §5, NG9, §8 Q15, §9 (AC-4.6.2-2, -3, -4, AC-4.2.10-1) | Mints authenticated by a non-replayable issuer stamp. Mints may not spend 1-sat inputs. Validity rules split by record type, so `G`/`M` records are no longer self-invalidating. |
| F36 | §3.8 (`IW2`), §3.11, R4.4.10, R4.6.2, §9 (AC-4.6.2-5) | Issuer record transaction layout; issuer re-wraps use `IW2`. |
| F38 | R4.1.8, §9 (AC-4.1.8-1) | Issuer re-wraps to holders missed by a concurrent rotation. |
| F44 | §3.9 (`n_C`), §4.2 table, R4.2.9, §9 (AC-4.2.9-1) | Collection-scoped issuer keys derived from a pre-chosen nonce instead of the collection ID. |
| D11 | §3.10, §4.2, R4.2.10 | Stamp by a separate mint key, chosen over spend-authorized mints. |
| R4.1.7 | §4.1 | Marked reserved (never assigned) so IDs stay contiguous without renumbering. |

### 11.3 v0.3 → v0.4

Research: `thoughts/shared/research/2026-09-17-bsv-spec-v04-latency-cost-research.md` (prototype in `2026-09-17-size-proto/`). Plan: `thoughts/shared/plans/2026-09-17-bsv-spec-v04-latency-cost-plan.md`.

| ID | Sections changed | Summary |
|----|------------------|---------|
| F42 | §2 C5 note, §3.6, §3.8 (`TR`, `T` retired), R4.2.7, R4.3.2, R4.4.3, R4.4.8, R4.4.12, R4.4.13, §9 (AC-4.3.3-3, -4, AC-4.4.3-1, -2, AC-4.4.12-2, AC-4.4.13-1, -2, AC-C5-2, -3) | Exclusion rotation moved into the transfer transaction; the club never pauses after a sale. Forks are merged by recipients first, with the next writer as fallback. |
| F43 | §2 C6, §3.7 measured sizes, §3.9 parameters, §6, §8 Q10/Q16/Q17, §9 AC-C6-1 | Contract sizes and fees measured; parameters given values; C6 restated in satoshis. |
| F46 | §3.10, R4.1.1, §9 AC-4.6.2-2 case 6 | Stamp binds output values; issuer inputs must be SIGHASH_ALL. |
| D12 | as F42 | Rotation inside the transfer, built by the recipient. |
| D13 | R4.4.13 | Gifts are interactive, fuel-funded, with continuations. |
| D14 | §2 C5 note, R4.2.7, §3.9 `FORK_WATCH` | Recipients merge first; C5 exception measured by AC-C5-2. |
| D15 | §2 C6 | **Constraint change, user-approved:** ≤ 2,000 sat per write at the live policy. |
| D16 | §3.7, R4.3.12, R4.3.14, §4.3 layout, AC-4.3.1-2, AC-4.3.12-3 | Hybrid introspection: SINGLE for everyday spends, ALL for merges; owner signature must be SIGHASH_ALL; single-fuel invariant. |

### 11.4 v0.4 → v0.5

Research: `thoughts/shared/research/2026-09-17-bsv-spec-v05-fuel-slack-research.md`. Plan: `thoughts/shared/plans/2026-09-17-bsv-spec-v05-fuel-slack-plan.md`.

| ID | Sections changed | Summary |
|----|------------------|---------|
| F47 | §3.7 (License rule (f), slack note, measured sizes), §3.9, §4.3 layout, R4.2.7, R4.3.1, R4.3.15, R4.5.1, R4.5.3, §6, §7 NG8, §8 Q17, §9 (AC-4.3.15-1, -2, AC-4.5.3-2, AC-4.2.7-2, AC-4.3.12-2, AC-C6-1) | Fuel slack was extractable: `FEE_CAP` is an allowance, and nothing forced the unused part into fees. The License contract now binds the exact output list, so slack can only become fee outside transfers. Top-ups replace only expected fees. NG8 restated truthfully. Partial root cause: validation fix V1 (round 1), which unrestricted outputs 3+. |
| D17 | as above | License uses an ALL preimage with an exact layout; Fuel `spend` stays SINGLE (partially revises D16). Write cost ≈ 1,290 sat (+28%). |

### 11.5 v0.5 → v0.6

Research: `thoughts/shared/research/2026-09-17-bsv-spec-v06-selffund-research.md`. Plan: `thoughts/shared/plans/2026-09-17-bsv-spec-v06-selffund-plan.md`.

| ID | Sections changed | Summary |
|----|------------------|---------|
| F49 | §3.7 (VC-B, slack, measured sizes), §3.9 (`FEE_CAP` per input, `FEE_CONS`, `V_MIN`), R4.3.14, R4.5.4, §9 AC-4.3.14-2 | A consolidation was measured at ≈ 24.9 KB ≈ 2,486 sat, above the flat 2,000 `FEE_CAP`, so merging a TopUp was impossible. The cap now scales per restricted input, and `V_MIN` rises to 25,000 sat. |
| F48 | R4.5.2, R4.5.7, §8 Q5, §9 (AC-4.5.7-1, AC-4.5.2-1) | With no change output in license transactions, a holder funds their own license through an ordinary TopUp transaction, then merges. No contract change: a measured no-fuel layout would have added ≈ 4 KB to every write. |
| D18 | §3.7 VC-B, R4.3.14 | Cap per restricted input, over a flat raise or an exemption. |

### 11.6 v0.6 → v0.7

Research: `thoughts/shared/research/2026-09-17-bsv-spec-v07-trust-paths-research.md`. Plan: `thoughts/shared/plans/2026-09-17-bsv-spec-v07-trust-paths-plan.md`.

| ID | Sections changed | Summary |
|----|------------------|---------|
| F40 | §3.8 (`B`), §3.9, R4.1.9, R4.4.11, R4.6.2, R4.6.6, R4.6.7, R4.6.8, §5, §9 (AC-4.6.7-1, AC-4.6.8-1, -2, AC-4.1.9-1, AC-4.4.11-2) | Rotation freshness had no witness: indexers hiding a rotation caused holders to keep writing under a key a departed seller held, silently. Adds an issuer epoch beacon, a pre-write epoch-head check across operator-independent endpoints, and a queue-with-warning rule. |
| F45 | §3.8 (`V`), R4.1.10, §4.8, §5, NG10, §8 Q18/Q19, §9 (AC-4.8.1-1, AC-4.8.3-1, AC-4.8.4-1) | The client delivery channel was an unlisted trusted party. Now listed, with SRI/CSP, build-baked collection ID, reproducible builds, on-chain release records, and external-only verification. |
| F50 | R4.8.5, R4.8.6, §9 (AC-4.8.5-1, AC-4.8.6-1) | Serving a key-holding client from a shared static-hosting account origin puts owner and epoch keys in storage reachable by every other application on that origin. Dedicated origin required, plus pipeline pinning, provenance attestation and branch protection. |
| D19 | R4.1.9, R4.6.7, R4.6.8 | Two-endpoint head check plus a beacon. |
| D20 | §4.8, NG10 | Documented and made detectable, rather than documented only. |
| D21 | R4.8.5 | Dedicated origin on a domain the operator controls. |
| D22 | R4.6.8 | Witness quorum: a stale beacon alone does not pause writes, so issuer uptime does not gate writing. |

### 11.7 v0.7 → v0.8

Research: `thoughts/shared/research/2026-09-17-bsv-spec-v08-freshness-research.md`. Plan: `thoughts/shared/plans/2026-09-17-bsv-spec-v08-freshness-plan.md`.

| ID | Sections changed | Summary |
|----|------------------|---------|
| F51 | §3.9 (`HEAD_TTL`, `STREAM_MAX_SILENCE`), R4.3.5, R4.6.7, R4.6.8, R4.6.9, NG11, §9 (AC-4.3.5-1 amended, AC-4.6.7-2, AC-4.6.9-1) | v0.7's per-write epoch-head check contradicted v0.2's lookup-free chained writes. Freshness now tracks rotations, not writes: a cached head view with defined refresh triggers, plus an optional rotation subscription. The residual window is stated as NG11. |
| F52 | R4.6.10, §9 AC-4.6.10-1 | Beacon sequence numbers are now checked: a gap or a regression sets the degraded-witness state. |
| D23 | R4.6.7, R4.6.9 | Subscribe where available, with a 60-second fallback, over per-write checks or block-boxed checks. |

### 11.8 v0.8 → v0.9

Research: `thoughts/shared/research/2026-09-17-bsv-spec-v09-refresh-research.md`. Plan: `thoughts/shared/plans/2026-09-17-bsv-spec-v09-refresh-plan.md`.

| ID | Sections changed | Summary |
|----|------------------|---------|
| F53 | §3.9 (`HEAD_TTL`), R4.6.7, NG11, §9 AC-4.6.7-3 | v0.8 didn't say whether the head-age check was a timer or evaluated at write time. It is now lazy: an idle client makes no queries, and a burst costs at most one refresh. `HEAD_TTL_SUBSCRIBED` was considered and declined — with lazy refresh it saves nothing and would let a hostile endpoint hold a stream open while suppressing events. |
| F54 | §3.9 (`STREAM_MAX_SILENCE`), R4.6.9, §5, §9 (AC-4.6.9-1 amended, AC-4.6.9-2) | Subscribe at every endpoint offering a stream, at least two where available; either stream's event refreshes; silence tracked per endpoint; losing one sets the degraded-witness state. |
| D24 | R4.6.7 | Lazy refresh with a single `HEAD_TTL`, over timer polling or a stretched subscribed window. |

### 11.9 v0.9 → v0.10

Research: `thoughts/shared/research/2026-09-17-bsv-spec-v010-merge-research.md`. Plan: `thoughts/shared/plans/2026-09-17-bsv-spec-v010-merge-plan.md`.

| ID | Sections changed | Summary |
|----|------------------|---------|
| F37 | §3.4, §3.8 (`MG`), §3.9 (`MERGE_JITTER`), R4.2.7, R4.2.11, R4.6.2, §6, NG1, §9 (AC-4.2.7-2 amended, AC-4.2.7-3, -4, AC-4.2.11-1, AC-4.6.2-6) | Concurrent merges each invented a random key, so merges could fork recursively. The merged key is now derived from all branch keys, so concurrent merges converge on the same key by construction. Exclusion still holds: every departed seller is missing exactly one branch key. Merges need no wraps and become fixed-size. |
| D25 | as above | Derived merge key, over an elected merger or accepting cascades. |

### 11.10 v0.10 → v0.11

Research: `thoughts/shared/research/2026-09-17-bsv-spec-v011-rekey-research.md`. Plan: `thoughts/shared/plans/2026-09-17-bsv-spec-v011-rekey-plan.md`.

| ID | Sections changed | Summary |
|----|------------------|---------|
| F55 | §3.9 (`MERGE_REKEY_DEADLINE`), R4.2.7, R4.2.12, NG1, §6, §9 (AC-4.2.7-4 amended, AC-4.2.12-1, -2, -3) | The derived merge key is computable by the two sellers of a fork acting together, since they hold its inputs between them. No derivation can avoid this, so a merge is now always followed by a random post-merge re-key wrapped only to holders verified once both transfers are visible. Concurrent re-keys are absorbed by the derived merge rule, so the process terminates. The remaining window between merge and re-key is stated in NG1. |
| D26 | as above | Derived merge plus mandatory re-key, writes continuing meanwhile, over accepting the exposure, pausing writes, or mixing randomness into the merge. |

### 11.11 v0.11 → v0.12

Research: `thoughts/shared/research/2026-09-17-bsv-spec-v012-keysep-research.md`. Plan: `thoughts/shared/plans/2026-09-17-bsv-spec-v012-keysep-plan.md`.

| ID | Sections changed | Summary |
|----|------------------|---------|
| F39 | §3.8 (`M`, `TR`), §4.2 table, R4.1.6, R4.2.5, R4.2.13, R4.4.9, R4.4.10, R4.4.11, R4.4.12, R4.7.1, R4.7.2, §6, NG4, §9 (AC-4.2.13-1, -2, AC-4.4.11-3, AC-4.7.1-1 amended) | The owner key both signed token spends and decrypted wraps. No known attack (ECDSA and an ECDH KEM have a joint-security result), but a leak in the decryption path cost the card itself. Wrap keys are now independent and declared in the `M` / `TR` record, so a leaked wrap key grants read access only. |
| D27 | as above | Declared in the record, over an in-script key (measured at ≈ +194 sat per write, +15%), a public-offset key (no real separation), or keeping one key. |

### 11.12 v0.12 → v0.13

Research: `thoughts/shared/research/2026-09-18-bsv-spec-v013-custody-research.md`. Plan: `thoughts/shared/plans/2026-09-18-bsv-spec-v013-custody-plan.md`.

| ID | Sections changed | Summary |
|----|------------------|---------|
| F41 | §3.4, §3.8 (`K`), §4.2 table, R4.2.14, R4.6.2, R4.7.2, §4.9 (R4.9.1–R4.9.4), §5, §6, NG9, §8 Q14/Q20, §9 (§9.8: AC-4.2.14-1, AC-4.9.1-1, -2, -3, -4; §9 renumbered) | The issuer reader key opens all history and had no stated custody. It now lives in an HSM or enclave the minting service cannot extract from, with an offline seed backup, a mint-key-stamped `K` record for rotation, and a pause-minting rule when the module is unavailable. |
| D28 | R4.9.1–R4.9.4 | HSM or enclave, over holding the key in the minting service (all history, silently, on a breach) or a split/threshold scheme (a quorum per mint is impractical; fits an archival copy). Practical self-hosted device: YubiHSM 2 (secp256k1 and P-256, ECDH derivation on both). A Ledger Nano S is unsuitable for the live minting path (button press per operation, no ECDH against arbitrary keys in stock apps, discontinued) but is a good offline home for the seed backup. |
| D29 | §3.4, §4.2 table, R4.2.14, Q14 | Wrap keys and the issuer reader key move to P-256, derived deterministically from the seed; token-spending keys stay secp256k1 under BRC-42. Wrap keys never appear in a locking script and are declared in the `M`/`TR` record since D27, so consensus does not constrain their curve. Browser-native key agreement removes a shipped curve implementation from the PWA's most sensitive path (cf. F45/F50), and managed custody becomes possible (AWS KMS `DeriveSharedSecret` is NIST-curve only). Cost: two curves in one system, and wrap keys are no longer BRC-42-derived (Q14). |
| D30 | §3.8 | Protocol identifier fixed as the ASCII bytes `nftgate` plus a one-byte format version, chosen over a domain-namespaced tag (~24 B per record for no added validity: validity comes from stamps and lineage, not the tag) and a hash-derived id (compact and collision-proof but unreadable in explorers and opaque in fixtures). Version `0x01` is reserved for the phase-1 plaintext proof-out so its tag-scanning code and fixtures survive into `0x02+`. |

### 11.13 v0.13 → v0.14

Measurement: `src/bsv/contracts/SIZES.md` (the real License `write` and `Fuel(C)` `spend` methods, built and spent together in one transaction, measured by mw-yo97u.2; restated here by mw-yo97u.6).

| ID | Sections changed | Summary |
|----|------------------|---------|
| F57 | §3.7 (measured sizes), §3.9 (`FEE_W`), §6 (write size and fee), §8 Q17, §9 AC-C6-1 | The License + Fuel write measures 13,341 B, not the ≈12,875 B v0.5's `FEE_W` was built from: 466 B over the old estimate. Broken down against the shipped artifacts: License's §3.7 rule growth since the prototype, checks (e) and (f), counted twice (its locking script and again inside its own unlocking-script preimage), 272 B; the real Data output's `nftgate`/version/record-type header vs. the prototype's bare payload push, counted twice (the output itself and again as an argument inside License's unlocking script), 24 B; Fuel's own added §3.7 check (3), "the Fuel is input 1", counted three times (its locking script, its own preimage, and again as an argument inside License's unlocking script), 99 B; and the second input's outpoint in both `prevouts` lists, 72 B — because the spec's v0.5 `FEE_W` summed each contract's size as measured *alone*, with a one-input `prevouts`, rather than in the real two-input write; less 1 B of DER signature variance. `FEE_W` is now ≈1,334 sat, `FEE_CAP` ÷ write size falls from ≈155 to ≈150 sat/kB (Q17), and AC-C6-1's expected median follows. §3.7's measured-sizes table is replaced with these shipped-artifact figures; the prototype's figures are kept as a labelled note, since they predate License rules (e)/(f) and Fuel's check (3) and no longer describe what ships. Lesson: parts measured in isolation and then added do not equal a whole transaction's size — the missing second `prevouts` outpoint alone was 72 of the 466 B — so future size figures should come from a real combined transaction, not a sum of separately-measured parts. |

### 11.14 v0.14 → v0.15

Documentation consistency pass (mw-yo97u.10); no measurement changed, only how three places state it.

| ID | Sections changed | Summary |
|----|------------------|---------|
| — | §3.7 (measured sizes), §3.9 (`FEE_CAP`), §6 (covenant input overhead) | §3.7's table now lists the Data output (216 B) and transaction overhead (127 B) alongside the License and Fuel `spend` rows, so the table sums to §6's 13,341 B write size (`SIZES.md`). §3.9's `FEE_CAP` ratio, stale since v0.14's remeasurement, is corrected from ≈1.55× to ≈1.5× `FEE_W` (2,000 / 1,334). §6's covenant-input-overhead row, unrevised since v0.4's ≈10.1 KB estimate, is restated from `SIZES.md`'s measured parts (12,998 B of 13,341 B) to agree with §3.7 and §3.9. |

