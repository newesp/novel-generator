import { useSettingsStore } from '../stores/settingsStore';
import type { LLMConfig } from '../types';
import { isTauri } from './platform';

/**
 * LLM 呼叫的網路層
 *
 * 兩種環境：
 * - 瀏覽器 dev：走 vite middleware `/llm-proxy`（headers `x-proxy-target`），
 *   middleware 在後端轉發以避開 CORS。
 * - Tauri 桌面：webview 不受瀏覽器 CORS 限制（且本 app CSP 設為 null），
 *   直接 fetch 目標 URL；若仍走 `/llm-proxy`，會被 Tauri SPA fallback 回
 *   index.html，導致呼叫端拿到 `<!doctype …` 而非 JSON。
 *
 * sendAuthorization：Google Gemini 用 URL `?key=` 認證，不能帶 Authorization
 * （會被誤判為 OAuth token 而 401）。
 */
async function postToLLM(targetUrl: string, apiKey: string, body: unknown, sendAuthorization: boolean): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sendAuthorization) headers['Authorization'] = `Bearer ${apiKey}`;

  if (isTauri()) {
    return fetch(targetUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  }
  // 瀏覽器：走 vite proxy middleware
  headers['x-proxy-target'] = targetUrl;
  return fetch('/llm-proxy', { method: 'POST', headers, body: JSON.stringify(body) });
}

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/** Google Gemini 預設 API 端點 */
const GOOGLE_DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Grok (xAI) 預設 API 端點 — OpenAI-compatible */
const GROK_DEFAULT_BASE = 'https://api.x.ai/v1';

/** 判斷目前的 LLM 設定是否可用（API key + provider 對應的必要欄位齊全） */
export function isLLMReady(cfg: LLMConfig): boolean {
  if (!cfg.apiKey) return false;
  switch (cfg.provider) {
    case 'google':
    case 'grok':
      // baseUrl 可留空（有預設）
      return true;
    case 'custom':
    default:
      return !!cfg.baseUrl;
  }
}

export async function complete(prompt: string, options?: GenerationOptions): Promise<string> {
  const { llmConfig } = useSettingsStore.getState();

  if (!llmConfig.apiKey) {
    throw new Error('請先在「⚙️ 偏好設定」中設定 API Key');
  }

  switch (llmConfig.provider) {
    case 'google':
      return completeGoogle(llmConfig, prompt, options);
    case 'grok':
      // Grok 走 OpenAI-compatible，差別只在預設 baseUrl
      return completeOpenAICompat(
        { ...llmConfig, baseUrl: llmConfig.baseUrl || GROK_DEFAULT_BASE },
        prompt,
        options,
      );
    case 'custom':
    default:
      return completeOpenAICompat(llmConfig, prompt, options);
  }
}

/* ============================================================
   OpenAI-compatible（自定義 endpoint）
   ============================================================ */
async function completeOpenAICompat(
  cfg: LLMConfig,
  prompt: string,
  options?: GenerationOptions,
): Promise<string> {
  if (!cfg.baseUrl) {
    throw new Error('請先設定 API 端點 (Base URL)');
  }
  const targetUrl = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const response = await postToLLM(targetUrl, cfg.apiKey, {
    model: cfg.model,
    messages: [
      ...(options?.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
      { role: 'user' as const, content: prompt },
    ],
    max_tokens: options?.maxTokens ?? 4096,
    temperature: options?.temperature ?? 0.7,
  }, true);

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/* ============================================================
   Google Gemini
   端點：{baseUrl}/models/{model}:generateContent?key={apiKey}
   ============================================================ */
async function completeGoogle(
  cfg: LLMConfig,
  prompt: string,
  options?: GenerationOptions,
): Promise<string> {
  const base = (cfg.baseUrl || GOOGLE_DEFAULT_BASE).replace(/\/$/, '');
  const model = cfg.model || 'gemini-2.0-flash';
  const targetUrl = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;

  const body: Record<string, unknown> = {
    contents: [
      { role: 'user', parts: [{ text: prompt }] },
    ],
    generationConfig: {
      temperature: options?.temperature ?? 0.7,
      maxOutputTokens: options?.maxTokens ?? 4096,
    },
  };
  if (options?.systemPrompt) {
    body.systemInstruction = { parts: [{ text: options.systemPrompt }] };
  }

  const response = await postToLLM(targetUrl, cfg.apiKey, body, false);

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  // 回應 shape: { candidates: [ { content: { parts: [ { text } ] } } ] }
  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error(`Gemini 沒有回傳內容：${JSON.stringify(data).slice(0, 300)}`);
  }
  if (candidate.finishReason && candidate.finishReason !== 'STOP' && !candidate.content) {
    throw new Error(`Gemini 被中止：${candidate.finishReason}`);
  }
  const parts = candidate.content?.parts ?? [];
  return parts.map((p: { text?: string }) => p.text ?? '').join('');
}
