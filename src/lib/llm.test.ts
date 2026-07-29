import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '../stores/settingsStore';
import { complete, completeNormalized, sanitizeApiKey, verifyLLMProfile } from './llm';
import { exportSettingsSnapshot, importSettingsSnapshot } from './settings-backup';
import type { LLMProfile } from '../types';

describe('complete and completeNormalized', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSettingsStore.getState().setLlmConfig({
      provider: 'google',
      name: 'Google Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'test-key',
      model: 'gemini-test',
    });
  });

  it('throws instead of returning truncated Gemini content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'MAX_TOKENS',
                content: { parts: [{ text: '{"panels":[{"panelNumber":1}' }] },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(complete('storyboard prompt', { responseFormat: 'json_object' })).rejects.toThrow('MAX_TOKENS');
  });

  it('requests Gemini JSON mode when responseFormat is json_object', async () => {
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: '{"panels":[]}' }] },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(complete('storyboard prompt', { responseFormat: 'json_object' })).resolves.toBe('{"panels":[]}');

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(requestInit?.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('requests OpenAI-compatible JSON object mode when responseFormat is json_object', async () => {
    useSettingsStore.getState().setLlmConfig({
      provider: 'custom',
      name: 'Custom',
      baseUrl: 'https://example.test/v1',
      apiKey: 'test-key',
      model: 'gpt-test',
    });
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"panels":[]}' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(complete('storyboard prompt', { responseFormat: 'json_object' })).resolves.toBe('{"panels":[]}');

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(requestInit?.body));
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  describe('Provider Normalization & Completion Seam', () => {
    it('normalizes OpenAI-compatible response with text, usage, requestId, and finishReason', async () => {
      const fetchMock = vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 'chatcmpl-test-id-123',
            choices: [{ message: { content: 'Normalized output' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 12, completion_tokens: 24, total_tokens: 36 },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'x-request-id': 'req-header-999',
            },
          },
        ),
      );
      vi.stubGlobal('fetch', fetchMock);

      const profile: LLMProfile = {
        id: 'prof1',
        name: 'Custom Profile',
        provider: 'custom',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4o',
        temperature: 0.5,
        maxTokens: 1000,
        timeoutSec: 60,
      };

      const res = await completeNormalized('Hello', {}, undefined, profile);
      expect(res.text).toBe('Normalized output');
      expect(res.finishReason).toBe('stop');
      expect(res.requestId).toBe('req-header-999');
      expect(res.usage).toEqual({
        promptTokens: 12,
        completionTokens: 24,
        totalTokens: 36,
      });
    });

    it('normalizes Google Gemini response with text, usage, requestId, and finishReason', async () => {
      const fetchMock = vi.fn(async () =>
        new Response(
          JSON.stringify({
            responseId: 'gemini-resp-123',
            candidates: [
              {
                finishReason: 'STOP',
                content: { parts: [{ text: 'Gemini Normalized Output' }] },
              },
            ],
            usageMetadata: {
              promptTokenCount: 15,
              candidatesTokenCount: 30,
              totalTokenCount: 45,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      vi.stubGlobal('fetch', fetchMock);

      const profile: LLMProfile = {
        id: 'prof-gemini',
        name: 'Gemini Profile',
        provider: 'google',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'gemini-key-xyz',
        model: 'gemini-2.0-flash',
        temperature: 0.7,
        maxTokens: 2048,
        timeoutSec: 90,
      };

      const res = await completeNormalized('Hello Gemini', {}, undefined, profile);
      expect(res.text).toBe('Gemini Normalized Output');
      expect(res.finishReason).toBe('STOP');
      expect(res.requestId).toBe('gemini-resp-123');
      expect(res.usage).toEqual({
        promptTokens: 15,
        completionTokens: 30,
        totalTokens: 45,
      });
    });

    it('normalizes Anthropic Messages API response with text, usage, requestId, and stop_reason', async () => {
      const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
        void args;
        return new Response(
          JSON.stringify({
            id: 'msg_anthropic_123',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Anthropic Claude output' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 20, output_tokens: 35 },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'request-id': 'anthropic-req-777',
            },
          },
        );
      });
      vi.stubGlobal('fetch', fetchMock);

      const profile: LLMProfile = {
        id: 'prof-claude',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-secret-key-123',
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        maxTokens: 4096,
        timeoutSec: 120,
      };

      const res = await completeNormalized('Hello Claude', { systemPrompt: 'Be concise' }, undefined, profile);

      expect(res.text).toBe('Anthropic Claude output');
      expect(res.finishReason).toBe('end_turn');
      expect(res.requestId).toBe('anthropic-req-777');
      expect(res.usage).toEqual({
        promptTokens: 20,
        completionTokens: 35,
        totalTokens: 55,
      });

      // Verify request payload shape
      const reqInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      const body = JSON.parse(String(reqInit?.body));
      expect(body.model).toBe('claude-3-5-sonnet-20241022');
      expect(body.system).toBe('Be concise');
      expect(body.messages).toEqual([{ role: 'user', content: 'Hello Claude' }]);
    });


    it('handles missing usage, requestId, and finishReason gracefully with stable null representations', async () => {
      const fetchMock = vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Minimal response' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      vi.stubGlobal('fetch', fetchMock);

      const profile: LLMProfile = {
        id: 'prof-minimal',
        name: 'Minimal Profile',
        provider: 'custom',
        baseUrl: 'https://api.minimal.com/v1',
        apiKey: 'min-key',
        model: 'minimal-model',
        temperature: 0.7,
        maxTokens: 100,
        timeoutSec: 30,
      };

      const res = await completeNormalized('Hi', {}, undefined, profile);
      expect(res.text).toBe('Minimal response');
      expect(res.finishReason).toBeNull();
      expect(res.requestId).toBeNull();
      expect(res.usage).toEqual({
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
      });
    });
  });

  describe('Timeout Handling & API Key Sanitization', () => {
    it('sanitizes API keys from text and error messages', () => {
      const key = 'sk-secret-key-12345';
      const rawError = `Failed to fetch https://api.example.com/v1?key=${key}: Unauthorized for key ${key}`;
      const sanitized = sanitizeApiKey(rawError, key);
      expect(sanitized).not.toContain(key);
      expect(sanitized).toContain('***');
    });

    it('verifies profile connection and sanitizes API key in error results', async () => {
      const secretKey = 'sk-super-secret-key-999';
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          return new Response(`Error with key ${secretKey}`, { status: 401 });
        }),
      );

      const profile: LLMProfile = {
        id: 'prof-test-verify',
        name: 'Verify Test',
        provider: 'custom',
        baseUrl: 'https://api.test.com/v1',
        apiKey: secretKey,
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 100,
        timeoutSec: 30,
      };

      const result = await verifyLLMProfile(profile);
      expect(result.ok).toBe(false);
      expect(result.message).not.toContain(secretKey);
      expect(result.message).toContain('***');
    });

    it('uses the interface locale for profile verification messages', async () => {
      const incompleteProfile: LLMProfile = {
        id: 'prof-incomplete',
        name: 'Incomplete',
        provider: 'custom',
        baseUrl: '',
        apiKey: '',
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 100,
        timeoutSec: 30,
      };

      const englishResult = await verifyLLMProfile(incompleteProfile, 'en');
      const chineseResult = await verifyLLMProfile(incompleteProfile, 'zh-TW');

      expect(englishResult.message).toContain('Verification failed');
      expect(englishResult.message).not.toMatch(/\p{Script=Han}/u);
      expect(chineseResult.message).toContain('驗證失敗');
    });
  });

  describe('Settings Migration & Profile Backups', () => {
    it('exports and imports multiple LLM profiles while handling API key sensitivity', () => {
      const store = useSettingsStore.getState();
      const prof1: LLMProfile = {
        id: 'p1',
        name: 'Profile 1',
        provider: 'custom',
        baseUrl: 'https://api1.com',
        apiKey: 'key1',
        model: 'm1',
        temperature: 0.7,
        maxTokens: 1000,
        timeoutSec: 60,
      };
      const prof2: LLMProfile = {
        id: 'p2',
        name: 'Profile 2',
        provider: 'google',
        baseUrl: '',
        apiKey: 'key2',
        model: 'm2',
        temperature: 0.2,
        maxTokens: 2000,
        timeoutSec: 120,
      };
      store.setLlmProfiles([prof1, prof2], 'p2');

      const snapshotNoKey = exportSettingsSnapshot(false);
      expect(snapshotNoKey.settings.llmProfiles?.[0]?.apiKey).toBeUndefined();
      expect(snapshotNoKey.settings.llmProfiles?.[1]?.apiKey).toBeUndefined();
      expect(snapshotNoKey.settings.activeProfileId).toBe('p2');

      const snapshotWithKey = exportSettingsSnapshot(true);
      expect(snapshotWithKey.settings.llmProfiles?.[0]?.apiKey).toBe('key1');
      expect(snapshotWithKey.settings.llmProfiles?.[1]?.apiKey).toBe('key2');

      // Test importing snapshot without API key preserves existing keys
      importSettingsSnapshot(snapshotNoKey);
      const importedStore = useSettingsStore.getState();
      expect(importedStore.llmProfiles.length).toBe(2);
      expect(importedStore.activeProfileId).toBe('p2');
      expect(importedStore.llmProfiles.find((p) => p.id === 'p1')?.apiKey).toBe('key1');
      expect(importedStore.llmProfiles.find((p) => p.id === 'p2')?.apiKey).toBe('key2');
    });

    it('migrates legacy single llmConfig backup into llmProfiles array', () => {
      const legacySnapshot = {
        app: 'novel-generator' as const,
        kind: 'settings' as const,
        schema: 1 as const,
        exportedAt: Date.now(),
        includesApiKeys: true,
        settings: {
          llmConfig: {
            id: 'legacy-1',
            provider: 'custom' as const,
            name: 'Legacy Config',
            baseUrl: 'https://legacy.api.com',
            apiKey: 'legacy-key',
            model: 'gpt-3.5-turbo',
            temperature: 0.7,
            maxTokens: 4096,
            timeoutSec: 120,
          },
          inlineEdit: useSettingsStore.getState().inlineEdit,
          aiPrompts: useSettingsStore.getState().aiPrompts,
          wikiPrefs: useSettingsStore.getState().wikiPrefs,
          imageGenerationPrefs: useSettingsStore.getState().imageGenerationPrefs,
          lintPrefs: useSettingsStore.getState().lintPrefs,
        },
      };

      importSettingsSnapshot(legacySnapshot);
      const migratedStore = useSettingsStore.getState();
      expect(migratedStore.llmProfiles.length).toBe(1);
      expect(migratedStore.activeProfileId).toBe('legacy-1');
      expect(migratedStore.llmConfig.name).toBe('Legacy Config');
      expect(migratedStore.llmConfig.temperature).toBe(0.7);
      expect(migratedStore.llmConfig.timeoutSec).toBe(120);
    });
  });
});
