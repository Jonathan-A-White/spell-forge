# nftgate wire formats (spec §8 Q14)

This document pins, byte for byte, four structures of `docs/bsv-nft-gated-app-spec.md`:

1. the epoch key `k(e)` and its commitment `c(e)` (§3.4);
2. the deterministic seed-to-P-256 derivation of wrap keys and of the issuer reader key (§4.2, R4.2.14);
3. the wrap of `k(e)` to a P-256 public key (§3.6, R4.2.13, AC-4.2.14-1);
4. the `W` payload encryption under `k(e)` (§3.8).

Every structure below has test vectors in `tests/fixtures/bsv/wire-vectors.json`, produced by the
Node reference `src/bsv/node/wire-reference.ts` (node:crypto only) through `npm run bsv:vectors`,
and checked by `tests/unit/bsv-wire-vectors.test.ts`, which also opens and rebuilds them through
`crypto.subtle`. All seeds, keys and nonces in the vectors are published counting patterns
(bytes `s, s+1, s+2, …`) or public constants; none is a wallet or harness key.

Notation: `‖` is byte concatenation with no separator and no length prefix. Integers are
big-endian. Strings are ASCII unless stated. "Hex" is lowercase.

## Library choice: WebCrypto (`crypto.subtle`)

The browser implementation uses **WebCrypto** (`crypto.subtle`), not `@noble/curves`,
`@noble/hashes` or `@noble/ciphers`. No new dependency goes into `package.json` or
`packages/bsv/package.json`.

Why:

- AC-4.2.14-1 asks that wraps be opened with the browser's built-in key agreement, and D29
  moved wrap keys to P-256 precisely so that no curve implementation has to be shipped on the
  most sensitive path. WebCrypto has every primitive needed: ECDH on P-256 (`deriveBits`),
  HKDF-SHA256, AES-256-GCM and SHA-256.
