# Phase 6.1 Visual Bible 設計

> **日期：** 2026-05-29  
> **範圍：** 角色與場景視覺提示詞獨立化、跨章節引用、漫畫生成時保存快照  
> **依賴：** Phase 6 漫畫圖片 MVP、Wiki entity/location、media asset metadata  
> **不在本版範圍：** 自動訓練 LoRA、完整漫畫排版、TTS/影片合成、整本書批次漫畫化

---

## 1. 背景與目標

目前 Phase 6 漫畫圖片 MVP 已能從章節生成分鏡，並用圖片 provider 批次生成漫畫圖片。但每格主要依賴自己的 `visualPrompt`，角色外觀、場景風格、服裝、道具與光線容易在跨格或跨章節時漂移。

Phase 6.1 的目標是把「角色與場景提示詞」升級為 Project 層級的視覺資產：

- 角色 visual prompt 獨立於章節，可跨章節重用。
- 場景 visual prompt 獨立於章節，可跨章節重用。
- 每次生成漫畫時，引用當下的角色/場景/風格設定，並保存一份 snapshot。
- 單格圖片 prompt 由集中式 Prompt Composer 組合，不由 UI 零散拼接。
- Provider 若支援 reference image，能使用角色/場景 anchor；不支援時自動降級為 prompt-only。

---

## 2. 核心原則

### 2.1 角色與場景是 Project 層級資產

角色與場景不屬於單一章節，也不屬於單次漫畫生成。它們應該作為 Project Visual Bible 的一部分，被多個章節和多次漫畫任務引用。

範例：

```text
entity/a-fei
  variant: default
  variant: injured
  variant: city-uniform

location/mist-tide
  variant: default
  variant: night-rain
  variant: after-explosion
```

### 2.2 漫畫任務保存生成快照

每次生成漫畫時，系統把當下實際用到的 visual bible entry 複製到 comic job snapshot。這份 snapshot 用於重開舊漫畫、debug、單格重生與日後影片合成。

這表示：

- 新漫畫使用最新 Project Visual Bible。
- 舊漫畫保留當時使用的視覺設定。
- 使用者可選擇「用舊 snapshot 重生」或「升級到最新 Visual Bible 後重生」。

### 2.3 每格只注入 active context

每格只注入該格出現的角色、該格所在場景，以及該格需要的 continuity notes。不把全專案所有角色/場景塞入 prompt，避免 prompt 污染、角色混淆與 token 浪費。

---

## 3. 架構

```text
Project Wiki / Characters / Locations
        |
        v
Visual Bible Entry Store
  - character entries
  - scene entries
  - style entries
        |
        v
Chapter Comic Job
  - storyboard panels
  - selected visual entries
  - visual bible snapshot
        |
        v
Prompt Composer
  - global style
  - active character prompts
  - active scene prompt
  - panel visual prompt
  - continuity notes
  - negative prompt
        |
        v
ImageGenerationProvider
  - ComfyUI
  - OpenAI-compatible image
```

---

## 4. 資料模型

### 4.1 VisualBibleEntry

Project 層級的視覺資產。角色、場景、全局風格都用同一張表/同一個 store 表示。

```ts
interface VisualBibleEntry {
  id: string;
  projectId: string;
  targetType: 'character' | 'scene' | 'style';
  targetSlug: string;
  variant: string;
  title: string;
  prompt: string;
  negativePrompt: string;
  referenceAssetIds: string[];
  sourceWikiSlug?: string;
  sourceCharacterId?: string;
  createdAt: number;
  updatedAt: number;
}
```

欄位說明：

| 欄位 | 說明 |
|------|------|
| `targetType` | 視覺資產類型：角色、場景、全局風格 |
| `targetSlug` | 對應 Wiki slug 或穩定識別碼，例如 `entity/a-fei` |
| `variant` | 造型或狀態版本，例如 `default`、`injured`、`night-rain` |
| `prompt` | 正向視覺提示詞 |
| `negativePrompt` | 負向提示詞，可為空 |
| `referenceAssetIds` | anchor/reference 圖片 assets |
| `sourceWikiSlug` | 來源 Wiki page，用於回溯與重新抽取 |
| `sourceCharacterId` | 若來源是角色卡，保存角色 id |

### 4.2 ChapterComic 擴充

