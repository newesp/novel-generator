import { useSettingsStore } from '../stores/settingsStore';
import type { LLMCompletionResponse, LLMCompletionUsage, LLMProfile } from '../types';
import { isTauri } from './platform';

/** Google Gemini 預設 API 端點 */
const GOOGLE_DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Grok (xAI) 預設 API 端點 — OpenAI-compatible */
const GROK_DEFAULT_BASE = 'https://api.x.ai/v1';

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  responseFormat?: 'json_object';
  timeoutSec?: number;
  profile?: LLMProfile;
}

export function sanitizeApiKey(text: string, apiKey?: string): string {
  if (!apiKey || apiKey.trim().length === 0) return text;
  return text.replaceAll(apiKey, '***');
}

export function clampTimeoutSec(timeoutSec?: number): number {
  if (typeof timeoutSec !== 'number' || Number.isNaN(timeoutSec)) return 120;
  return Math.max(30, Math.min(3600, timeoutSec));
}

function createCombinedTimeoutSignal(callerSignal: AbortSignal | undefined, timeoutSec: number) {
  const controller = new AbortController();
  let timerId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    controller.abort(new DOMException(`LLM request timed out after ${timeoutSec} seconds`, 'TimeoutError'));
  }, timeoutSec * 1000);

  const onCallerAbort = () => {
    if (timerId) clearTimeout(timerId);
    controller.abort(callerSignal?.reason ?? new DOMException('Aborted', 'AbortError'));
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      if (timerId) clearTimeout(timerId);
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  const cleanup = () => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (callerSignal) {
      callerSignal.removeEventListener('abort', onCallerAbort);
    }
  };

  return { signal: controller.signal, cleanup };
}

const ANTHROPIC_DEFAULT_BASE = 'https://api.anthropic.com/v1';

/**
 * LLM 呼叫的網路層
 */
async function postToLLM(
  targetUrl: string,
  apiKey: string,
  body: unknown,
  sendAuthorization: boolean,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) };
  if (sendAuthorization) headers['Authorization'] = `Bearer ${apiKey}`;

  if (isTauri()) {
    return fetch(targetUrl, { method: 'POST', headers, body: JSON.stringify(body), signal });
  }
  // 瀏覽器：走 vite proxy middleware
  headers['x-proxy-target'] = targetUrl;
  return fetch('/llm-proxy', { method: 'POST', headers, body: JSON.stringify(body), signal });
}

const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [800, 2400, 6000];

async function postToLLMWithRetry(
  targetUrl: string,
  apiKey: string,
  body: unknown,
  sendAuthorization: boolean,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (signal?.aborted) {
      if (signal.reason instanceof Error) throw signal.reason;
      throw new DOMException(typeof signal.reason === 'string' ? signal.reason : 'Aborted', 'AbortError');
    }
    try {
      const resp = await postToLLM(targetUrl, apiKey, body, sendAuthorization, signal, extraHeaders);
      if (resp.ok || !TRANSIENT_STATUSES.has(resp.status) || attempt === RETRY_DELAYS_MS.length) {
        return resp;
      }
      const errText = await resp.text();
      const sanitizedErrText = sanitizeApiKey(errText, apiKey);
      console.warn(
        `[llm] transient ${resp.status} on attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}: ${sanitizedErrText.slice(0, 200)}`,
      );
      lastError = new Error(`LLM API error ${resp.status}: ${sanitizedErrText}`);
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError' || (e as { name?: string }).name === 'TimeoutError') {
        throw e;
      }
      if (attempt === RETRY_DELAYS_MS.length) throw e;
      const errStr = e instanceof Error ? e.message : String(e);
      console.warn(`[llm] network error on attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}:`, sanitizeApiKey(errStr, apiKey));
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
  throw lastError ?? new Error('unreachable');
}

/** 判斷 LLM 設定是否可用 */
export function isLLMReady(cfg: LLMProfile): boolean {
  if (!cfg.apiKey) return false;
  switch (cfg.provider) {
    case 'google':
    case 'grok':
    case 'anthropic':
      return true;
    case 'custom':
    default:
      return !!cfg.baseUrl;
  }
}

