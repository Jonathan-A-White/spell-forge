// src/bsv/config.ts — Central BSV chain configuration.
// The only place network, provider, anchor address and fee rate are defined.

export interface ChainConfig {
  network: 'testnet' | 'mainnet';
  providerBaseUrl: string;
  anchorAddress: string;
  feeRateSatPerKb: number;
  collectionId: string;
}

export const chainConfig: ChainConfig = {
  network: 'testnet',
  providerBaseUrl: 'https://api.whatsonchain.com/v1/bsv/test',
  anchorAddress: '',
  feeRateSatPerKb: 1,
  collectionId: 'spellforge-leaderboard-testnet',
};
