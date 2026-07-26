import type { LLMProfile, LLMProvider } from '../types';

export const LLM_PROVIDER_DEFAULTS: Record<
  LLMProvider,
  { name: string; baseUrl: string; model: string; temperature: number; maxTokens: number; timeoutSec: number }
> = {
  custom: { name: 'My API', baseUrl: '', model: 'gpt-4o', temperature: 0.7, maxTokens: 4096, timeoutSec: 120 },
  google: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
    temperature: 0.7,
    maxTokens: 4096,
    timeoutSec: 120,
  },
  grok: {
    name: 'Grok (xAI)',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-2-latest',
    temperature: 0.7,
    maxTokens: 4096,
    timeoutSec: 120,
  },
};

export const LLM_PROVIDER_LABELS: Record<LLMProvider, string> = {
  custom: '自定義（OpenAI-compatible）',
  google: 'Google Gemini',
  grok: 'Grok (xAI)',
};

export function createLLMProfile(provider: LLMProvider, overrides?: Partial<LLMProfile>): LLMProfile {
  const defaults = LLM_PROVIDER_DEFAULTS[provider];
  return {
    id: overrides?.id || `profile_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: overrides?.name || defaults.name,
    provider,
    baseUrl: overrides?.baseUrl ?? defaults.baseUrl,
    apiKey: overrides?.apiKey ?? '',
    model: overrides?.model || defaults.model,
    temperature: overrides?.temperature ?? defaults.temperature,
    maxTokens: overrides?.maxTokens ?? defaults.maxTokens,
    timeoutSec: overrides?.timeoutSec ?? defaults.timeoutSec,
  };
}

export function applyLlmProviderDefaults(profile: LLMProfile, provider: LLMProvider): LLMProfile {
  const defaults = LLM_PROVIDER_DEFAULTS[provider];
  return {
    ...profile,
    provider,
    name: defaults.name,
    baseUrl: defaults.baseUrl,
    model: defaults.model,
    temperature: profile.temperature ?? defaults.temperature,
    maxTokens: profile.maxTokens ?? defaults.maxTokens,
    timeoutSec: profile.timeoutSec ?? defaults.timeoutSec,
  };
}

