import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeOpenAIImageResponse, openAICompatibleImageProvider } from './openai-image-provider';

describe('normalizeOpenAIImageResponse', () => {
  it('returns data URLs for base64 responses', () => {
    const result = normalizeOpenAIImageResponse({
      data: [{ b64_json: 'abc123' }],
    });

    expect(result.url).toBe('data:image/png;base64,abc123');
    expect(result.mimeType).toBe('image/png');
  });

  it('returns remote URLs for URL responses', () => {
    const result = normalizeOpenAIImageResponse({
      data: [{ url: 'https://example.test/image.webp' }],
    });

    expect(result.url).toBe('https://example.test/image.webp');
    expect(result.mimeType).toBe('image/webp');
  });
});

describe('openAICompatibleImageProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests a single base64 image for OpenAI-compatible providers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'abc123' }] }),
    } as Response);

    await openAICompatibleImageProvider.generateImage({
      panelId: 'panel-1',
      prompt: 'A cinematic panel',
      width: 1024,
      height: 1024,
      providerConfig: {
        providerId: 'openai-compatible-image',
        baseUrl: 'https://api.deepinfra.com/v1/openai',
        apiKey: 'deepinfra-token',
        model: 'stabilityai/sdxl-turbo',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepinfra.com/v1/openai/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer deepinfra-token',
        }),
        body: JSON.stringify({
          model: 'stabilityai/sdxl-turbo',
          prompt: 'A cinematic panel',
          size: '1024x1024',
          n: 1,
          response_format: 'b64_json',
        }),
      }),
    );
  });
});
