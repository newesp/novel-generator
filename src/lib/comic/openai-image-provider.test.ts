import { describe, expect, it } from 'vitest';
import { normalizeOpenAIImageResponse } from './openai-image-provider';

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
