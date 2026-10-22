// Sharing SpellForge out: navigator.share where the phone has it, else the link is copied; closing the share sheet is not a failure; a refused copy
// hands back 'manual' for the screen to show the link selected.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appLink, shareOut } from '../../src/share/share-out';

const LINK = 'https://example.org/spell-forge/';
const data = { title: 'SpellForge', text: 'A spelling app', url: LINK };

function phone(parts: { share?: unknown; canShare?: unknown; writeText?: unknown }) {
  vi.stubGlobal('navigator', { share: parts.share, canShare: parts.canShare, clipboard: parts.writeText ? { writeText: parts.writeText } : undefined });
}

afterEach(() => vi.unstubAllGlobals());

describe('the app link', () => {
  it('is the origin with the base the app is served under', () => {
    expect(appLink('https://example.org')).toBe(`https://example.org${import.meta.env.BASE_URL}`);
  });
});

describe('sharing out', () => {
  it('calls navigator.share with the app link when the phone has a share sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    phone({ share, writeText });
    expect(await shareOut(data)).toBe('shared');
    expect(share).toHaveBeenCalledWith(data);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the link when the phone has no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    phone({ writeText });
    expect(await shareOut(data)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(LINK);
  });

  it('copies the link when canShare refuses the data', async () => {
    const share = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    phone({ share, canShare: () => false, writeText });
    expect(await shareOut(data)).toBe('copied');
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(LINK);
  });

  it('says nothing, and copies nothing, when the share sheet is closed again', async () => {
    const writeText = vi.fn();
    phone({ share: vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')), writeText });
    expect(await shareOut(data)).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to copying when the share sheet fails some other way', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    phone({ share: vi.fn().mockRejectedValue(new Error('no handler')), writeText });
    expect(await shareOut(data)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(LINK);
  });

  it("hands back 'manual' when the clipboard refuses too", async () => {
    phone({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    expect(await shareOut(data)).toBe('manual');
  });

  it("hands back 'manual' when the phone has neither a share sheet nor a clipboard", async () => {
    phone({});
    expect(await shareOut(data)).toBe('manual');
  });
});
