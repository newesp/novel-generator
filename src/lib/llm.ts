import { useSettingsStore } from '../stores/settingsStore';

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export async function complete(prompt: string, options?: GenerationOptions): Promise<string> {
  const { llmConfig } = useSettingsStore.getState();

  if (!llmConfig.apiKey || !llmConfig.baseUrl) {
    throw new Error('請先在工具列設定 API Key 與 endpoint');
  }

  const targetUrl = `${llmConfig.baseUrl.replace(/\/$/, '')}/chat/completions`;

  // 透過本地 Vite proxy 轉發，繞過瀏覽器 CORS 限制
  const response = await fetch('/llm-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${llmConfig.apiKey}`,
      'x-proxy-target': targetUrl,
    },
    body: JSON.stringify({
      model: llmConfig.model,
      messages: [
        ...(options?.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
        { role: 'user' as const, content: prompt },
      ],
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}
