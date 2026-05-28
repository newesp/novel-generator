# Phase 6 漫畫圖片 MVP 設計

> **狀態：** 設計完成，待實作計畫  
> **日期：** 2026-05-28  
> **範圍：** 選擇章節 → 生成可編輯分鏡 → 批次生成連續漫畫圖片  
> **不在 MVP 範圍：** TTS、影片合成、完整漫畫排版輸出、跨模型保證完全一致的角色臉

---

## 1. 決策摘要

| 議題 | 決策 |
|------|------|
| MVP 範圍 | 只做「章節轉連續漫畫圖片」；TTS / 影片只保留資料結構擴充點 |
| 架構策略 | **Provider Adapter First**，pipeline 不直接依賴單一圖片模型 |
| 本地模型 | MVP 優先支援 **ComfyUI HTTP API** |
| 線上模型 | MVP 支援 **OpenAI-compatible image provider**，以 endpoint/model/API key 設定 |
| 分鏡流程 | 先產生可編輯 storyboard，使用者確認後再批次生圖 |
| 角色一致性 | 必做 visual continuity bible；可選 reference image；provider 不支援時降級 prompt-only |
| 儲存策略 | metadata 進 DB；圖片 binary 不進 DB，桌面版寫檔案系統，Web fallback 後補或降級 |

---

## 2. 目標

Phase 6 的第一個可用切片，是讓使用者在章節編輯器中選擇一章，按「轉漫畫」，得到一組連續、可預覽、可單格重生的漫畫圖片。

成功標準：
- 使用者能從章節產生 8-20 格分鏡草稿。
- 每格分鏡可編輯 prompt、negative prompt、角色、鏡頭、對白/旁白。
- 使用者確認後，系統可用本地 ComfyUI 或線上 OpenAI-compatible provider 批次生成圖片。
- 每格圖片有可追溯的 provider、model/workflow、prompt、seed、錯誤狀態與 asset metadata。
- 任一單格失敗不會使整個 comic job 報廢；可重試或單格重生。

---

## 3. 非目標

- 不在 MVP 中合成 mp4。
- 不在 MVP 中生成 TTS audio。
- 不承諾跨不同 provider 得到完全一致的角色臉。
- 不在 MVP 中設計完整漫畫書排版、對白框渲染或 EPUB 插圖自動排版。
- 不要求 Web 版承擔大量圖片儲存；大型工作流優先桌面版。

---

## 4. 系統切分

```
Chapter + Wiki + Characters
        ↓
Storyboard Pipeline
        ↓
Editable Storyboard Panels
        ↓
Image Job Queue
        ↓
ImageGenerationProvider
   ├─ ComfyUIProvider (local)
   └─ OpenAICompatibleImageProvider (online)
        ↓
MediaAsset Storage
        ↓
Comic Preview
```

### 4.1 Storyboard Pipeline

輸入：
- selected chapter title/content
- character cards
- relevant Wiki summaries/entities
- style preset
- target panel count

輸出：
- `visualContinuityBible`
- ordered `ComicPanel` drafts
- quality notes

此層應復用 `skills/novel-to-storyboard/` 的 schema 與規則，並在 app 內轉成持久化資料模型。

### 4.2 Storyboard Editor

使用者在生圖前確認分鏡。每格至少可編輯：
- beat / summary
- characters
- location
- shot type
- camera angle
- visual prompt
- negative prompt
- dialogue
- narration
- duration seconds

這一步是成本控制點：避免圖片生成後才發現整批方向錯誤。

### 4.3 Image Job Queue

queue 管理每格圖片生成：
- `queued`
- `generating`
- `ready`
- `failed`
- `cancelled`

需求：
- 可取消整批。
- 可重試失敗格。
- 可單格重生，保留或更換 seed。
- 每次生成保存 provider config snapshot 與 generation params。

### 4.4 ImageGenerationProvider

圖片模型全部走 provider adapter。pipeline 不直接知道 ComfyUI 或線上 API 細節。

```ts
interface ImageGenerationProvider {
  id: string;
  label: string;
  kind: 'local' | 'online';
  capabilities: ImageProviderCapabilities;

  validateConfig(config: ImageProviderConfig): Promise<ProviderHealth>;
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}
```

```ts
interface ImageProviderCapabilities {
  negativePrompt: boolean;
  seed: boolean;
  referenceImages: boolean;
  batch: boolean;
  polling: boolean;
  outputFormats: Array<'png' | 'jpg' | 'webp'>;
  supportedSizes?: Array<{ width: number; height: number }>;
  freeformSize: boolean;
  maxPromptChars?: number;
}
```

```ts
interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  referenceImages?: MediaAssetRef[];
  stylePreset?: string;
  panelId: string;
  providerConfig: ImageProviderConfig;
}
```

---

## 5. Provider 設計

### 5.1 ComfyUIProvider

設定欄位：
- `baseUrl`
- `workflowJson`
- `promptNodeId`
- `negativePromptNodeId`
- `seedNodeId`
- `widthNodeId`
- `heightNodeId`
- `outputNodeId`
- optional `referenceImageNodeIds`

流程：
1. health check：讀 `/system_stats` 或可用的輕量 endpoint。
2. 將 request 填入 workflow JSON 對應 node。
3. POST `/prompt`。
4. poll `/history/{prompt_id}`。
5. 從 history 找 output image。
6. GET `/view?...` 下載 binary。
7. 寫入 media storage，回傳 `MediaAsset` metadata。

