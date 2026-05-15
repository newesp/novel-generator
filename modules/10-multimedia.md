# 模組 10｜多媒體生成模組

> Phase / 依賴：見 [README 模組總表](../README.md#模組總表)

## 功能列表

| 功能 | 描述 | 技術方案 | Phase |
|------|------|----------|------|
| 封面圖生成 | 一鍵生成專業小說封面 | Grok Imagine / Flux / DALL·E | 4 |
| 章節轉漫畫 | 章節 → LLM 拆鏡 → 連續漫畫圖（含對話框） | Grok Imagine / Flux + 分鏡模板 | 4 / 6 |
| 語音朗讀 | 章節轉 TTS（支援多角色不同音色） | Edge-TTS / ElevenLabs | 4 |
| 漫畫 + TTS → 影片 | 連續漫畫圖 + AI 念稿 → 合成 mp4 | ffmpeg sidecar（Tauri 桌面）| 6 |

---

## 整合方式

- 章節工具列增加「多媒體」按鈕（封面、漫畫、語音、影片）
- 生成後可預覽、單一面板重新生成
- EPUB 輸出時可選擇嵌入封面與插圖

---

## 影片 Pipeline（Phase 6）

> 強烈傾向**桌面版專屬**功能。Web 版可選擇降級或標示「請使用桌面版」。

```
章節文本
   ↓ LLM 拆鏡（提示工程）
分鏡腳本（每鏡：構圖描述 + 對白 + 旁白）
   ↓ 並行：
   ├─→ 圖像 API → PNG（每鏡 1 張，或多張漸進演出）
   └─→ TTS API → MP3（旁白 / 對白依角色配音）
   ↓
ffmpeg sidecar：圖片 + 音檔 + 轉場 → mp4
   ↓
存至 <project_folder>/media/chXX/video.mp4
```

### 儲存規則

- **metadata 進 SQLite**：分鏡描述、圖片/音檔 prompt、章節 ↔ 媒體 asset 關聯
- **binary 進檔案系統**：`<project_folder>/media/chXX/panel-NN.png` / `audio-NN.mp3` / `video.mp4`
- DB 不存大型 binary（避免膨脹）

### 為何走桌面

- 一章十幾~幾十張 PNG（每張 1-3 MB），全本累積到 GB 級 — 瀏覽器配額卡死
- ffmpeg.wasm 跑影片合成慢且耗記憶體；Tauri 用 native ffmpeg 快 10x+
- 大檔案（>2GB mp4）走瀏覽器下載流程不可靠

詳細部署規劃見 [specs/roadmap.md](../specs/roadmap.md) Phase 5 / 6。
