# 模組 10｜多媒體生成模組

> Phase / 依賴：見 [README 模組總表](../README.md#模組總表)

## 功能列表

| 功能            | 描述                     | 技術方案                                                                     | Phase |
| ------------- | ---------------------- | ------------------------------------------------------------------------ | ----- |
| 封面圖生成         | 一鍵生成專業小說封面             | 尚未實作；可復用 image provider 架構                                               | 4     |
| 章節轉漫畫圖片 MVP   | 章節 → 可編輯分鏡 → 批次生成連續漫畫圖 | ComfyUI / OpenAI-compatible image / DeepInfra FLUX / Google Gemini Image | 6     |
| 語音朗讀          | 章節轉 TTS（支援多角色不同音色）     | Edge-TTS / ElevenLabs                                                    | 4     |
| 漫畫 + TTS → 影片 | 連續漫畫圖 + AI 念稿 → 合成 mp4 | ffmpeg sidecar（Tauri 桌面）                                                 | 6     |

---

## 整合方式

- 章節工具列已提供「轉漫畫」流程（ComicModal）
- 生成後可預覽、單格重生、切換歷史圖、手動上傳替換、單圖下載
- 桌面版 ComicModal 已提供單格 MP4、整章 MP4、整章影片設定與章節內「影片庫」
- EPUB 輸出時可選擇嵌入封面與插圖

---

## 漫畫圖片 MVP（Phase 6）

> 設計：`docs/superpowers/specs/2026-05-28-phase-6-comic-images-design.md`  
> Visual Bible：`docs/superpowers/specs/2026-05-29-phase-6-visual-bible-design.md`  
> MVP 先做「選擇章節 → 生成可編輯分鏡 → 批次生成連續漫畫圖片」。2026-06 已接上桌面版 TTS / MP4 輸出與章節內影片庫。

```
章節文本
   ↓ novel-to-storyboard（章節 + 角色卡 + Wiki）
可編輯分鏡（每格：構圖、角色、prompt、negative prompt、對白/旁白）
   ↓
ImageGenerationProvider
   ├─→ ComfyUI HTTP API（本地）
   ├─→ OpenAI-compatible image API（線上）
   ├─→ DeepInfra FLUX（線上）
   └─→ Google Gemini Image（線上）
   ↓
PNG / JPG / WEBP 圖片 + MediaAsset metadata
   ↓
漫畫預覽：單格重生、手動上傳、圖片歷史、單圖下載、拖曳排序
```

### 圖片模型支援

- **Provider Adapter First**：pipeline 只依賴 `ImageGenerationProvider`，不直接綁單一模型。
- **本地 MVP**：ComfyUI HTTP API，支援 workflow JSON、prompt / negative / seed / size node mapping、submit / poll / download。
- **線上 MVP**：OpenAI-compatible image provider，支援自訂 endpoint / model / API key，回傳 image URL 或 base64 後 normalize。
- **DeepInfra FLUX**：支援 reference image request 欄位。
- **Google Gemini Image**：獨立圖片 provider 設定，支援多張 reference image。
- **角色一致性**：必做 visual continuity bible；可選 reference image。provider 不支援 reference image 時降級為 prompt-only。
- **Prompt Composer**：生圖前集中組合 style、active characters、active scene、panel visual prompt、extras、continuity notes，並保存 final prompt snapshot。
- **龍套/群眾策略**：Named characters 進 Visual Bible；跨多格 recurring groups 進 `extraGroupsJson`；一次性背景龍套直接留在 panel `visualPrompt`。

### 2026-06-03 Phase 6 reference-image update

- `SceneVisual` provides project-level reusable scene prompt / negative prompt / reference image settings.
- Comic panels can select a scene, create a scene from the panel location, and opt into `useContinuityReference`.
- Character, scene, and continuity images are resolved into `referenceImages` before calling an image provider.
- Providers advertise `referenceMode` and `maxReferenceImages`; unsupported providers degrade to prompt-only with panel warnings.
- DeepInfra FLUX-2-pro is supported through provider-specific `input_image`, `input_image_2`, ... fields.
- ComfyUI can map reference images into configured reference image nodes.

### 2026-06 Phase 6 editing/history update

- Comic modal now uses a full-screen three-column workspace: chapter/panel rail, selected panel editor, and shared selectors/sidebar.
- Panels can be inserted, deleted, renamed, and reordered with pointer-based dragging.
- Each generated or uploaded panel image is stored as a `ComicPanelImageVariant`; the panel keeps only the current selected `assetId`.
- Users can upload an image for the selected panel, switch current variants, delete non-current variants, and download the selected image with visible feedback.
- Remote generated image URLs are persisted as data URLs when needed, reducing breakage from expiring provider URLs.

### 2026-06 Phase 6 TTS / video / library update

- Comic panels now carry narration and timing metadata. `durationSec: 0` uses measured TTS duration; manual duration remains available as a fallback.
- Desktop video export uses Edge-TTS for panel narration audio and ffmpeg sidecar commands for MP4 rendering.
- Per-panel `單格輸出 MP4` writes a reusable `MediaAsset(kind='video')` and stores the id on `ComicPanel.segmentAssetId`.
- `整章輸出 MP4` reuses matching panel segments where possible, concatenates them into a chapter MP4, and stores the id on `ChapterComic.videoAssetId`.
- Full-chapter export validates every panel first. Missing images or narration are shown in a dismissible top notice instead of failing silently.
- ComicModal includes a chapter-scoped `影片庫` popup for current chapter MP4 files and panel segments, with open, reveal in folder, delete, and rerender actions.

### 儲存規則

- **metadata 進 StorageAdapter**：ChapterComic、ComicPanel、ComicPanelImageVariant、MediaAsset、SceneVisual、provider params、seed、錯誤狀態。
- **圖片 metadata**：生成或上傳圖片以 `MediaAsset` + `ComicPanelImageVariant` 追蹤；需要時會把遠端 URL 正規化為可持久化 data URL。
- **桌面版 TTS / MP4 binary**：透過 Tauri 安全命令寫入 app/project output media root，路徑記錄於 `MediaAsset.path`；TTS 使用 `kind='tts_audio'`，影片使用 `kind='video'`。
- **關聯欄位**：單格影片掛在 `ComicPanel.segmentAssetId`；整章影片掛在 `ChapterComic.videoAssetId`。
- 大型 binary 不應長期塞進 SQLite；跨章節全書級媒體管理仍需補完整媒體庫 UI。

### TODO / advanced polish

- 新增全書級「媒體庫」：跨章節彙整 `MediaAsset` 圖片、音訊、影片，支援搜尋 / 篩選、開啟 / 定位、刪除、孤兒檔清理與批次匯出。
- 補更完整的 Visual Bible 管理 UI、provider reference weighting、批次圖片 / 影片下載，以及 Web 版影片輸出的降級策略。

### 為何走桌面

- 一章十幾~幾十張 PNG（每張 1-3 MB），全本累積到 GB 級 — 瀏覽器配額卡死
- ffmpeg.wasm 跑影片合成慢且耗記憶體；Tauri 用 native ffmpeg 快 10x+
- 大檔案（>2GB mp4）走瀏覽器下載流程不可靠

詳細部署規劃見 [specs/roadmap.md](../specs/roadmap.md) Phase 5 / 6。
