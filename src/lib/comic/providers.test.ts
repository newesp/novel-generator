import { describe, expect, it } from 'vitest';
import { getImageProvider, listImageProviders } from './providers';

describe('image provider registry', () => {
  it('exposes ComfyUI and OpenAI-compatible providers', () => {
    expect(listImageProviders().map((provider) => provider.id)).toEqual([
      'comfyui',
      'openai-compatible-image',
    ]);
    expect(getImageProvider('comfyui')?.kind).toBe('local');
    expect(getImageProvider('openai-compatible-image')?.kind).toBe('online');
  });
});
