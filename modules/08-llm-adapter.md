# 模組 08｜LLM 適配層

**Phase**：單一 provider → 1；多 provider → 2（Google Gemini、Grok 已實作）
**依賴**：specs/tech-stack

---

## 支援的模型

| 提供商       | 模型範例                             | Phase | 狀態 |
| --------- | -------------------------------- | ----- | ---- |
| 自定義 API   | NVIDIA、任意 OpenAI-compatible API   | 1     | ✅ 已實作 |
| Google    | Gemini 1.5 Pro, Gemini 2.0 Flash 等 | 2     | ✅ 已實作 |
| Grok (xAI) | grok-2-latest, grok-2-1212, grok-beta | 2     | ✅ 已實作 |
| Anthropic | Claude 3.5 Sonnet, Claude 3 Opus | 2     | 待實作 |
| OpenAI    | GPT-4o, GPT-4o-mini, GPT-4 Turbo | 2     | 待實作 |
| Ollama    | llama3.3, qwen2.5, mistral 等本機模型 | 2     | 待實作 |

---

## LLMConfig 型別

```ts
type LLMProvider = 'custom' | 'google' | 'grok';

interface LLMConfig {
  id: string;
  provider: LLMProvider;
  name: string;
  /** 'custom' 必填；'google' 可留空（使用預設 Gemini endpoint） */
  baseUrl: string;
  apiKey: string;
  model: string;
}
```

---

## Provider 分支邏輯

### `isLLMReady(cfg: LLMConfig): boolean`

集中判斷 LLM 是否已設定完成：

| Provider | 條件 |
|----------|------|
| `google` | `apiKey` 非空即可（`baseUrl` 可留空，使用預設 endpoint） |
| `grok`   | `apiKey` 非空即可（`baseUrl` 可留空，預設 `https://api.x.ai/v1`） |
| `custom` | `apiKey` 且 `baseUrl` 皆非空 |

> 此 helper 替代原本各元件自行判斷的邏輯，所有 UI 禁用狀態都呼叫它。

### `complete(prompt, options?)` 內部分支

| Provider | 認證方式 | Endpoint |
|----------|----------|----------|
| `custom` | `Authorization: Bearer <key>` | `baseUrl/chat/completions` |
| `google` | URL query string `?key=<apiKey>`（不送 Authorization） | `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent` |
| `grok`   | `Authorization: Bearer <key>` | `https://api.x.ai/v1/chat/completions`（走 OpenAI-compatible） |

---

## Vite Dev Proxy（CORS 繞過）

`vite.config.ts` 的 `llmProxyPlugin` 攔截 `POST /llm-proxy`，由 Node server 端轉發至外部 LLM API。

**Authorization header 轉發規則（2026-05-11 修正）：**

```ts
// 只在 client 明確提供非空 Authorization 時才轉發
// Google Gemini 用 URL query string ?key=... 認證
// 若總是轉發會被 Google 誤判為無效 OAuth token（401 ACCESS_TOKEN_TYPE_UNSUPPORTED）
if (typeof incomingAuth === 'string' && incomingAuth.length > 0) {
  forwardHeaders.Authorization = incomingAuth
}
```

---

## 自定義 API 配置範例

**NVIDIA API：**

| 欄位 | 示例值 |
|------|--------|
| Base URL | `https://integrate.api.nvidia.com/v1` |
| API Key | 從 NGC 開發者帳號獲取 |
| 模型 ID | `meta/llama-3.1-70b-instruct` |

**Google Gemini：**

| 欄位 | 示例值 |
|------|--------|
| Base URL | （留空，自動使用預設端點） |
| API Key | 從 Google AI Studio 取得 |
| 模型 ID | `gemini-2.0-flash` |

**Grok (xAI)：**

| 欄位 | 示例值 |
|------|--------|
| Base URL | （留空 = `https://api.x.ai/v1`） |
| API Key | 從 [console.x.ai](https://console.x.ai) 取得 |
| 模型 ID | `grok-2-latest`、`grok-2-1212`、`grok-beta` |
