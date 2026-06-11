import { describe, expect, it } from 'vitest';
import { getImageProvider, listImageProviders } from './providers';

describe('image provider registry', () => {
  it('exposes configured image providers', () => {
    expect(listImageProviders().map((provider) => provider.id)).toEqual([
      'comfyui',
      'openai-compatible-image',
      'deepinfra-flux',
      'google-gemini-image',
    ]);
    expect(getImageProvider('comfyui')?.kind).toBe('local');
    expect(getImageProvider('openai-compatible-image')?.kind).toBe('online');
    expect(getImageProvider('deepinfra-flux')?.capabilities.referenceMode).toBe('multi-reference');
    expect(getImageProvider('google-gemini-image')?.capabilities.maxReferenceImages).toBe(14);
  });
});
