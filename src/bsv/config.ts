// src/bsv/config.ts — Central BSV chain configuration.
// The only place network, provider, anchor address and fee rate are defined.

export interface ChainConfig {
  network: 'testnet' | 'mainnet';
  providerBaseUrl: string;
  anchorAddress: string;
  feeRateSatPerKb: number;
  collectionId: string;
  /**
   * MINT_FUEL: the satoshis a License + Fuel mint puts in Fuel(C) at output 1 (mw-yo97u.3).
   * Separate from V_MIN (§3.9's TopUp floor). Unset here: its production value is open
   * against spec R4.1.3, and the app refuses to mint while it is unset or under 2 × FEE_CAP.
   */
  mintFuelSatoshis?: number;
}

export const chainConfig: ChainConfig = {
  network: 'testnet',
  providerBaseUrl: 'https://api.whatsonchain.com/v1/bsv/test',
  anchorAddress: '',
  feeRateSatPerKb: 1,
  collectionId: 'spellforge-leaderboard-testnet',
};
