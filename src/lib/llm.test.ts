import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '../stores/settingsStore';
import { complete } from './llm';

describe('complete', () => {
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      candidates: [
        {
          finishReason: 'MAX_TOKENS',
          content: { parts: [{ text: '{"panels":[{"panelNumber":1}' }] },
        },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(complete('storyboard prompt', { responseFormat: 'json_object' }))
      .rejects.toThrow('MAX_TOKENS');
  });

  it('requests Gemini JSON mode when responseFormat is json_object', async () => {
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return new Response(JSON.stringify({
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: '{"panels":[]}' }] },
        },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(complete('storyboard prompt', { responseFormat: 'json_object' }))
      .resolves.toBe('{"panels":[]}');

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
      return new Response(JSON.stringify({
      choices: [{ message: { content: '{"panels":[]}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(complete('storyboard prompt', { responseFormat: 'json_object' }))
      .resolves.toBe('{"panels":[]}');

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(requestInit?.body));
    expect(body.response_format).toEqual({ type: 'json_object' });
  });
});
