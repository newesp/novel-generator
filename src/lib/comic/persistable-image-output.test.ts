import { describe, expect, it, vi } from 'vitest';
import { persistableImageOutput } from './persistable-image-output';

describe('persistableImageOutput', () => {
  it('keeps data URLs unchanged', async () => {
    const fetcher = vi.fn();

    await expect(persistableImageOutput({
      url: 'data:image/png;base64,abc123',
      mimeType: 'image/png',
      fetcher,
    })).resolves.toEqual({
      url: 'data:image/png;base64,abc123',
      mimeType: 'image/png',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('downloads remote image URLs into data URLs before storing', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(
      new Uint8Array([1, 2, 3]),
      { status: 200, headers: { 'content-type': 'image/jpeg' } },
    ));

    await expect(persistableImageOutput({
      url: 'https://delivery.example.test/sample.jpeg?se=2026-06-10T16%3A27%3A57Z',
      mimeType: 'image/png',
      fetcher,
    })).resolves.toEqual({
      url: 'data:image/jpeg;base64,AQID',
      mimeType: 'image/jpeg',
    });
    expect(fetcher).toHaveBeenCalledWith('https://delivery.example.test/sample.jpeg?se=2026-06-10T16%3A27%3A57Z');
  });
});