- Wrap private keys can be imported as non-extractable `CryptoKey`s for ECDH once derived. This
  hardens the key at rest in a `CryptoKey` only: the scalar `d` itself is computed in the JS heap
  during derivation (HKDF output, `BigInt` reduction, the PKCS#8 bytes), so script running in the
  page could read it at that moment. Wrap keys are non-spending (R4.2.14), so a leak grants
  read access only.
- The one gap is computing a public key from a raw scalar: WebCrypto has no scalar
  multiplication, and a JWK import with `d` but no `x`, `y` is refused (Node 20: "Invalid
  keyData"). It is covered by importing the scalar as **PKCS#8 without the optional public
  key** and reading `x`, `y` back with `exportKey('jwk')` (the key must be imported extractable
  for that one call). Checked on 2026-09-30:
  - Node 20.20.2 (`webcrypto.subtle`): accepted; `x`, `y` equal node:crypto's `createECDH`.
  - Chromium 153.0.8010.12 (Playwright, from a `http://localhost` page): accepted, both
    extractable and non-extractable; same `x`. (`crypto.subtle` exists only in a secure
    context: on `about:blank` it was undefined.)
  - Firefox and WebKit/Safari: **not tested** (not installed on this host). If one of them
    refuses a PKCS#8 without the public key, that browser needs the public point computed some
    other way (for example `@noble/curves`' `p256` in the derivation path only); ECDH, HKDF and
    AES-GCM stay native.

  The PKCS#8 bytes for a scalar `d` are the fixed 36-byte prefix
  `3041020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420` followed by `d`
  (32 bytes): 68 bytes in all.
- Reducing the HKDF output to a scalar (§2) needs only `BigInt`, which every target has.

## 1. Epoch key `k(e)` and commitment `c(e)`

`k(e)` is 32 bytes from a cryptographically secure random source (R4.2.8:
`crypto.getRandomValues`). It is never derived, and is transmitted only inside wraps (§3).

```
c(e) = SHA-256( "nftgate-epoch" ‖ k(e) )
```

exactly as §3.4 fixes it: the 13 ASCII bytes of the label, then the 32 key bytes, with no
separator and no length prefix, 45 bytes hashed.

| Offset | Length | Field | Value |
|-------:|-------:|-------|-------|
| 0 | 13 | label | ASCII `nftgate-epoch`, hex `6e6674676174652d65706f6368` |
| 13 | 32 | `k(e)` | the epoch key |
| | | output | 32-byte SHA-256 digest |

`c(e)` is carried as §3.8 field 3 and in the fields of §3.6 and `MG`. It has no version byte of
its own: it is a fixed-length hash whose meaning is fixed by the record format version of §3.8
field 1 (`0x02`).

Vector `k0` (more in the fixture's `commitment`):

```
k(e) = 808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f
c(e) = 32b8802d37bb1d8665e41989bd52d09bfb93cce197a9cf1d8859b19e2b0f6f15
```

## 2. Seed-to-P-256 derivation (wrap keys and the issuer reader key)

Wrap key `w/<i>` and the issuer reader key are derived from the party's seed by one scheme
(R4.2.14), so a seed-only restore (§4.7) recovers them.

```
OKM = HKDF-SHA256( IKM = seed, salt = "nftgate-p256", info = invoice, L = 48 )
d   = ( OKM as a 384-bit big-endian integer  mod  (n − 1) ) + 1
Q   = d·G on P-256
```

**Seed (IKM).** The input is the holder's **32-byte root private key**: the root secret that
R4.2.1 calls the holder root key (the BRC-42 root private key, which a seed-only restore, §4.7,
starts from), as its 32-byte big-endian encoding. **Exactly 32 bytes** (Governor's decision,
mw-jeswf, 2026-09-30). A BIP-39 seed (64 bytes) is **not** the input, and neither is a BRC-42
child key (an `o/<i>` owner key, say): the wrap and reader keys are derived from the root, never
from something derived from it. A shorter input is refused (`seed-too-short`), a longer one is
refused (`seed-wrong-length`); the library checks this in `deriveWrapKeyPair` and
`deriveReaderKeyPair`. (HKDF itself would accept any length; the pin is ours, so that every
implementation derives the same keys from the same root.)

**Salt.** ASCII `nftgate-p256` (12 bytes), hex `6e6674676174652d70323536`. It separates this
derivation from any other use of the same seed (BRC-42 does not use HKDF at all).

**Info.** The BRC-43 invoice number of the §4.2 table row, `<security level>-<protocol ID>-<key ID>`,
in ASCII, with security level 2:

| Key | Info (ASCII) | Info (hex) |
|-----|--------------|------------|
| Wrap key *i* | `2-nftgate wrap-w/<i>`, `<i>` decimal with no leading zeros | `322d6e66746761746520777261702d772f` ‖ ASCII digits of `i`; for `w/0`: `322d6e66746761746520777261702d772f30` |
| Issuer reader key | `2-nftgate reader-<n_C hex>`, `n_C` the 16-byte collection nonce as 32 lowercase hex characters | `322d6e667467617465207265616465722d` ‖ ASCII of the 32 hex characters |

The wrap key and owner key of one index therefore share their invoice numbering (`o/<i>`,
`w/<i>`, R4.2.5) but not their derivation or curve.

**Scalar.** Wide reduction, not rejection sampling: `L = 48` bytes (384 bits, 128 more than
`n`), reduced modulo `n − 1` and incremented, so `d` is in `[1, n − 1]` on every input. This is
FIPS 186-5 Appendix A.2.1 ("extra random bits") and the same length RFC 9380 uses for P-256.
The bias is below 2⁻¹²⁸. Rejection with a counter was not chosen because P-256's `n` is about
`2²⁵⁶ − 2²²⁴`: a 32-byte output lands at or above `n` with probability about 2⁻³², so the retry
branch would exist in every implementation but no fixed test vector could reach it. Wide
reduction has one path and every vector exercises it.

```
n = ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551
```

**Public key encoding.** Wherever a P-256 public key is carried in a record (the wrap public key
of `M` and `TR`, the reader key of `G` and `K`, the ephemeral key inside a wrap), it is the
**65-byte SEC 1 uncompressed** point `0x04 ‖ X ‖ Y` (each 32 bytes). Not the 33-byte compressed
form, for two reasons:

- It makes a secp256k1 key unmistakable (§3, AC-4.2.14-1). secp256k1 owner keys are carried as
  33-byte compressed points (`02`/`03` ‖ X), which fail on length; and an uncompressed
  secp256k1 point fails the P-256 curve equation. A 33-byte P-256 key would be ambiguous: about
  half of all secp256k1 X coordinates are also valid P-256 X coordinates.
- WebCrypto's `raw` import of an uncompressed point works everywhere; compressed import is
  optional in the WebCrypto spec and not guaranteed across browsers.

The cost is 32 bytes per carried key. The `0x04` prefix is SEC 1's own format tag, so the key
carries no extra version byte.

| Offset | Length | Field |
|-------:|-------:|-------|
| 0 | 1 | `0x04` |
| 1 | 32 | X |
| 33 | 32 | Y |

A key is accepted only if it is 65 bytes, starts with `0x04`, `X < p`, `Y < p` and
`Y² = X³ − 3X + b (mod p)`; otherwise it is refused (`not-p256-public-key`).

Vector `holder A w/0` (more in the fixture's `derivation`, including the issuer reader key; the
fixture also keeps a `64-byte seed w/7` entry, which only checks the Node reference's HKDF and
scalar reduction on a longer input. It is not a valid input: the library refuses it with
`seed-wrong-length`):

```
seed        = 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20
info        = "2-nftgate wrap-w/0" = 322d6e66746761746520777261702d772f30
OKM         = 29d5fee1e32457c23d446e07b376f6966137118fc3a059c3c62304a9b262f3ad
              b87bdeaaa37911cbb8bf2423908d930b
d           = 12aac9fbad41554b1f3eff34d753de7e30e1afd2b84e8879a1a00002d9759c4c
public key  = 04511326a6fb9f78235c3d1653fa023e930fc410e0ff49504323651de43760c4f6
                bc0a9536fdc03180b0f010cedbea48cbedb9880a499dd5d96f569415fb8e739c
```

Vector `issuer reader n_C=000102…0f`:

```
seed        = 4142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f60
info        = "2-nftgate reader-000102030405060708090a0b0c0d0e0f"
d           = 3682152f69cba9142aee291ed6a21e6fe0d83a5936d22b47a067a70ec15588d0
public key  = 04ae20517417ed414a379f641b210742d510190d2be6a13b0e5cab0b3627e7cab9
                1b9660ae384556c32b85e758777b3108e0c5888c64c7a570615e875ad07ba7f7
```

## 3. The wrap of `k(e)` to a P-256 key

The wrapper generates a fresh ephemeral P-256 key pair `(e, E)` and a fresh 12-byte nonce for
every wrap, both from a CSPRNG. For recipient public key `R`:

```
Z    = x-coordinate of e·R                            (32 bytes: the ECDH shared secret,
                                                       what WebCrypto deriveBits(256) returns)
info = 0x01 ‖ E ‖ R                                   (1 + 65 + 65 = 131 bytes)
K    = HKDF-SHA256( IKM = Z, salt = "nftgate-wrap", info, L = 32 )
AAD  = 0x01 ‖ E                                       (66 bytes: the wrap's header)
C‖T  = AES-256-GCM( key = K, nonce, AAD, plaintext = k(e) )   (32-byte ciphertext, 16-byte tag)
wrap = 0x01 ‖ E ‖ nonce ‖ C ‖ T
```

**Salt.** ASCII `nftgate-wrap` (12 bytes), hex `6e6674676174652d77726170`.

**Info.** Not an ASCII string: the version byte `0x01`, then the ephemeral public key `E`, then
the recipient public key `R`, both 65-byte uncompressed. Binding both public keys (as HPKE's
KEM context does) ties the AES key to this recipient and this ephemeral key: a wrap cannot be
presented as addressed to another key, and substituting `E` changes `K`. The label lives in the
salt; the version byte in the info means a later format can never derive the same key.

**AAD.** The header, `0x01 ‖ E`, so every byte of the wrap is authenticated (the nonce is
authenticated by GCM itself). The wrap does **not** bind `c(e)` or the record type: a wrap
travels in `G`, `M`, `TR`, `R`, `R+`, `W2` and `IW2`, and the stronger check is done on the
opened key itself. A client that opens a wrap MUST check that `SHA-256("nftgate-epoch" ‖ k)`
equals the commitment the record declares for that key, and refuse the wrap otherwise; that
proves the key, not only the context.

| Offset | Length | Field |
|-------:|-------:|-------|
| 0 | 1 | format version `0x01` |
| 1 | 65 | ephemeral public key `E`, uncompressed |
| 66 | 12 | nonce |
| 78 | 32 | AES-256-GCM ciphertext of `k(e)` |
| 110 | 16 | GCM tag |
| | **126** | total |

**Opening**, and the refusals in the order they are checked:

1. empty → `malformed-length`;
2. byte 0 is not `0x01` → `unknown-version` (checked before the length, so a later version may
   have another length);
3. length is not 126 → `malformed-length`;
4. `E` is not a P-256 point (§2's check) → `not-p256-public-key`;
5. `R` is recomputed from the recipient's own private key; `K` as above; the GCM tag does not
   verify → `authentication-failed`. A wrap opened with the wrong recipient key fails here,
   because both `Z` and the info differ.

**A wrap to a secp256k1 key is malformed** (R4.2.14: "a wrap addressed to a secp256k1 key is
malformed"). A wrapper refuses to build a wrap whose recipient key is not a 65-byte P-256 point
(`not-p256-public-key`). A reader that finds a wrap declared to a secp256k1 key treats that wrap
as **missing**, not as grounds to refuse the record: the reader shows "access pending" for that
epoch (AC-4.2.13-1: a wrap addressed to the owner key instead "is treated as missing, producing
'access pending'"), and the rest of the record is still read. The test is the same as above: a
secp256k1 key in the 33-byte compressed form owner keys use fails on length and prefix; an
uncompressed secp256k1 point fails the P-256 curve equation (WebCrypto's
`importKey('raw', …, P-256)` rejects it too). A wrap whose ephemeral key is a secp256k1 point is
refused at step 4 of opening, as any wrap that does not open: to the reader it is a wrap it
cannot open, so it too counts as missing.

Vector `k0 to holder A w/0` (more in the fixture's `wrap`, including one to the issuer reader
key; the fixture also gives `Z`, the info and `K` for each):

```
R     = 04511326a6fb9f78235c3d1653fa023e930fc410e0ff49504323651de43760c4f6
          bc0a9536fdc03180b0f010cedbea48cbedb9880a499dd5d96f569415fb8e739c
e     = 1112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f30
nonce = c0c1c2c3c4c5c6c7c8c9cacb
k(e)  = 808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f
Z     = 115853485a0781e4285e30f53e51531570a0ecd780a1310c87f8e36bfb7d27b8
K     = bd5fb3353a5fb4ec7853d8646df604002352ac44d21e223579b405695fecb8de
wrap  = 01
        044c6336e3b8b3de771b613a1c7a1734834cd69c1a4f5ffecb240c63bc0ddb1574
          f6896c5d14ca44e0037791c2300333259a71b901e5258575d107e5b8ac48b424
        c0c1c2c3c4c5c6c7c8c9cacb
        04f8360824d3a9eb6723c2411886261ac9115ca9191f5e9a58a53cfcea171522
        aedc62f97d0feabba839683304b5a6c6
```

## 4. The `W` payload encryption under `k(e)`

A `W` record's §3.8 field 5 is:

```
AAD     = "nftgate-payload" ‖ 0x01 ‖ len(type) ‖ type ‖ c(e)
C‖T     = AES-256-GCM( key = k(e), nonce, AAD, plaintext )
payload = 0x01 ‖ nonce ‖ C ‖ T
```

**Key.** `k(e)` itself is the AES-256-GCM key, as §3.4 already uses `k(e+1)` directly for the
backward link. Uses of the same key are separated by their AAD label.

**Nonce.** 12 bytes, fresh from a CSPRNG for every payload. Random 96-bit nonces are safe for up
to 2³² messages under one key (NIST SP 800-38D §8.3); that budget is shared, see "Open points"
below.

**AAD**, 50 bytes for `W`:

| Offset | Length | Field | Value for `W` |
|-------:|-------:|-------|---------------|
| 0 | 15 | label | ASCII `nftgate-payload`, hex `6e6674676174652d7061796c6f6164` |
| 15 | 1 | payload format version | `0x01` |
| 16 | 1 | length of the record type | `0x01` |
| 17 | 1 | record type, ASCII (§3.8 field 2) | `W` = `0x57` |
| 18 | 32 | `c(e)` (§3.8 field 3) | the commitment of the key used |

Bound, and why: the **record type**, so a ciphertext cannot be moved into a record of another
type encrypted under the same key (the length byte keeps multi-character types such as `TR`
unambiguous); **`c(e)`**, so the record's declared epoch cannot be changed without breaking the
tag; the **label**, to separate this use of `k(e)` from the backward link and any later use; the
**version**, so a later format never opens as this one. Not bound: the license origin (it must
not appear in plaintext, R4.3.4, and the record is already authorised by the token spend that
carries it) and the value manifest (§3.8 field 4, fee plumbing built at consolidation; binding
it would couple payload encryption to fuel accounting).

| Offset | Length | Field |
|-------:|-------:|-------|
| 0 | 1 | payload format version `0x01` |
| 1 | 12 | nonce |
| 13 | *m* | AES-256-GCM ciphertext of the plaintext |
| 13 + *m* | 16 | GCM tag |
| | 29 + *m* | total |

**Plaintext** of a `W`: today's payload, the UTF-8 bytes of `JSON.stringify({ text, ts })`: keys
`text` then `ts`, no whitespace, `ts` an ISO-8601 timestamp. No license origin.

**Opening**, and the refusals in order: empty → `malformed-length`; byte 0 is not `0x01` →
`unknown-version`; shorter than 29 bytes → `malformed-length`; GCM tag does not verify (tampered
bytes, wrong `k(e)`, another `c(e)` or record type in the AAD) → `authentication-failed`.

Vector `W under k0` (the fixture has a second, with non-ASCII text):

```
k(e)      = 808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f
c(e)      = 32b8802d37bb1d8665e41989bd52d09bfb93cce197a9cf1d8859b19e2b0f6f15
nonce     = f0f1f2f3f4f5f6f7f8f9fafb
plaintext = {"text":"hello","ts":"2026-09-30T00:00:00.000Z"}
AAD       = 6e6674676174652d7061796c6f6164 01 01 57
            32b8802d37bb1d8665e41989bd52d09bfb93cce197a9cf1d8859b19e2b0f6f15
payload   = 01
            f0f1f2f3f4f5f6f7f8f9fafb
            861cf0411cb3180adc614d5e6221a961484e61ee6a8916ede729ed433a7147b0
            f0ffaed11d222bacbf1cae6a6e935e87
            10c0b5166bee9b000a9ec8dc4d7d757a       (48-byte ciphertext, then the tag: 77 bytes)
```

## Negative vectors

The fixture's `negative` list gives each input with its expected refusal: a 31-byte seed
(`seed-too-short`; the library also refuses a 64-byte or 33-byte seed with `seed-wrong-length`, tested in `tests/unit/bsv-epoch-crypto.test.ts`); a wrap to secp256k1's generator G, uncompressed and 33-byte compressed
(`not-p256-public-key`); a wrap with a tampered tag, a tampered ciphertext, or opened with the
wrong recipient key (`authentication-failed`); a wrap with version byte `0x02`
(`unknown-version`); a wrap whose ephemeral key is a secp256k1 point (`not-p256-public-key`); a
125-byte wrap (`malformed-length`); a `W` payload with a tampered tag, opened under another
`c(e)`, as another record type, or under the wrong `k(e)` (`authentication-failed`); a payload
with version byte `0x02` (`unknown-version`); a 28-byte payload (`malformed-length`).

## Sizes against the spec's estimates

The spec's cost figures were written before the wire formats were pinned. The pinned sizes are:

| Item | Pinned | Spec's estimate |
|------|-------:|-----------------|
| One wrap (§3) | **126 B** (1 + 65 + 12 + 32 + 16) | "~110 B per wrap" (§6, Rotation Record) |
| A P-256 public key in a record (§2) | **65 B** | "≈ 33 B per transfer" (§6, Key separation) |
| `W` payload overhead (§4) | 29 B + plaintext | — |

Recomputed (the spec is the Governor's and is not edited here; its figures need restating at its
next revision):

- **A rotation costs about 15% more per holder**: 126 B against 110 B per wrap. At the §6 policy
  of 100 sat/kB a wrap costs about 12.6 sat.
- **`WRAP_MAX`** (spec §3 parameters, 1,000,000 B "≈ 9,000 wraps"): 1,000,000 / 126 = 7,936, so
  **≈ 7,900 wraps** per payment-funded transaction (the 9,000 figure is 1,000,000 / 110 = 9,090,
  rounded down).
- **Gift rotation under `FEE_CAP`**: the spec's "≈ 90 wraps per transaction" is the wrap-byte
  budget 90 × 110 B = 9,900 B; the same budget holds 9,900 / 126 = 78.6, so **≈ 78 wraps** (fixed
  transaction overhead unchanged). The issuer's reader-key wrap is one of them (R4.2.3), so that
  is about 77 other holders.
- **Key separation per transfer**: the wrap key declared in `M` / `TR` is the 65-byte
  uncompressed point, **65 B** against "≈ 33 B"; 32 B more per transfer. Nothing per write, as
  before. The same 65 B applies to the reader key carried in `G` and `K`. (This figure is the
  key alone; any field framing is pinned with the records.)

## Open points

- **One nonce budget per epoch.** §3.4 uses `k(e)` directly as the AES-256-GCM key for `W`
  payloads (§4), for the backward link `L(e)` and for the merge `MG`, each with a random 12-byte
  nonce. Random-nonce GCM is bounded at 2³² invocations **per key** (NIST SP 800-38D §8.3), so
  those uses share one 2³²-message budget per epoch, not one each. It is far above any realistic
  epoch's writes, but it is one budget; the pinned `L(e)` and `MG` formats (below) must count
  against it, and a client must not exceed it (rotation resets it).
- **Non-extractable keys.** The non-extractable claim in the library-choice section is limited
  to the imported `CryptoKey`: the scalar is in the JS heap while it is derived.

## Not pinned yet

- **The backward link `L(e)`'s AAD** (§3.4: `L(e) = nonce ‖ AES-256-GCM(k(e+1), nonce, k(e))`).
  Its AAD, and whether it carries a version byte, are pinned with the rotation records
  (`R`, `R+`, the rotation part of `TR`). It must not begin with the label `nftgate-payload`.
- **The merge HKDF parameters** (§3.4, `k_merge = HKDF-SHA256(k_1 ‖ … ‖ k_n, info = "nftgate-merge")`):
  its salt, output length and exact info bytes are pinned with the fork merge (`MG`, R4.2.7).
- **The stamp serialization** (§3.10): the byte format of `n_C`, the record type, the prevouts
  and `bound`, and the ECDSA signature encoding, pinned with the issuer stamp (`M`, `IW2`, `K`,
  `B`, `V`).
- The layout of the records that carry these structures (how many wraps a rotation carries and
  in what order, where the wrap public key sits in `M` and `TR`), and §3.8 field 3 in
  `src/bsv/record.ts`: pinned by the stories that build those records.