錯誤需轉成可讀訊息：
- base URL 連不上
- workflow JSON 無效
- node id 不存在
- ComfyUI queue / execution error
- 找不到 output image
- 下載 image 失敗

### 5.2 OpenAICompatibleImageProvider

設定欄位：
- `baseUrl`
- `apiKey`
- `model`
- optional default size / format

行為：
- request 使用 OpenAI-compatible image generation common subset。
- response normalize 支援 `url` 或 `base64`。
- 不強制 seed / reference image；capability 由 provider preset 或 health metadata 決定。

錯誤需轉成可讀訊息：
- API key missing / unauthorized
- model not found
- rate limit
- unsupported size
- response format unsupported

---

## 6. 角色一致性

MVP 採兩層：

1. **Visual Continuity Bible（必做）**
   - 從角色卡、Wiki entity、章節內容生成。
   - 記錄角色外觀、服裝、髮型、道具、傷勢、情緒基調。
   - 每格 prompt 都重複該格出現角色的穩定識別語。

2. **Reference Image（可選）**
   - 每個主要角色可綁定一張 reference image。
   - ComfyUI provider 可用 workflow node 接 IP-Adapter / reference workflow。
   - 線上 provider 若不支援 reference image，UI 顯示降級為 prompt-only。

不承諾不同模型間完全一致，UI 需明確標示 provider capabilities。

---

## 7. 資料模型

### 7.1 ChapterComic

代表某章的一次漫畫化工作。

```ts
interface ChapterComic {
  id: string;
  projectId: string;
  chapterId: string;
  title: string;
  status: 'draft' | 'storyboard_ready' | 'generating' | 'ready' | 'partial' | 'failed';
  stylePreset: string;
  providerId: string;
  targetPanelCount?: number;
  visualContinuityBibleJson: string;
  createdAt: number;
  updatedAt: number;
}
```

### 7.2 ComicPanel

代表一格分鏡。

```ts
interface ComicPanel {
  id: string;
  comicId: string;
  order: number;
  beat: string;
  characters: string[];
  location: string;
  shotType: string;
  cameraAngle: string;
  visualPrompt: string;
  negativePrompt: string;
  dialogue: string;
  narration: string;
  durationSec: number;
  seed?: number;
  assetId?: string;
  status: 'draft' | 'queued' | 'generating' | 'ready' | 'failed';
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}
```

### 7.3 MediaAsset

代表圖片檔 metadata。Phase 5 已有 `media_assets` 佔位，Phase 6 實作時需正式接入 storage adapter。

```ts
interface MediaAsset {
  id: string;
  projectId: string;
  chapterId?: string;
  kind: 'comic_panel_image' | 'tts_audio' | 'video';
  path?: string;
  url?: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  providerId?: string;
  generationParamsJson?: string;
  createdAt: number;
}
```

### 7.4 儲存策略

- metadata 進 DB。
- binary 不進 DB。
- 桌面版：寫到 app data / project media folder，例如：
  `media/<projectId>/chapters/<chapterId>/comic/<panelId>.png`
- Web 版：MVP 可先隱藏大型批次功能，或用 IndexedDB Blob / object URL 作降級。

---

## 8. UI 工作流

1. 章節工具列顯示「轉漫畫」。
2. 使用者選 style preset、panel count、provider、尺寸。
3. 系統產生 storyboard draft。
4. 使用者在 Storyboard Editor 中確認/修改每格。
5. 使用者按「開始生圖」。
6. Batch panel 顯示進度、失敗與重試。
7. Comic Preview 顯示連續圖片，可單格重生、替換圖片、下載圖片包。

偏好設定需新增「圖片模型」區：
- Provider type：ComfyUI / OpenAI-compatible
- ComfyUI base URL + workflow mapping
- Online base URL + model + API key
- capability/health check result

---

## 9. 錯誤與降級

| 情境 | 行為 |
|------|------|
| ComfyUI 連不上 | 阻止開始批次，提示 base URL / server 狀態 |
| workflow node mapping 錯 | 阻止開始批次，列出缺少 node |
| 單格生成失敗 | comic 進入 `partial`，該 panel `failed`，可重試 |
| provider 不支援 reference image | 降級 prompt-only，UI 顯示 capability 限制 |
| 線上 API rate limit | 該 job failed，錯誤訊息保留，使用者可稍後重試 |
| Web 版大量圖片 | 顯示「建議使用桌面版」或限制 panel count |

---

## 10. 測試策略

單元測試：
- storyboard schema parse / normalize
- visual continuity bible merge
- provider registry
- capability-based UI decision
- ComfyUI workflow node replacement
- ComfyUI history response normalize
- OpenAI-compatible response normalize
- image job queue retry/cancel/status transition

整合測試：
- fake ComfyUI server：submit → poll → image bytes
- fake OpenAI-compatible server：base64/url response
- selected chapter → storyboard draft → panel jobs → media assets metadata

UI smoke：
- chapter toolbar opens comic flow
- storyboard editor can edit a panel
- failed panel can be retried
- ready comic preview shows generated assets

---

## 11. 實作切片

1. Types + storage schema + media asset store。
2. Provider interface + registry + settings UI skeleton。
3. Storyboard pipeline + schema validation。
4. Storyboard editor。
5. ComfyUI provider。
6. OpenAI-compatible image provider。
7. Image job queue。
8. Comic preview + single panel regenerate。
9. Download image bundle。

TTS / video 應在此 MVP 穩定後再開獨立 spec，直接復用 `ChapterComic`、`ComicPanel`、`MediaAsset`。