保留既有 `visualContinuityBibleJson`，但新版以 `visualBibleSnapshotJson` 作為正式生成快照欄位。舊欄位可在 migration 或讀取時轉為 snapshot 的一部分。

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
  visualBibleSnapshotJson: string;
  createdAt: number;
  updatedAt: number;
}
```

Snapshot 結構：

```ts
interface VisualBibleSnapshot {
  version: 1;
  capturedAt: number;
  entries: Array<{
    entryId: string;
    targetType: 'character' | 'scene' | 'style';
    targetSlug: string;
    variant: string;
    title: string;
    prompt: string;
    negativePrompt: string;
    referenceAssetIds: string[];
  }>;
}
```

### 4.3 ComicPanel 擴充

每格分鏡保存 active context 與最終 prompt snapshot。

```ts
interface ComicPanel {
  id: string;
  comicId: string;
  order: number;
  beat: string;
  characters: string[];
  location: string;
  characterSlugsJson: string;
  sceneSlug: string;
  characterVariantsJson: string;
  sceneVariant: string;
  referenceMode: 'none' | 'previous-panel' | 'character-anchor' | 'scene-anchor' | 'previous-plus-anchor';
  continuityNotes: string;
  shotType: string;
  cameraAngle: string;
  visualPrompt: string;
  negativePrompt: string;
  finalPromptSnapshot: string;
  finalNegativePromptSnapshot: string;
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

---

## 5. 生成流程

### 5.1 初次轉漫畫

```text
1. 使用者在章節編輯器按「轉漫畫」
2. 系統生成 storyboard draft
3. 系統從 Wiki entity/location 與角色卡取得候選 Visual Bible entries
4. 若角色/場景沒有 Visual Bible entry，產生 draft entry 供使用者確認
5. 使用者在 Visual Bible 區塊編輯角色、場景、風格 prompt
6. 每格 panel 標記 active characters、scene、referenceMode
7. 開始生圖前，系統捕捉 visualBibleSnapshotJson
8. Prompt Composer 逐格生成 final prompt
9. Image Job Queue 依序送 provider 生圖
10. 每格保存 finalPromptSnapshot、assetId、status
```

### 5.2 舊漫畫單格重生

單格重生時預設使用 comic job 的 snapshot，確保結果可追蹤。UI 提供「使用最新 Visual Bible」選項，若開啟則重新 compose prompt，並更新該格 final prompt snapshot。

### 5.3 跨章節生成

跨章節生成時，系統不重新發明角色/場景描述，而是引用 Project Visual Bible：

```text
第 1 章 panel -> entity/a-fei default + location/mist-tide default
第 8 章 panel -> entity/a-fei injured + location/mist-tide night-rain
第 120 章 panel -> entity/a-fei city-uniform + location/star-city default
```

---

## 6. Prompt Composer

新增 `src/lib/comic/prompt-composer.ts`，集中處理 prompt 組合。

```ts
interface ComposeComicImagePromptInput {
  panel: ComicPanel;
  visualBible: VisualBibleSnapshot;
  stylePreset: string;
  providerMaxPromptChars?: number;
}

interface ComposedComicPrompt {
  prompt: string;
  negativePrompt: string;
  referenceAssetIds: string[];
  warnings: string[];
}
```

組合順序：

```text
Global Style Prompt
+ Active Character Prompts
+ Active Scene Prompt
+ Panel Visual Prompt
+ Continuity Notes
```

Negative prompt 組合順序：

```text
Global Negative Prompt
+ Active Character Negative Prompts
+ Active Scene Negative Prompt
+ Panel Negative Prompt
```

Reference assets 選取規則：

| referenceMode | referenceAssetIds |
|---------------|-------------------|
| `none` | 空 |
| `previous-panel` | 上一格 asset |
| `character-anchor` | active characters 的 reference assets |
| `scene-anchor` | active scene 的 reference assets |
| `previous-plus-anchor` | 上一格 asset + active character/scene anchors |

若 provider capability 不支援 reference image，Prompt Composer 仍輸出 referenceAssetIds，但 provider adapter 會回傳 warning 並降級為 prompt-only。

---

## 7. UI 規劃

### 7.1 ComicModal 新增 Visual Bible 區塊

在「生成分鏡」後、「開始生圖」前顯示：

- Global Style
- Characters
- Scenes
- Negative Prompt

每個角色/場景 row 顯示：

- 名稱與 slug
- variant selector
- prompt textarea
- negative prompt textarea
- reference image chips
- 來源 Wiki 連結

### 7.2 Panel 編輯區擴充

每格 panel 增加：

- active characters multi-select
- scene select
- referenceMode select
- continuity notes textarea
- final prompt preview

Final prompt preview 預設摺疊，避免 UI 過長。

### 7.3 長篇使用體驗

對 300 章以上專案，Visual Bible 不應每章展開全部角色/場景。ComicModal 只顯示本章 storyboard 使用到的 entries，並提供「加入其他角色/場景」搜尋入口。

---

## 8. Provider 能力與降級

### 8.1 ComfyUI

ComfyUI 是 reference-aware 的主要目標。Phase 6.1 只定義 capability 與資料流，不強制第一版完成 IP-Adapter workflow。

Provider config 預留：

```ts
interface ComfyUIImageProviderConfig {
  baseUrl: string;
  workflowJson: string;
  promptNodeId: string;
  negativePromptNodeId?: string;
  seedNodeId?: string;
  widthNodeId?: string;
  heightNodeId?: string;
  referenceImageNodeIds?: string[];
}
```

若 workflow 未設定 reference node，仍可使用 prompt-only。

### 8.2 OpenAI-compatible Image

OpenAI-compatible provider 預設視為 prompt-only。若特定 provider 支援 reference images，未來可用 provider preset 打開 `referenceImages` capability。

---

## 9. 錯誤處理

| 情況 | 處理 |
|------|------|
| panel 引用不存在的角色/場景 entry | 顯示 warning，該格可降級只用 panel prompt |
| Visual Bible entry prompt 為空 | 顯示 warning，開始生圖前要求補齊或略過該 entry |
| provider 不支援 reference image | 顯示降級提示，仍允許 prompt-only 生圖 |
| snapshot 與 Project Visual Bible 不一致 | 舊漫畫使用 snapshot；若使用者選擇更新，重新捕捉 snapshot |
| reference asset 遺失 | 忽略該 asset 並顯示 warning，不阻塞整批 |

---

## 10. 測試策略

### 10.1 Unit Tests

- Visual Bible entry normalize / migration helper
- Wiki entity/location 到 Visual Bible draft 的轉換
- Prompt Composer 組合順序
- Active context 只注入本格角色/場景
- referenceMode 到 referenceAssetIds 的解析
- provider 不支援 reference image 時降級 warning
- snapshot capture 與舊漫畫重生邏輯

### 10.2 Integration Tests

- selected chapter -> storyboard -> visual bible draft -> snapshot -> composed panel prompts
- 修改 Project Visual Bible 後，舊 comic snapshot 不變
- 使用最新 Visual Bible 重生單格時，更新該格 final prompt snapshot

### 10.3 UI Tests

- ComicModal 顯示本章用到的角色/場景 entries
- 使用者可編輯角色/場景 prompt
- panel 可選 active characters / scene / referenceMode
- final prompt preview 可展開檢查

---

## 11. MVP 切分

### 11.1 Phase 6.1 MVP

1. 新增 Visual Bible 資料型別與 storage store。
2. 從 Wiki entity/location 與角色卡建立 draft entries。
3. ComicModal 新增 Visual Bible 編輯區。
4. ComicPanel 增加 active character/scene/referenceMode 欄位。
5. 實作 Prompt Composer。
6. 生圖前保存 `visualBibleSnapshotJson`。
7. 生圖時保存 `finalPromptSnapshot` 與 `finalNegativePromptSnapshot`。

### 11.2 Advanced Polish

- 自動生成角色定稿圖。
- 自動生成場景定稿圖。
- ComfyUI reference workflow UI helper。
- IP-Adapter / ControlNet 權重設定。
- Visual Bible 版本比較與回滾。
- 整本書級別批次漫畫化。
- 分鏡跨章節 continuity plan。

---

## 12. 相容性與 migration

現有 `visualContinuityBibleJson` 保留，避免破壞已建立的 comic job。讀取舊 comic 時：

1. 若 `visualBibleSnapshotJson` 存在，使用新版 snapshot。
2. 若不存在但 `visualContinuityBibleJson` 存在，包裝成 v1 snapshot fallback。
3. 若兩者都不存在，使用空 snapshot，並提示使用者重新生成 Visual Bible。

SQLite / Dexie migration 需新增：

- `visual_bible_entries`
- `chapter_comics.visual_bible_snapshot_json`
- `comic_panels.character_slugs_json`
- `comic_panels.scene_slug`
- `comic_panels.character_variants_json`
- `comic_panels.scene_variant`
- `comic_panels.reference_mode`
- `comic_panels.continuity_notes`
- `comic_panels.final_prompt_snapshot`
- `comic_panels.final_negative_prompt_snapshot`

---

## 13. 決策摘要

| 決策 | 結論 |
|------|------|
| 角色與場景提示詞是否獨立 | 是，作為 Project Visual Bible entries |
| 是否跨章節重用 | 是，章節只引用 active entries |
| 是否保存生成快照 | 是，每次 comic job 捕捉 snapshot |
| 是否一開始做 reference image | 資料流與 capability 先設計；MVP 可 prompt-only |
| 舊漫畫如何處理 | 優先讀 snapshot，沒有就從 `visualContinuityBibleJson` fallback |
| Prompt 組合位置 | 集中在 Prompt Composer，不放在 UI |

