import { describe, expect, it } from 'vitest';
import { buildDeepInfraFluxPayload, deepInfraFluxEndpoint, normalizeDeepInfraFluxResponse } from './deepinfra-flux-provider';

describe('DeepInfra FLUX provider helpers', () => {
  it('maps reference images to input_image fields without data URI prefixes', () => {
    const payload = buildDeepInfraFluxPayload({
      panelId: 'panel-1',
      prompt: 'A Fei repairs a relic',
      negativePrompt: 'bad hands',
      width: 1024,
      height: 1024,
      providerConfig: {
        providerId: 'deepinfra-flux',
        baseUrl: 'https://api.deepinfra.com/v1',
        apiKey: 'key',
        model: 'black-forest-labs/FLUX-2-pro',
      },
      referenceImages: [
        { id: 'asset-1', projectId: 'p1', kind: 'character_reference_image', url: 'data:image/png;base64,aaa', mimeType: 'image/png', createdAt: 1 },
        { id: 'asset-2', projectId: 'p1', kind: 'scene_reference_image', url: 'https://example.test/room.png', mimeType: 'image/png', createdAt: 1 },
      ],
    });

    expect(payload.input_image).toBe('aaa');
    expect(payload.input_image_2).toBe('https://example.test/room.png');
    expect(payload.negative_prompt).toBe('bad hands');
  });

  it('builds the model inference endpoint from the base API URL', () => {
    expect(deepInfraFluxEndpoint({
      providerId: 'deepinfra-flux',
      baseUrl: 'https://api.deepinfra.com/v1',
      apiKey: 'key',
      model: 'black-forest-labs/FLUX-2-pro',
    })).toBe('https://api.deepinfra.com/v1/inference/black-forest-labs/FLUX-2-pro');
  });

  it('normalizes base64 responses', () => {
    expect(normalizeDeepInfraFluxResponse({ images: ['abc'] })).toEqual({
      url: 'data:image/png;base64,abc',
      mimeType: 'image/png',
    });
  });
});
