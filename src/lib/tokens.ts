/**
 * Token 估算抽象（Phase 2 保守版）
 *
 * 中文混雜英文時，1.5 char/token 是保守估算（漢字偏向 1.0~1.5 token/字、
 * 英文偏向 4 char/token）。實際 prompt 上送會比預估多一點，這正是我們要的
 * — 寧可預留空間，也不要因為樂觀估算讓 prompt 超 budget 被截斷。
 *
 * 未來（Phase 2.5+）可換成 tiktoken-wasm 或 provider-specific tokenizer，
 * 呼叫端不必改。
 */
const CHARS_PER_TOKEN = 1.5;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function tokensToChars(tokens: number): number {
  if (tokens <= 0) return 0;
  return Math.floor(tokens * CHARS_PER_TOKEN);
}

export function estimateCharsPerToken(): number {
  return CHARS_PER_TOKEN;
}
