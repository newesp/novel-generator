# 模組 10｜多媒體生成模組

> Phase / 依賴：見 [README 模組總表](../README.md#模組總表)

## 功能列表

| 功能            | 描述                        | 技術方案                                   | Phase |
| ------------- | ------------------------- | -------------------------------------- | ----- |
| 封面圖生成         | 一鍵生成專業小說封面                | gemini-2.5-flash-image / Flux / DALL·E | 4     |
| 章節轉漫畫圖片 MVP | 章節 → 可編輯分鏡 → 批次生成連續漫畫圖 | ComfyUI HTTP API / OpenAI-compatible image provider | 6 |
| 語音朗讀          | 章節轉 TTS（支援多角色不同音色）        | Edge-TTS / ElevenLabs                  | 4     |
| 漫畫 + TTS → 影片 | 連續漫畫圖 + AI 念稿 → 合成 mp4    | ffmpeg sidecar（Tauri 桌面）               | 6     |

---

## 整合方式

- 章節工具列增加「多媒體」按鈕（封面、漫畫、語音、影片）
- 生成後可預覽、單一面板重新生成
- EPUB 輸出時可選擇嵌入封面與插圖

---

## 漫畫圖片 MVP（Phase 6）

> 設計：`docs/superpowers/specs/2026-05-28-phase-6-comic-images-design.md`  
> Visual Bible：`docs/superpowers/specs/2026-05-29-phase-6-visual-bible-design.md`  
> MVP 先做「選擇章節 → 生成可編輯分鏡 → 批次生成連續漫畫圖片」。TTS / 影片合成保留擴充點，後續獨立 spec。

```
章節文本
   ↓ novel-to-storyboard（章節 + 角色卡 + Wiki）
可編輯分鏡（每格：構圖、角色、prompt、negative prompt、對白/旁白）
   ↓
ImageGenerationProvider
   ├─→ ComfyUI HTTP API（本地）
   └─→ OpenAI-compatible image API（線上）
   ↓
PNG / JPG / WEBP 圖片 + MediaAsset metadata
   ↓
漫畫預覽：單格重生、失敗重試、替換圖片、下載圖片包
```

### 圖片模型支援

- **Provider Adapter First**：pipeline 只依賴 `ImageGenerationProvider`，不直接綁單一模型。
- **本地 MVP**：ComfyUI HTTP API，支援 workflow JSON、prompt / negative / seed / size node mapping、submit / poll / download。
- **線上 MVP**：OpenAI-compatible image provider，支援自訂 endpoint / model / API key，回傳 image URL 或 base64 後 normalize。
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

### 儲存規則

- **metadata 進 SQLite**：ChapterComic、ComicPanel、MediaAsset、provider params、seed、錯誤狀態
- **binary 進檔案系統**：`<project_folder>/media/chXX/panel-NN.png`
- DB 不存大型 binary（避免膨脹）

### 為何走桌面

- 一章十幾~幾十張 PNG（每張 1-3 MB），全本累積到 GB 級 — 瀏覽器配額卡死
- ffmpeg.wasm 跑影片合成慢且耗記憶體；Tauri 用 native ffmpeg 快 10x+
- 大檔案（>2GB mp4）走瀏覽器下載流程不可靠

詳細部署規劃見 [specs/roadmap.md](../specs/roadmap.md) Phase 5 / 6。
