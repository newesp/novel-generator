# Agent 角色引用可重用的 LLM 連線設定檔

Planner、Writer、Critic、Editor 需要能在同一次生成執行中混用不同 provider，例如 Writer 直連 Anthropic Claude、Planner 使用 OpenAI 模型；單一全域 `llmConfig` 或只覆寫模型名稱無法滿足不同 endpoint、憑證與請求格式。偏好設定因此提供多個全域 LLM 連線設定檔，各角色引用一個設定檔並可覆寫 model、temperature 與 maxTokens，憑證只保存在設定檔中且不得寫入執行軌跡。LLM 呼叫模組改為接受明確設定檔的 seam，保留 OpenAI-compatible、Google、Grok adapter 並新增 Anthropic adapter；Writer 與 Editor 即使選用不同設定檔仍共用同一 generation executor。
