// src/features/device-key/create-device-key.ts — Creates and saves this device's key (one wallet row).

import { v4 as uuidv4 } from 'uuid';
import { PrivateKey } from '@bsv/sdk';
import { generateTestnetKey } from '../../bsv';
import { bsvWalletRepo } from '../../data/repositories';
import { posternApi } from '../../grist';
import type { BsvWalletKey } from '../../contracts/types';

/**
 * Asks the factory who this key is, once, so its first licence walk happens now and not on the child's first tutor
 * turn (the backend caches the walk). Fire and forget: offline, a refusal or anything else is swallowed.
 */
function warmLicence(material: string, fetchImpl?: typeof fetch): void {
  try {
    posternApi(PrivateKey.fromWif(material), fetchImpl)
      .me()
      .catch(() => undefined);
  } catch {
    // Nothing here may reach the child.
  }
}

/**
 * Generates a fresh testnet key, saves it as the device wallet row, and returns it. Works fully offline; once saved,
 * it calls GET /api/me in the background to warm the factory's licence cache for the key.
 */
export async function createDeviceKey(fetchImpl?: typeof fetch): Promise<BsvWalletKey> {
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
  warmLicence(key.material, fetchImpl);
  return key;
}