export async function completeNormalized(
  prompt: string,
  options?: GenerationOptions,
  signal?: AbortSignal,
  profileOverride?: LLMProfile,
): Promise<LLMCompletionResponse> {
  const profile = profileOverride || options?.profile || useSettingsStore.getState().llmConfig;

  if (!profile || !profile.apiKey) {
    throw new Error('請先在「⚙️ 偏好設定」中設定 API Key');
  }

  const effectiveTimeoutSec = clampTimeoutSec(options?.timeoutSec ?? profile.timeoutSec);
  const { signal: combinedSignal, cleanup } = createCombinedTimeoutSignal(signal, effectiveTimeoutSec);

  try {
    switch (profile.provider) {
      case 'google':
        return await completeGoogleNormalized(profile, prompt, options, combinedSignal);
      case 'grok':
        return await completeOpenAICompatNormalized(
          { ...profile, baseUrl: profile.baseUrl || GROK_DEFAULT_BASE },
          prompt,
          options,
          combinedSignal,
        );
      case 'anthropic':
        return await completeAnthropicNormalized(profile, prompt, options, combinedSignal);
      case 'custom':
      default:
        return await completeOpenAICompatNormalized(profile, prompt, options, combinedSignal);
    }
  } catch (err) {
    if (err instanceof Error) {
      err.message = sanitizeApiKey(err.message, profile.apiKey);
    }
    throw err;
  } finally {
    cleanup();
  }
}

export async function complete(
  prompt: string,
  options?: GenerationOptions,
  signal?: AbortSignal,
): Promise<string> {
  const res = await completeNormalized(prompt, options, signal);
  return res.text;
}

/* ============================================================
   OpenAI-compatible Completion Seam
   ============================================================ */
async function completeOpenAICompatNormalized(
  cfg: LLMProfile,
  prompt: string,
  options?: GenerationOptions,
  signal?: AbortSignal,
): Promise<LLMCompletionResponse> {
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
    max_tokens: options?.maxTokens ?? cfg.maxTokens ?? 4096,
    temperature: options?.temperature ?? cfg.temperature ?? 0.7,
  };
  if (options?.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }

  const response = await postToLLMWithRetry(targetUrl, cfg.apiKey, body, true, signal);

  if (!response.ok) {
    const err = await response.text();
    const sanitized = sanitizeApiKey(err, cfg.apiKey);
    throw new Error(`LLM API error ${response.status}: ${sanitized}`);
  }

  const requestId =
    response.headers.get('x-request-id') ||
    response.headers.get('request-id') ||
    response.headers.get('apigw-request-id') ||
    null;

  const data = await response.json();
  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? '';
  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : null;

  const promptTokens = typeof data.usage?.prompt_tokens === 'number' ? data.usage.prompt_tokens : null;
  const completionTokens = typeof data.usage?.completion_tokens === 'number' ? data.usage.completion_tokens : null;
  const totalTokens = typeof data.usage?.total_tokens === 'number' ? data.usage.total_tokens : null;

  const usage: LLMCompletionUsage = { promptTokens, completionTokens, totalTokens };
  const finalReqId = requestId || (typeof data.id === 'string' ? data.id : null);

  return { text, usage, requestId: finalReqId, finishReason };
}

/* ============================================================
   Google Gemini Completion Seam
   ============================================================ */
async function completeGoogleNormalized(
  cfg: LLMProfile,
  prompt: string,
  options?: GenerationOptions,
  signal?: AbortSignal,
): Promise<LLMCompletionResponse> {
  const base = (cfg.baseUrl || GOOGLE_DEFAULT_BASE).replace(/\/$/, '');
  const model = cfg.model || 'gemini-2.0-flash';
  const targetUrl = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;

  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options?.temperature ?? cfg.temperature ?? 0.7,
      maxOutputTokens: options?.maxTokens ?? cfg.maxTokens ?? 4096,
      ...(options?.responseFormat === 'json_object' ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (options?.systemPrompt) {
    body.systemInstruction = { parts: [{ text: options.systemPrompt }] };
  }

  const response = await postToLLMWithRetry(targetUrl, cfg.apiKey, body, false, signal);

  if (!response.ok) {
    const err = await response.text();
    const sanitized = sanitizeApiKey(err, cfg.apiKey);
    throw new Error(`Google Gemini API error ${response.status}: ${sanitized}`);
  }

  const requestId =
    response.headers.get('x-request-id') ||
    response.headers.get('request-id') ||
    response.headers.get('x-goog-request-params') ||
    null;

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error(`Gemini 沒有回傳內容：${JSON.stringify(data).slice(0, 300)}`);
  }

  const finishReason = typeof candidate.finishReason === 'string' ? candidate.finishReason : null;
  if (finishReason && finishReason !== 'STOP') {
    throw new Error(`Gemini 被中止：${finishReason}`);
  }

  const parts = candidate.content?.parts ?? [];
  const text = parts.map((p: { text?: string }) => p.text ?? '').join('');

  const usageMeta = data.usageMetadata;
  const promptTokens = typeof usageMeta?.promptTokenCount === 'number' ? usageMeta.promptTokenCount : null;
  const completionTokens = typeof usageMeta?.candidatesTokenCount === 'number' ? usageMeta.candidatesTokenCount : null;
  const totalTokens = typeof usageMeta?.totalTokenCount === 'number' ? usageMeta.totalTokenCount : null;

  const usage: LLMCompletionUsage = { promptTokens, completionTokens, totalTokens };
  const finalReqId = requestId || (typeof data.responseId === 'string' ? data.responseId : null);

  return { text, usage, requestId: finalReqId, finishReason };
}

