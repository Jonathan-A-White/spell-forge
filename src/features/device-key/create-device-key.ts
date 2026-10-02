// src/features/device-key/create-device-key.ts — Creates and saves this device's key (one wallet row).

import { v4 as uuidv4 } from 'uuid';
import { generateTestnetKey } from '../../bsv';
import { bsvWalletRepo } from '../../data/repositories';
import type { BsvWalletKey } from '../../contracts/types';

/** Generates a fresh testnet key, saves it as the device wallet row, and returns it. Works fully offline. */
export async function createDeviceKey(): Promise<BsvWalletKey> {
  const generated = generateTestnetKey();
  const key: BsvWalletKey = {
    id: uuidv4(),
    kind: 'wif',
    network: generated.network,
    material: generated.material,
    address: generated.address,
    createdAt: new Date(),
  };
  await bsvWalletRepo.save(key);
  return key;
}
