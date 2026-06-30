# 規格｜輸出格式

**Phase**：3（已實作）

---

| 格式 | 用途 | 實作 |
|------|------|------|
| `.txt` | 純文字完整小說，方便二次編輯與備份 | 書名、基本 metadata、目錄、依章節順序輸出正文 |
| `.html` | 可在瀏覽器中閱讀，帶基本排版 | 單檔 HTML，含內嵌閱讀樣式與章節 anchor 目錄 |
| `.epub` | 電子書格式，適配閱讀器 | EPUB 3 ZIP 封裝，含 `mimetype`、`container.xml`、`content.opf`、`nav.xhtml`、`toc.ncx` 與各章 XHTML |

匯出只處理作品內容，不匯出內部 pipeline、模型設定、素材 metadata。資料來源走目前 store / `StorageAdapter` 載入的「書本 + 章節」，避免綁定 Dexie 或 SQLite。Web 版使用 File System Access API 時會開啟另存視窗，不支援時 fallback 為瀏覽器下載；Tauri 桌面版使用原生另存檔案對話框。
