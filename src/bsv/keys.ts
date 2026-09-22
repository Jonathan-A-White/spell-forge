// src/bsv/keys.ts — Testnet key generation for the phase-1 BSV Debug screen.

import { PrivateKey } from '@bsv/sdk';
import { chainConfig } from './config';

const TESTNET_WIF_PREFIX = [0xef];
const TESTNET_ADDRESS_PREFIX = [0x6f];

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
