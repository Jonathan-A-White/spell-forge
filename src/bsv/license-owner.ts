// src/bsv/license-owner.ts — Reads the current owner's public key out of a compiled
// License locking script, without depending on scrypt-ts at runtime (mw-5wuz6.5).
//
// scrypt-ts appends a stateful contract's mutable @prop(true) fields after the compiled
// code, which itself ends in OP_RETURN (0x6a):
//   codePart(...OP_RETURN) + state + stateLen(4 bytes, LE) + version(1 byte)
// License declares exactly one stateful prop, ownerPubKey, so state is just a fixed
// 1-byte flag (always 0x00) followed by ownerPubKey as a VarInt-length-prefixed push
// (scrypt-ts/dist/smart-contract/builtins/functions.js: VarIntWriter.writeBytes /
// serializeState). Confirmed against a real locking script built through the committed
// artifact's bridge (src/bsv/contracts/bridge/license-bridge.ts).
const VERSION_LEN = 1;
const STATE_LEN_LEN = 4;
const COMPRESSED_PUBKEY_HEX_LEN = 66; // 33 bytes

function isHex(value: string): boolean {
  return value.length % 2 === 0 && /^[0-9a-f]*$/i.test(value);
}

function readLittleEndianUint(hex: string): number {
  let value = 0;
  for (let i = hex.length - 2; i >= 0; i -= 2) {
    value = value * 256 + parseInt(hex.slice(i, i + 2), 16);
  }
  return value;
}

/** Reads a VarInt-length-prefixed push (VarIntWriter.writeBytes) at the start of `hex`. */
function readVarIntPush(hex: string): string | null {
  if (hex.length < 2) return null;
  const header = parseInt(hex.slice(0, 2), 16);
  let length: number;
  let headerBytes: number;
  if (header < 0x4c) {
    length = header;
    headerBytes = 1;
  } else if (header === 0x4c && hex.length >= 4) {
    length = parseInt(hex.slice(2, 4), 16);
    headerBytes = 2;
  } else if (header === 0x4d && hex.length >= 6) {
    length = readLittleEndianUint(hex.slice(2, 6));
    headerBytes = 3;
  } else if (header === 0x4e && hex.length >= 10) {
    length = readLittleEndianUint(hex.slice(2, 10));
    headerBytes = 5;
  } else {
    return null;
  }
  const data = hex.slice(headerBytes * 2, headerBytes * 2 + length * 2);
  return data.length === length * 2 ? data : null;
}

/**
 * The compressed owner public key (hex) a License locking script's state carries, or null
 * if `lockingScriptHex` is not shaped like a scrypt-ts stateful script with a single
 * PubKey state prop.
 */
export function ownerPubKeyFromLicenseLockingScript(lockingScriptHex: string): string | null {
  const hex = lockingScriptHex.toLowerCase();
  if (!isHex(hex)) return null;
  const totalBytes = hex.length / 2;
  if (totalBytes < VERSION_LEN + STATE_LEN_LEN) return null;

  const stateLenStart = totalBytes - VERSION_LEN - STATE_LEN_LEN;
  const stateLenHex = hex.slice(stateLenStart * 2, (stateLenStart + STATE_LEN_LEN) * 2);
  const stateLen = readLittleEndianUint(stateLenHex);

  const stateStart = stateLenStart - stateLen;
  if (stateStart < 0 || stateLen < 1) return null;
  const stateHex = hex.slice(stateStart * 2, stateLenStart * 2);

  // The 1-byte flag scrypt-ts always writes ahead of a stateful contract's props.
  const pubKeyHex = readVarIntPush(stateHex.slice(2));
  return pubKeyHex && pubKeyHex.length === COMPRESSED_PUBKEY_HEX_LEN ? pubKeyHex : null;
}
