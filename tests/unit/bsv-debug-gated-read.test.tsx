// mw-jeswf.5: the BSV Debug screen writes an encrypted record with a License token and reads
// it back 'as This device' (the text) or 'as A different key' ('cannot read'). The chain seam
// is an in-memory provider that serves the fixture wallet's funding transaction and keeps
// whatever the screen broadcasts; the mint and the write run the real builders and the real
// crypto, so the W read here is a real gated W.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { Transaction } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { bsvWalletRepo, bsvTokenRepo } from '../../src/data/repositories';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { BsvWalletKey } from '../../src/contracts/types';
import { mintOwnersPreGatingLicense, wallet } from '../fixtures/bsv/license-contract-chain';

const SLOW = { timeout: 30_000 };

const storedKey: BsvWalletKey = {
  id: 'wallet-1',
  kind: 'wif',
  network: 'testnet',
  material: wallet.owner.wif,
  address: wallet.owner.address,
  createdAt: new Date('2026-01-01'),
};

/** Serves the funding transaction and every transaction the screen broadcasts. */
function makeChain(extraTransactions: Transaction[] = []): ChainProvider {
  const known = new Map<string, string>([[wallet.mintFundingTx.txid, wallet.mintFundingTx.hex]]);
  for (const transaction of extraTransactions) known.set(transaction.id('hex'), transaction.toHex());
  return {
    getUtxos: vi.fn().mockResolvedValue([
      { txid: wallet.mintFundingTx.txid, vout: wallet.mintFundingTx.vout, satoshis: wallet.mintFundingTx.satoshis },
    ]),
    getTransactionHex: vi.fn(async (txid: string) => {
      const hex = known.get(txid);
      if (!hex) throw new Error(`unexpected txid ${txid}`);
      return hex;
    }),
    broadcast: vi.fn(async (hex: string) => {
      const txid = Transaction.fromHex(hex).id('hex');
      known.set(txid, hex);
      return txid;
    }),
    getAddressHistory: vi.fn().mockResolvedValue([]),
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('BsvDebugScreen gated read', () => {
  it('reads a License write as This device (the text) and as A different key (cannot read)', async () => {
    await bsvWalletRepo.save(storedKey);
    const provider = makeChain();

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    await screen.findByText(/^Balance: \d+ sat/);
    fireEvent.click(screen.getByLabelText('License'));
    fireEvent.click(screen.getByRole('button', { name: 'Mint token' }));
    const entry = await screen.findByTestId('bsv-token-entry', {}, SLOW);

    fireEvent.change(within(entry).getByLabelText('Write with token'), { target: { value: 'hello gated' } });
    fireEvent.click(within(entry).getByRole('button', { name: 'Write with token' }));
    const writeTxid = (await within(entry).findByTestId('bsv-token-write-txid', {}, SLOW)).textContent ?? '';
    expect(writeTxid).toMatch(/^[0-9a-f]{64}$/);

    fireEvent.change(screen.getByLabelText('Read by txid'), { target: { value: writeTxid } });

    // The device is the default reader.
    expect(screen.getByLabelText('This device')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    await waitFor(() => expect(screen.getByTestId('bsv-read-text')).toHaveTextContent('hello gated'), SLOW);
    expect(screen.queryByText(/^cannot read/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('A different key'));
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    await waitFor(() => expect(screen.getByText(/^cannot read/)).toBeInTheDocument(), SLOW);
    expect(screen.queryByTestId('bsv-read-text')).not.toBeInTheDocument();
  }, 120_000);

  it("shows the library's 'minted before gated reading' message when a pre-gating token is written", async () => {
    await bsvWalletRepo.save(storedKey);
    const preGating = await mintOwnersPreGatingLicense();
    await bsvTokenRepo.put(preGating.token);
    const provider = makeChain([preGating.transaction]);

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    const entry = await screen.findByTestId('bsv-token-entry');
    fireEvent.change(within(entry).getByLabelText('Write with token'), { target: { value: 'hello' } });
    await waitFor(() => expect(within(entry).getByRole('button', { name: 'Write with token' })).toBeEnabled(), SLOW);
    fireEvent.click(within(entry).getByRole('button', { name: 'Write with token' }));

    await within(entry).findByText(/minted before gated reading/, {}, SLOW);
    expect(provider.broadcast).not.toHaveBeenCalled();
  }, 120_000);
});
