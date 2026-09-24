// src/bsv/buffer-stub.ts — scrypt-ts's contract.js (checkSig) and its scryptlib/@scrypt-inc/bsv
// dependencies call the bare global Buffer.from(...), a handful of instance readers/writers
// and Buffer.isBuffer(...) while deserializing a License locking script
// (License.fromLockingScript, via @scrypt-inc/bsv's Script.fromHex), registering its own
// network constants at module load, and running the interpreter (checkSig, hash opcodes).
// There is no `Buffer` global in a real browser, so those calls throw "Buffer is not defined"
// (mw-yo97u.13, after mw-yo97u.11's `process` and mw-yo97u.12's `events`). This stand-in is a
// real Uint8Array subclass — not the 'buffer' npm polyfill — so `instanceof`/`ArrayBuffer`
// checks inside that bundle keep working; it covers only the surface a full mint, write and
// transfer of a License+Fuel token were found (by instrumenting a real Buffer through that same
// path, and by reading the real Chromium build's own stack traces) to actually call.

const HEX_DIGITS = '0123456789abcdef';

function hexToBytes(hex: string): number[] {
  if (hex.length % 2 !== 0) throw new Error(`BufferStub: odd-length hex string "${hex}"`);
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) throw new Error(`BufferStub: invalid hex string "${hex}"`);
    bytes.push(byte);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += HEX_DIGITS[byte >> 4] + HEX_DIGITS[byte & 0xf];
  return out;
}

export class BufferStub extends Uint8Array {
  // scryptlib vendors its own copy of the 'buffer' npm package (Parcel's browser-target
  // bundling of its own dist); that copy's Buffer.isBuffer checks this `_isBuffer` marker
  // instead of `instanceof` — the ecosystem's own convention for recognizing a Buffer-like
  // object across separately bundled copies of 'buffer'. Without it, its own BufferReader
  // (used to parse a License's serialized state) silently mis-reads a stand-in without this
  // marker as a plain options object instead of a byte buffer, then crashes reading past it:
  // "Cannot read properties of undefined (reading 'readUInt8')" (mw-yo97u.13).
  readonly _isBuffer = true;

  static isBuffer(value: unknown): value is BufferStub {
    return value instanceof BufferStub;
  }

  // Deliberately wider than Uint8Array's own overloaded `from`: scrypt-ts's dependencies call
  // this with a (string, encoding) pair that class static member has no overload for.
  static from(value: unknown, encodingOrOffset?: unknown, length?: unknown): BufferStub {
    if (typeof value === 'string') {
      const encoding = (encodingOrOffset as string | undefined) ?? 'utf8';
      const bytes = encoding === 'hex' ? hexToBytes(value) : Array.from(new TextEncoder().encode(value));
      return new BufferStub(bytes);
    }
    if (value instanceof ArrayBuffer) {
      return new BufferStub(value, encodingOrOffset as number | undefined, length as number | undefined);
    }
    return new BufferStub(value as ArrayLike<number>);
  }

  static alloc(size: number): BufferStub {
    return new BufferStub(size);
  }

  static allocUnsafe(size: number): BufferStub {
    return new BufferStub(size);
  }

  static allocUnsafeSlow(size: number): BufferStub {
    return new BufferStub(size);
  }

  static concat(list: Uint8Array[], totalLength?: number): BufferStub {
    const length = totalLength ?? list.reduce((sum, item) => sum + item.length, 0);
    const out = new BufferStub(length);
    let offset = 0;
    for (const item of list) {
      if (offset >= length) break;
      const chunk = item.subarray(0, Math.min(item.length, length - offset));
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  toString(encoding = 'utf8', start = 0, end = this.length): string {
    const slice = this.subarray(start, end);
    return encoding === 'hex' ? bytesToHex(slice) : new TextDecoder().decode(slice);
  }

  slice(start?: number, end?: number): BufferStub {
    return this.subarray(start, end) as BufferStub;
  }

  copy(target: Uint8Array, targetStart = 0, sourceStart = 0, sourceEnd = this.length): number {
    const source = this.subarray(sourceStart, sourceEnd);
    target.set(source, targetStart);
    return source.length;
  }

  compare(other: Uint8Array): number {
    const length = Math.min(this.length, other.length);
    for (let i = 0; i < length; i++) {
      if (this[i] !== other[i]) return this[i] < other[i] ? -1 : 1;
    }
    if (this.length === other.length) return 0;
    return this.length < other.length ? -1 : 1;
  }

  readUInt8(offset = 0): number {
    return this[offset];
  }

  readUInt16LE(offset = 0): number {
    return this[offset] | (this[offset + 1] << 8);
  }

  readUInt32LE(offset = 0): number {
    return (this[offset] | (this[offset + 1] << 8) | (this[offset + 2] << 16) | (this[offset + 3] << 24)) >>> 0;
  }

  readInt32LE(offset = 0): number {
    return this[offset] | (this[offset + 1] << 8) | (this[offset + 2] << 16) | (this[offset + 3] << 24);
  }

  writeUInt32BE(value: number, offset = 0): number {
    this[offset] = (value >>> 24) & 0xff;
    this[offset + 1] = (value >>> 16) & 0xff;
    this[offset + 2] = (value >>> 8) & 0xff;
    this[offset + 3] = value & 0xff;
    return offset + 4;
  }
}

/**
 * Installs a minimal browser stand-in for the Node `Buffer` global, only when one is not
 * already present, the same way installProcessStub does for `process`.
 */
export function installBufferStub(): void {
  if (typeof globalThis.Buffer !== 'undefined') return;
  (globalThis as { Buffer?: unknown }).Buffer = BufferStub;
}
