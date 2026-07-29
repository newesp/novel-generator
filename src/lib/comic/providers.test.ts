import { describe, expect, it } from 'vitest';
import { getImageProvider, listImageProviders, localizeImageProviderMessage } from './providers';

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

  it('localizes provider diagnostics for the interface without changing Chinese output', () => {
    expect(localizeImageProviderMessage('缺少 API Key', 'en')).toBe('Missing API Key');
    expect(localizeImageProviderMessage('ComfyUI workflow 缺少 node 12', 'en'))
      .toBe('ComfyUI workflow is missing node 12');
    expect(localizeImageProviderMessage('缺少 API Key', 'zh-TW')).toBe('缺少 API Key');
  });
});
