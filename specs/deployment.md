# 規格｜部署方式

---

## 本機 Web App（主要）

- 直接用瀏覽器開啟 `index.html`，或執行 `npx serve` 後於瀏覽器訪問
- 所有資料存於本機 IndexedDB，不需要後端伺服器
- Ollama 在本機運行，無 CORS 限制
- 離線完全可用（LLM 使用 Ollama 本機模型時）
