import type { LLMConfig, LLMProvider } from '../types';

export const LLM_PROVIDER_DEFAULTS: Record<LLMProvider, { name: string; baseUrl: string; model: string }> = {
  custom: { name: 'My API', baseUrl: '', model: 'gpt-4o' },
  google: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
  },
  grok: {
    name: 'Grok (xAI)',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-2-latest',
  },
};

export const LLM_PROVIDER_LABELS: Record<LLMProvider, string> = {
  custom: '自定義（OpenAI-compatible）',
  google: 'Google Gemini',
  grok: 'Grok (xAI)',
};

export function applyLlmProviderDefaults(config: LLMConfig, provider: LLMProvider): LLMConfig {
  const defaults = LLM_PROVIDER_DEFAULTS[provider];
  return {
    ...config,
    provider,
    name: defaults.name,
    baseUrl: defaults.baseUrl,
    model: defaults.model,
  };
}