/* ============================================================
   Anthropic Messages API
   端點：{baseUrl}/messages
   Headers: x-api-key, anthropic-version
   ============================================================ */
async function completeAnthropicNormalized(
  cfg: LLMProfile,
  prompt: string,
  options?: GenerationOptions,
  signal?: AbortSignal,
): Promise<LLMCompletionResponse> {
  const base = (cfg.baseUrl || ANTHROPIC_DEFAULT_BASE).replace(/\/$/, '');
  const targetUrl = `${base}/messages`;

  const body: Record<string, unknown> = {
    model: cfg.model || 'claude-3-5-sonnet-20241022',
    max_tokens: options?.maxTokens ?? cfg.maxTokens ?? 4096,
    temperature: options?.temperature ?? cfg.temperature ?? 0.7,
    messages: [{ role: 'user', content: prompt }],
  };
  if (options?.systemPrompt) {
    body.system = options.systemPrompt;
  }

  const extraHeaders = {
    'x-api-key': cfg.apiKey,
    'anthropic-version': '2023-06-01',
  };

  const response = await postToLLMWithRetry(targetUrl, cfg.apiKey, body, false, signal, extraHeaders);

  if (!response.ok) {
    const err = await response.text();
    const sanitized = sanitizeApiKey(err, cfg.apiKey);
    throw new Error(`Anthropic API error ${response.status}: ${sanitized}`);
  }

  const requestId =
    response.headers.get('request-id') ||
    response.headers.get('x-request-id') ||
    null;

  const data = await response.json();
  const contentBlocks = Array.isArray(data.content) ? data.content : [];
  const text = contentBlocks
    .filter((b: { type?: string; text?: string }) => b.type === 'text' && typeof b.text === 'string')
    .map((b: { text: string }) => b.text)
    .join('');

  const finishReason = typeof data.stop_reason === 'string' ? data.stop_reason : null;

  const inputTokens = typeof data.usage?.input_tokens === 'number' ? data.usage.input_tokens : null;
  const outputTokens = typeof data.usage?.output_tokens === 'number' ? data.usage.output_tokens : null;
  const totalTokens = inputTokens !== null || outputTokens !== null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null;

  const usage: LLMCompletionUsage = {
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens,
  };

  const finalReqId = requestId || (typeof data.id === 'string' ? data.id : null);

  return { text, usage, requestId: finalReqId, finishReason };
}

/** 驗證 Connection Profile */
export async function verifyLLMProfile(profile: LLMProfile): Promise<{
  ok: boolean;
  message: string;
  response?: LLMCompletionResponse;
}> {
  if (!isLLMReady(profile)) {
    return {
      ok: false,
      message: '驗證失敗：缺少必要的端點 (Base URL) 或 API Key 設定',
    };
  }

  try {
    const response = await completeNormalized(
      'Say "OK"',
      {
        maxTokens: 10,
        temperature: 0.7,
        timeoutSec: Math.min(clampTimeoutSec(profile.timeoutSec), 30),
      },
      undefined,
      profile,
    );
    const usageStr = response.usage.totalTokens !== null ? ` (Token 使用: ${response.usage.totalTokens})` : '';
    const reqStr = response.requestId ? ` [ID: ${response.requestId}]` : '';
    const finishStr = response.finishReason ? ` [Finish: ${response.finishReason}]` : '';
    return {
      ok: true,
      message: `連線成功！模型：${profile.model}，回應：${response.text.trim().slice(0, 50)}${usageStr}${reqStr}${finishStr}`,
      response,
    };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const sanitizedMsg = sanitizeApiKey(rawMsg, profile.apiKey);
    return {
      ok: false,
      message: `驗證失敗：${sanitizedMsg}`,
    };
  }
}
