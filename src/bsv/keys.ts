// src/bsv/keys.ts — Testnet key generation for the phase-1 BSV Debug screen.

import { PrivateKey, PublicKey, Utils } from '@bsv/sdk';
import { chainConfig } from './config';

const TESTNET_WIF_PREFIX = [0xef];
const TESTNET_ADDRESS_PREFIX = [0x6f];
const P2PKH_HASH_BYTES = 20;

export interface GeneratedKey {
  network: typeof chainConfig.network;
  material: string;  // WIF
  address: string;
}

/** Generates a fresh testnet key pair. Works fully offline. */
export function generateTestnetKey(): GeneratedKey {
  const privateKey = PrivateKey.fromRandom();
  return {
    network: chainConfig.network,
    material: privateKey.toWif(TESTNET_WIF_PREFIX),
    address: privateKey.toAddress(TESTNET_ADDRESS_PREFIX),
  };
}

/** True if `address` base58check-decodes to a testnet P2PKH address. */
export function isValidTestnetAddress(address: string): boolean {
  try {
    const { prefix, data } = Utils.fromBase58Check(address);
    return prefix.length === 1 && prefix[0] === TESTNET_ADDRESS_PREFIX[0] && data.length === P2PKH_HASH_BYTES;
  } catch {
    return false;
  }
}

/** True if `hex` is a compressed public key (33 bytes, 02/03 prefix) — what a License owner key must be. */
export function isValidCompressedPublicKeyHex(hex: string): boolean {
  if (!/^0[23][0-9a-fA-F]{64}$/.test(hex)) return false;
  try {
    PublicKey.fromString(hex);
    return true;
  } catch {
    return false;
  }
}
