import { describe, expect, it } from 'vitest';
import type { LLMConfig } from '../types';
import { applyLlmProviderDefaults } from './llm-provider-defaults';

const savedGeminiConfig: LLMConfig = {
  id: 'default',
  provider: 'google',
  name: 'Google Gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  apiKey: 'secret-key',
  model: 'gemini-2.5-flash-lite',
  temperature: 0.7,
  maxTokens: 4096,
  timeoutSec: 120,
};

describe('applyLlmProviderDefaults', () => {
  it('resets provider-specific fields when switching from Google to Grok', () => {
    const next = applyLlmProviderDefaults(savedGeminiConfig, 'grok');

    expect(next).toMatchObject({
      id: 'default',
      provider: 'grok',
      name: 'Grok (xAI)',
      baseUrl: 'https://api.x.ai/v1',
      apiKey: 'secret-key',
      model: 'grok-2-latest',
    });
  });

  it('clears provider-specific endpoint when switching to custom', () => {
    const next = applyLlmProviderDefaults(savedGeminiConfig, 'custom');

    expect(next).toMatchObject({
      provider: 'custom',
      name: 'My API',
      baseUrl: '',
      apiKey: 'secret-key',
      model: 'gpt-4o',
    });
  });
});
