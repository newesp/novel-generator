# 模組 08｜LLM 適配層

**Phase**：單一 provider → 1；多 provider → 2
**依賴**：specs/tech-stack

---

## 支援的模型

| 提供商       | 模型範例                             | Phase |
| --------- | -------------------------------- | ----- |
| Anthropic | Claude 3.5 Sonnet, Claude 3 Opus | 2     |
| OpenAI    | GPT-4o, GPT-4o-mini, GPT-4 Turbo | 2     |
| Google    | Gemini 1.5 Pro, Gemini 1.5 Flash | 2     |
| Grok      | Grok-2, Grok-2 Vision            | 2     |
| Ollama    | llama3.3, qwen2.5, mistral 等本機模型 | 2     |
| 自定義 API   | NVIDIA 等其他 API                   | 1（優先） |

---

## 自定義 API 配置欄位

| 欄位 | 說明 |
|------|------|
| 提供商名稱 | 顯示名稱 |
| API 端點 | baseUrl 位址 |
| API Key | 認證密鑰 |
| 模型名稱 | 模型標識 |
| 其他參數 | 自定義請求頭、參數等 |

**NVIDIA API 配置範例：**

| 欄位 | 示例值 |
|------|--------|
| Base URL | `https://integrate.api.nvidia.com/v1` |
| API Key | 從 NGC 開發者帳號獲取 |
| 模型 ID | `meta/llama-3.1-70b-instruct` |
