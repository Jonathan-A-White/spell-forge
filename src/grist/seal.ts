// src/grist/seal.ts — BRC-78 sealing for a grist (docs/protocol.md §2): the plaintext, each photo and the
// mill's answer are all EncryptedMessage bytes, the same primitive postern's own services/messages.ts uses.

import { EncryptedMessage, PrivateKey, PublicKey, Utils } from '@bsv/sdk';

/** BRC-78's header: version(4) || senderPubKey(33) || recipientPubKey(33) || keyID(32) || AES-GCM ciphertext. */
const SENDER_OFFSET = 4;
const PUBLIC_KEY_BYTES = 33;

/** Seals bytes from `from` to `to`: only the holder of `to`'s private key opens them. */
export function sealBytes(bytes: Uint8Array | number[], from: PrivateKey, to: PublicKey): number[] {
  return EncryptedMessage.encrypt(Array.from(bytes), from, to);
}

/** Seals UTF-8 text and base64-encodes it: a section 1 envelope's `ct`. */
export function sealText(text: string, from: PrivateKey, to: PublicKey): string {
  return Utils.toBase64(sealBytes(Utils.toArray(text, 'utf8'), from, to));
}

/**
 * Opens a base64 `ct` with `recipient`, and says who sealed it: the sender's key as BRC-78 carries it in the
 * header. Decryption succeeds only for a sender who held the matching private key, so a header naming the
 * mill is the mill. Null when it does not open.
 */
export function openText(ct: string, recipient: PrivateKey): { text: string; sender: string } | null {
  try {
    const bytes = Utils.toArray(ct, 'base64');
    const sender = Utils.toHex(bytes.slice(SENDER_OFFSET, SENDER_OFFSET + PUBLIC_KEY_BYTES));
    const text = Utils.toUTF8(EncryptedMessage.decrypt(bytes, recipient));
    return { text, sender };
  } catch {
    return null;
  }
}
