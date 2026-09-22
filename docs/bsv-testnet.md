# BSV testnet harness

Two scripts back the BSV Debug screen with real testnet keys, kept outside the repo.

- `npm run bsv:keys` — creates an issuer/holderA/holderB testnet key set if none exists yet, and prints the three addresses (never a WIF). Refuses to run again once the file exists, so a funded key can't be overwritten by accident.
- `npm run bsv:balance` — reads that key file and prints each address's balance in satoshis and UTXO count, fetched from WhatsOnChain.

The key file lives at `$SPELLFORGE_BSV_KEYS` if set, otherwise at `~/.config/spell-forge/bsv-testnet-keys.json` — outside the repo on purpose, so it is never committed and every worktree/clone on the host shares the same keys.

To fund the addresses for manual testing, try a testnet BSV faucet such as `witnessonchain.com/faucet/tbsv` or `testnet.help/en/bsvfaucet/testnet` (neither has been verified alive as of this writing — search for a current one if both are down).
