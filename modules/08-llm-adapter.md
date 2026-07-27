# 模組 08｜LLM 適配層

> Phase / 依賴：見 [README 模組總表](../README.md#模組總表)（單一 provider Phase 1，多 provider Phase 2；Google Gemini、Grok 已實作）

## 支援的模型

| 提供商       | 模型範例                             | Phase | 狀態 |
| --------- | -------------------------------- | ----- | ---- |
| 自定義 API   | OpenAI-compatible chat completions endpoint | 1     | ✅ 已實作 |
| Google    | Gemini 1.5 Pro, Gemini 2.0 Flash 等 | 2     | ✅ 已實作 |
| Grok (xAI) | grok-2-latest, grok-2-1212, grok-beta | 2     | ✅ 已實作 |
| OpenAI    | GPT-4o, GPT-4o-mini 等 | 2     | 透過自定義 OpenAI-compatible endpoint 使用 |
| Anthropic | Claude 3.5 Sonnet, Claude 3 Opus 等 | 2     | ✅ 已實作 |
| Ollama    | llama / qwen / mistral 等本機模型 | 2     | 待實作；若提供 OpenAI-compatible endpoint 可先走自定義 API |

---

## LLMProfile 型別與具名連線設定檔

為了支援多 Provider Profile 以及 Multi-Agent 為不同角色指定不同 LLM，系統定義了具名 `LLMProfile`（2026-07-26 實作）：

```ts
type LLMProvider = 'custom' | 'google' | 'grok' | 'anthropic';

interface LLMProfile {
  id: string;
  name: string;
  provider: LLMProvider;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutSec?: number;
  isDefault?: boolean;
}
```

### Profile 管理與連線驗證

- **多 Profile 管理**：可在「偏好設定 → Agent 設定 / LLM Profile」新增、編輯、刪除與切換預設 Profile。
- **連線驗證 (`verifyLLMProfile`)**：發送輕量探針請求驗證 API Key 與連線，並自動遮蔽敏感 API Key。
- **共同 Completion Seam (`completeNormalized`)**：將各 provider 的 completion 輸出正規化為統一結果結構（包含 `content`、`usage` [promptTokens/completionTokens/totalTokens]、`requestId` 與 `finishReason`）。

---

## Provider 分支與認證

### `isLLMReady(cfg: LLMConfig | LLMProfile): boolean`

集中判斷 LLM 是否已設定完成：

| Provider | 條件 |
|----------|------|
| `google`   | `apiKey` 非空即可（`baseUrl` 可留空，使用預設 endpoint） |
| `grok`     | `apiKey` 非空即可（`baseUrl` 可留空，預設 `https://api.x.ai/v1`） |
| `anthropic`| `apiKey` 非空即可（`baseUrl` 可留空，預設 `https://api.anthropic.com/v1`） |
| `custom`   | `apiKey` 且 `baseUrl` 皆非空 |

### `completeNormalized(profile, prompt, options?)` 內部分支

| Provider | 認證與 Header 轉發 | Endpoint |
|----------|-------------------|----------|
| `custom`   | `Authorization: Bearer <key>` | `baseUrl/chat/completions` |
| `google`   | URL query string `?key=<apiKey>`（不送 Authorization） | `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent` |
| `grok`     | `Authorization: Bearer <key>` | `https://api.x.ai/v1/chat/completions` |
| `anthropic`| `x-api-key: <key>`, `anthropic-version: 2023-06-01` | `https://api.anthropic.com/v1/messages` |

---

## Vite Dev Proxy（CORS 繞過與 Header 轉發）

`vite.config.ts` 的 `llmProxyPlugin` 攔截 `POST /llm-proxy`，由 Node server 端轉發至外部 LLM API。

**Headers 轉發規則：**
- `Authorization`：僅在 Client 有帶時轉發（避免 Google 誤判 401）。
- `x-api-key` 與 `anthropic-version`：支援 Anthropic 專屬驗證 Header 之轉發。

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
