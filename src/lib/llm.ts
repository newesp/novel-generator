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
async function postToLLM(
  targetUrl: string,
  apiKey: string,
  body: unknown,
  sendAuthorization: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sendAuthorization) headers['Authorization'] = `Bearer ${apiKey}`;

  if (isTauri()) {
    return fetch(targetUrl, { method: 'POST', headers, body: JSON.stringify(body), signal });
  }
  // 瀏覽器：走 vite proxy middleware
  headers['x-proxy-target'] = targetUrl;
  return fetch('/llm-proxy', { method: 'POST', headers, body: JSON.stringify(body), signal });
}

/**
 * 暫時性錯誤（網路瞬斷、上游 5xx、rate-limit）的自動重試 + 退避。
 *
 * - 串行的 wiki ingest（一次 4–6 個 LLM call）特別容易被 NVIDIA 等供應商的
 *   gateway 偶發 502 / ECONNRESET 命中；單一章節生成也偶有發生。
 * - 只對「真的可重試」的失敗重試：HTTP 408/429/5xx + fetch 本身拋的網路例外
 * - 不重試 401/403/4xx（auth / 參數問題，重試無解）
 * - signal 中止：立即往上拋 AbortError，不再重試
 */
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [800, 2400, 6000]; // total retries = 3

async function postToLLMWithRetry(
  targetUrl: string, apiKey: string, body: unknown, sendAuthorization: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const resp = await postToLLM(targetUrl, apiKey, body, sendAuthorization, signal);
      if (resp.ok || !TRANSIENT_STATUSES.has(resp.status) || attempt === RETRY_DELAYS_MS.length) {
        return resp;
      }
      // 暫時性 HTTP 錯誤 — 讀出 body 後 retry（response 只能消費一次）
      const errText = await resp.text();
      console.warn(`[llm] transient ${resp.status} on attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}: ${errText.slice(0, 200)}`);
      lastError = new Error(`LLM API error ${resp.status}: ${errText}`);
    } catch (e) {
      // AbortError 不重試，直接往上丟
      if ((e as { name?: string }).name === 'AbortError') throw e;
      // 真正的網路例外（Tauri 直連時的 fetch reject、或 dev proxy 自身錯誤）
      if (attempt === RETRY_DELAYS_MS.length) throw e;
      console.warn(`[llm] network error on attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}:`, e);
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
  throw lastError ?? new Error('unreachable');
}

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  responseFormat?: 'json_object';
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

export async function complete(
  prompt: string,
  options?: GenerationOptions,
  signal?: AbortSignal,
): Promise<string> {
  const { llmConfig } = useSettingsStore.getState();

  if (!llmConfig.apiKey) {
    throw new Error('請先在「⚙️ 偏好設定」中設定 API Key');
  }

  switch (llmConfig.provider) {
    case 'google':
      return completeGoogle(llmConfig, prompt, options, signal);
    case 'grok':
      // Grok 走 OpenAI-compatible，差別只在預設 baseUrl
      return completeOpenAICompat(
        { ...llmConfig, baseUrl: llmConfig.baseUrl || GROK_DEFAULT_BASE },
        prompt,
        options,
        signal,
      );
    case 'custom':
    default:
      return completeOpenAICompat(llmConfig, prompt, options, signal);
  }
}

/* ============================================================
   OpenAI-compatible（自定義 endpoint）
   ============================================================ */
async function completeOpenAICompat(
  cfg: LLMConfig,
  prompt: string,
  options?: GenerationOptions,
  signal?: AbortSignal,
): Promise<string> {
  if (!cfg.baseUrl) {
    throw new Error('請先設定 API 端點 (Base URL)');
  }
  const targetUrl = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [
      ...(options?.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
      { role: 'user' as const, content: prompt },
    ],
    max_tokens: options?.maxTokens ?? 4096,
    temperature: options?.temperature ?? 0.7,
  };
  if (options?.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }

  const response = await postToLLMWithRetry(targetUrl, cfg.apiKey, body, true, signal);

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
  signal?: AbortSignal,
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
      ...(options?.responseFormat === 'json_object' ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (options?.systemPrompt) {
    body.systemInstruction = { parts: [{ text: options.systemPrompt }] };
  }

  const response = await postToLLMWithRetry(targetUrl, cfg.apiKey, body, false, signal);

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
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(`Gemini 被中止：${candidate.finishReason}`);
  }
  const parts = candidate.content?.parts ?? [];
  return parts.map((p: { text?: string }) => p.text ?? '').join('');
}
