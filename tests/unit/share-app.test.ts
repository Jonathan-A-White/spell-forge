// share-app (12e): SpellForge shared out over src/share/share-out.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareApp } from '../../src/shell/share-app';
import { appLink } from '../../src/share/share-out';

afterEach(() => vi.unstubAllGlobals());

describe('shareApp', () => {
  it('calls navigator.share with the app link when the phone has a share sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } });
    expect(await shareApp()).toBe('shared');
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: appLink() }));
  });

  it('falls back to copying the link without a share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await shareApp()).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(appLink());
  });
});
