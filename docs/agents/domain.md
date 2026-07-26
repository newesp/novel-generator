# Domain Docs

本專案採 single-context domain 文件配置。

## 探索前讀取

- 根目錄 `CONTEXT.md`
- 與工作範圍相關的 `docs/adr/`

若文件不存在則直接繼續，不需預先建立；只有在領域術語或架構決策實際確立時才由 domain-modeling 流程建立。

## 使用規則

- Issue、spec、測試名稱與程式設計使用 `CONTEXT.md` 的 canonical vocabulary。
- 避免使用 glossary 明確列為 `_Avoid_` 的同義詞。
- 若規格或實作與既有 ADR 衝突，必須明確指出，不得靜默覆蓋。
- ADR 若已被取代，依其 `status` 指向的新 ADR 為準。
