import { afterEach, describe, expect, it, vi } from 'vitest';
import { googleGeminiImageProvider, normalizeGoogleGeminiImageResponse } from './google-gemini-image-provider';
import type { MediaAsset } from '../../types';

describe('normalizeGoogleGeminiImageResponse', () => {
  it('returns the first inline image as a data URL', () => {
    const result = normalizeGoogleGeminiImageResponse({
      candidates: [{
        content: {
          parts: [
            { text: 'Generated image:' },
            { inlineData: { mimeType: 'image/webp', data: 'abc123' } },
          ],
        },
      }],
    });

    expect(result).toEqual({
      url: 'data:image/webp;base64,abc123',
      mimeType: 'image/webp',
    });
  });
});

describe('googleGeminiImageProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests generateContent with prompt and reference images', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ inlineData: { mimeType: 'image/png', data: 'generated' } }],
          },
        }],
      }),
    } as Response);

    const reference: MediaAsset = {
      id: 'asset-1',
      projectId: 'project-1',
      kind: 'character_reference_image',
      url: 'data:image/png;base64,reference',
      mimeType: 'image/png',
      createdAt: 1,
    };

    const result = await googleGeminiImageProvider.generateImage({
      panelId: 'panel-1',
      prompt: 'A cinematic panel',
      negativePrompt: 'low quality',
      width: 1024,
      height: 1024,
      seed: 123,
      referenceImages: [reference],
      referenceImageLabels: ['image 1 = hero reference'],
      providerConfig: {
        providerId: 'google-gemini-image',
        baseUrl: 'https://generativelanguage.googleapis.com/v1',
        apiKey: 'gemini-token',
        model: 'gemini-3.1-flash-image',
      },
    });

    expect(result.url).toBe('data:image/png;base64,generated');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': 'gemini-token',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'A cinematic panel\n\nNegative prompt: low quality\n\nReference image bindings:\nimage 1 = hero reference' },
              { inline_data: { mime_type: 'image/png', data: 'reference' } },
            ],
          }],
        }),
      }),
    );
  });
});
