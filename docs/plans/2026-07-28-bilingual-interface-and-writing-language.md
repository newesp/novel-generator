# 中英雙語介面與書籍創作語言：功能規格與實作計畫

日期：2026-07-28

狀態：規劃完成，待實作

## 目標

將目前固定繁體中文的 Web／Tauri App 擴充為繁體中文與英文介面，並新增與介面語系完全獨立的書籍創作語言。使用者可隨時切換 App 介面，但每本書的創作語言在建立時選定，之後不可變更。

本計畫的共通語言見 [`CONTEXT.md`](../../CONTEXT.md)，英文題材、風格與節拍的來源查證見 [`docs/research/2026-07-28-bilingual-genre-terminology.md`](../research/2026-07-28-bilingual-genre-terminology.md)，邊界決策見 [`docs/adr/0001-separate-interface-locale-and-writing-language.md`](../adr/0001-separate-interface-locale-and-writing-language.md)。

## 已確認的產品決策

| 主題 | 決策 |
| --- | --- |
| 支援介面 | `zh-TW`（繁體中文）與 `en`（English） |
| 介面語系範圍 | App 自有標籤、按鈕、說明、狀態、錯誤、確認訊息、日期／數字格式、視窗標題與無障礙文字 |
| 全新安裝 | 第一次啟動偵測 `navigator.languages`；`zh-*` 選繁中，其餘選英文 |
| 既有安裝 | 升級後維持繁中，不因系統語系而改變 |
| 語系保存 | 使用者選定後永久保存；儲存後立即生效，不需重啟 |
| 新書預設創作語言 | 全新安裝時初始值跟隨首次偵測的介面語系，之後與介面語系獨立 |
| 書籍創作語言 | 建立書籍時選定並寫入書籍；建立後不可變更 |
| 舊書遷移 | 沒有語言欄位的既有書籍與舊備份一律補為 `zh-Hant` |
| 現有內容 | 不自動翻譯書名、正文、角色、Wiki、自訂欄位或任何既有使用者內容 |
| 內建 Prompt | 提供繁中與英文版本；未修改的內建預設可隨介面語系切換 |
| 自訂 Prompt | 永遠保留原文，不自動翻譯或覆寫；可手動還原為目前介面語系的內建版本 |
| AI 輸出 | 只依書籍創作語言，不依介面語系或 Prompt 文字所用語言 |
| 技術提示詞 | 生圖 `visualPrompt`、negative prompt 等可維持供應商效果較好的英文 |
| Multi-Agent | 建立 Run 時把創作語言寫入 Context Snapshot；整次 Run 使用同一語言 |
| 匯出 | HTML／EPUB 語言中繼資料取自書籍創作語言 |
| TTS | 依書籍創作語言篩選／建議語音；手動選定的有效 voice 仍保留 |

## 非目標

- 不支援簡體中文介面。
- 不提供執行期機器翻譯或自動翻譯使用者內容。
- 不讓創作語言隨介面語系切換。
- 不允許建立書籍後修改創作語言。
- 不翻譯 API、模型、Provider、檔名、slug、資料識別碼或外部服務回傳的原始錯誤內容。
- 不把所有技術 Prompt 強制改成書籍創作語言。
- 不在這次加入第三種介面語系或第三種創作語言；資料型別應保留日後擴充空間。

## 使用者流程

### 首次啟動與升級

1. 啟動語言解析器先判斷是否已有 `novel-generator-settings`。
2. 全新安裝依系統／瀏覽器語系解析 `interfaceLocale`：
   - 任一偏好語系以 `zh` 開頭：`zh-TW`
   - 其餘：`en`
3. 同一次首次初始化把 `defaultWritingLanguage` 設為：
   - `zh-TW` 介面 → `zh-Hant`
   - `en` 介面 → `en`
4. 既有持久化設定缺少新欄位時，兩者固定補為繁中，不重新偵測系統語系。
5. 啟動後同步更新 `<html lang>` 與文件標題。

### 偏好設定

偏好設定新增第一個「一般／General」分頁：

- 介面語系／Interface Language
- 新書預設創作語言／Default Writing Language

介面語系儲存後立即重新渲染 App。新書預設創作語言只影響之後開啟的新增書本表單，不回寫任何既有書籍。

### 建立與查看書籍

- `NewBookModal` 新增必選「創作語言／Writing Language」，預填全域預設。
- `HomePage.createProject` 必須把選定值寫入 `Project.writingLanguage`。
- 大綱基本設定以唯讀文字或 badge 顯示創作語言，不提供 Select 或更新動作。
- 書本卡片可顯示簡短語言 badge；若版面過擠可省略，但建立後至少要有一個位置可確認書籍語言。

## 型別與資料模型

### 語言型別

```ts
export type InterfaceLocale = 'zh-TW' | 'en';
export type WritingLanguage = 'zh-Hant' | 'en';
```

- `InterfaceLocale` 用於 UI catalog、`Intl` 與 `document.documentElement.lang`。
- `WritingLanguage` 用於 AI 輸出契約、書籍資料、HTML／EPUB metadata 與 TTS voice family。
- TTS 可把 `zh-Hant` 映射到 `zh-TW` voice、把 `en` 映射到預設 `en-US` voice，但不可把 TTS locale 反寫為書籍創作語言。

### 書籍與生成快照

```ts
interface Project {
  // existing fields...
  writingLanguage: WritingLanguage;
}

interface GenerationContextSnapshot {
  // existing fields...
  writingLanguage: WritingLanguage;
}
```

`writingLanguage` 不應加入 `ProjectStore.update` 可編輯表單的 patch。若要在型別層強化不可變性，可另外定義：

```ts
type MutableProjectFields = Omit<Project, 'id' | 'createdAt' | 'writingLanguage'>;
```

UI 只可透過建立書籍流程寫入語言。儲存與匯入層仍需能補齊舊資料，因此底層 normalization 可建立完整 `Project`。

### 全域偏好

`SettingsState` 新增：

```ts
interfaceLocale: InterfaceLocale;
defaultWritingLanguage: WritingLanguage;
setInterfaceLocale(locale: InterfaceLocale): void;
setDefaultWritingLanguage(language: WritingLanguage): void;
```

偏好設定 JSON 備份 schema 升級，匯出包含這兩欄。匯入舊 schema 時補繁中；匯入新 schema 時不得改動任何書籍的 `writingLanguage`，因設定備份本來就不含書籍。

### 可在地化的內建選項

內建題材、風格與節拍不再把顯示文字當作資料值。建議使用可辨識 preset 與自訂文字的 discriminated union：

```ts
type PresetOrCustom<Code extends string> =
  | { kind: 'preset'; code: Code }
  | { kind: 'custom'; value: string };
```

代碼如下：

```ts
type GenrePreset =
  | 'xuanhuan'
  | 'urban'
  | 'xianxia'
  | 'science_fiction'
  | 'romance'
  | 'mystery_suspense';

type StylePreset =
  | 'lighthearted'
  | 'somber'
  | 'dark'
  | 'high_energy'
  | 'humorous'
  | 'wish_fulfillment';

type StoryBeatPreset =
  | 'inciting_incident'
  | 'rising_action'
  | 'midpoint'
  | 'climax'
  | 'resolution'
  | 'setup_transition';
```

`Custom` 是 UI 動作，不是 preset code；選到 Custom 後保存 `{ kind: 'custom', value }`。

顯示與 Prompt 使用不同解析目標：

- UI：依 `InterfaceLocale` 顯示 localized label。
- AI context：依書籍 `WritingLanguage` 提供語意名稱。
- 自訂值：兩處都保留使用者原文。

建議英文顯示名稱：

| Code | 繁中 | English |
| --- | --- | --- |
| `xuanhuan` | 玄幻 | Xuanhuan (Eastern Fantasy) |
| `urban` | 都市 | Contemporary / Modern-Day |
| `xianxia` | 仙俠 | Xianxia (Cultivation Fantasy) |
| `science_fiction` | 科幻 | Science Fiction |
| `romance` | 言情 | Romance |
| `mystery_suspense` | 懸疑 | Mystery / Suspense |
| `lighthearted` | 輕鬆 | Lighthearted |
| `somber` | 沉重 | Somber |
| `dark` | 黑暗 | Dark |
| `high_energy` | 熱血 | High-Energy |
| `humorous` | 幽默 | Humorous |
| `wish_fulfillment` | 爽文 | Wish-Fulfillment |
| `inciting_incident` | 引入 | Inciting Incident |
| `rising_action` | 衝突升級 | Rising Action |
| `midpoint` | 中點轉折 | Midpoint |
| `climax` | 高潮 | Climax |
| `resolution` | 結局 | Resolution |
| `setup_transition` | 鋪墊／過渡 | Setup / Transition |

## 介面國際化架構

### 套件與初始化

採 `i18next` + `react-i18next`，translation resources 隨 App 靜態打包，不使用 runtime backend。官方文件提供 React hook、語言切換、插值、複數與 `Intl` formatting，足以涵蓋目前 React 19 UI：

- [react-i18next quick start](https://react.i18next.com/guides/quick-start)
- [useTranslation hook](https://react.i18next.com/latest/usetranslation-hook)
- [i18next formatting](https://www.i18next.com/translation-function/formatting)

建議結構：

```text
src/i18n/
  index.ts
  locale.ts
  resources/
    zh-TW/
      common.ts
      home.ts
      settings.ts
      outline.ts
      characters.ts
      chapters.ts
      wiki.ts
      media.ts
      export.ts
      errors.ts
    en/
      ...
```

- 元件使用 `useTranslation(namespace)`。
- 非 React 的 presentation／error helper 接受 translator 或使用已初始化的 i18n instance。
- Domain logic 優先回傳穩定 error code 與參數，由 UI 決定顯示文字；外部 Provider 原始訊息作為 detail 保留。
- 複雜 JSX 句子才使用 `<Trans>`；一般文字使用 `t()`。
- 日期、數字、字數與成本使用目前介面語系的 `Intl.DateTimeFormat`／`Intl.NumberFormat`。
- 翻譯 key 採語意 key，例如 `chapters.actions.generate`，不直接把中文原文當 key。

### Catalog 品質門檻

- 繁中與英文 key 必須完全對等。
- 插值變數名稱與複數參數必須對等。
- CI／測試禁止缺 key、孤兒 key與未替換插值。
- Runtime 可保留繁中 fallback 作最後防線，但英文 catalog parity test 必須使正常發版不出現中文 fallback。
- 不翻譯品牌名、模型名、Provider 名、API 欄位名與使用者資料。

## Prompt 與創作語言

### 內建／自訂來源追蹤

目前 `aiPrompts` 與 Multi-Agent `roleGuidance` 只保存字串，無法區分內建值與自訂值。新增逐欄位 metadata：

```ts
interface EditablePromptMeta {
  source: 'builtin' | 'custom';
  locale: InterfaceLocale;
  builtinVersion: number;
}
```

- `AIPromptPrefs` 每個欄位都有對應 meta。
- 四個 Agent 的 `roleGuidance` 也使用相同來源追蹤。
- 使用者編輯並儲存後標記 `custom`。
- 「還原預設」載入目前介面語系的版本並標記 `builtin`。
- 切換介面語系時只替換 `source === 'builtin'` 的欄位。
- 舊設定遷移時，逐欄位與目前繁中預設做 exact match：相同視為 built-in；任何差異一律視為 custom。
- 內建 Prompt 改版使用 `builtinVersion`，只能更新仍屬 built-in 的欄位。

繁中與英文預設 Prompt 應分檔維護，包含目前 14 組可編輯模板、Multi-Agent Planner／Writer／Critic／Editor 模板、repair 模板、Prompt 變數說明與預覽範例。JSON key、模板變數名與輸出 schema key 維持穩定英文，不隨語系改名。

### 不可被覆寫的輸出語言契約

新增集中 helper：

```ts
buildWritingLanguageInstruction(language: WritingLanguage): string
```

所有會產生「創作內容」的 LLM 呼叫，都把這段指令放入非使用者可編輯的 system instruction，且明示它優先於模板內衝突的語言要求。現有 `completeNormalized` 已支援 `systemPrompt`，應由共用 wrapper 組合既有 system prompt 與創作語言契約，避免每個呼叫點自行拼字串。

必須覆蓋：

- 章節骨架、章節要點、章節正文與局部改寫
- 角色草稿與欄位補完
- Wiki ingest create／update、Wiki 問答與摘要
- Lint 的自然語言原因與修改建議
- Multi-Agent Planner／Writer／Critic／Editor 與 format repair
- 漫畫分鏡中的對白、旁白與讀者可見描述

例外：

- `visualPrompt`、negative prompt、Provider workflow 與其他技術提示詞維持明確的英文輸出要求。
- JSON keys、slug、ID、enum code 不翻譯。
- Critic／Planner 結構化回應中的自然語言 value 使用創作語言，key 使用固定 schema。

`GenerationContextSnapshot.writingLanguage` 是 Multi-Agent 唯一來源；Run 建立後不得重新讀取可能變動的全域偏好。

## 匯出與 TTS

### 書籍匯出

`src/lib/book-export.ts` 目前在 HTML、章節 XHTML、nav XHTML 與 OPF `<dc:language>` 寫死 `zh-Hant`。全部改為從 `Project.writingLanguage` 取得：

- HTML `<html lang>`
- EPUB chapter/nav `lang` 與 `xml:lang`
- OPF `<dc:language>`
- 匯出 metadata 標籤依介面語系顯示，但小說內容與書籍語言 metadata 不依介面語系改變

TXT 沒有標準語言 metadata，只需把產品產生的欄位標籤依介面語系顯示。

### TTS

目前 `COMIC_VIDEO_VOICE_GROUPS` 只有 `zh-TW`、`zh-CN` 與 `zh-HK`。實作時：

- 加入已由 Microsoft voice list 驗證的 `en-US` voices。
- 依書籍創作語言排序／篩選 voice groups，預設繁中使用 `zh-TW`、英文使用 `en-US`。
- 已儲存且仍有效的手動 voice 不自動覆寫。
- voice group label 進 UI catalog；voice ID 保持原文。
- voice 與輸入語言不相容時，在開始輸出前顯示可翻譯的 validation error。

語音清單需在實作階段再次與 [Microsoft Language and Voice Support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support) 核對，避免把已移除或 preview-only voice 固定進產品。

## 遷移與相容性

### Zustand 偏好

- 新增明確 persist version 與 migration。
- 能區分全新安裝與「已有 settings key 但缺新欄位」。
- 既有安裝：`interfaceLocale = 'zh-TW'`、`defaultWritingLanguage = 'zh-Hant'`。
- Prompt provenance 依 exact-match 規則補齊。
- 偏好設定備份升級為下一版 schema；讀取端同時接受 v1 與新版，不再只接受完全相等的單一版本。

### 書籍與章節資料

新增集中 normalization，不讓 UI、stores 或生成器各自猜測 legacy 值：

- 沒有 `Project.writingLanguage` → `zh-Hant`
- 舊 `genre`／`style` 中文內建字串 → preset code
- 舊 `Chapter.beat` 中英混合內建字串 → preset code
- 未命中完整對照表的值 → `{ kind: 'custom', value: 原文 }`
- normalization 必須冪等

Dexie 的 `projects` 與 `chapters` 不需要新增 index；SQLite 的 project／chapter payload 已存為 JSON，不需新增資料表欄位。若採一次性持久化 migration，必須只透過 `StorageAdapter` 或 adapter 自己的 migration seam，UI／stores 不可直接 import `db`。

### 書籍備份與同步

- 書籍 JSON／ZIP／同步資料夾備份 schema 升級到 v3，讀取端保留 v1、v2。
- v1／v2 匯入時先 normalize Project、Chapter 與舊 Generation Run snapshot。
- 舊 Run 缺 `writingLanguage` 時補 `zh-Hant`，並維持既有「恢復後等待使用者手動繼續」規則。
- `replaceAll` 前完成 normalization，確保 Dexie 與 SQLite 結果一致。

## 完整翻譯盤點

目前初步掃描有 42 個含中文的 TSX 檔與 78 個非測試 TS 檔；其中混合 UI 文案、Prompt、錯誤、註解與使用者資料處理，不能只做機械取代。實作時按以下邊界分類：

1. App shell、首頁、工具列、偏好設定與共用元件。
2. 大綱、角色、章節、版本與 Multi-Agent 審核。
3. Wiki、Lint、全文搜尋與備份／匯出。
4. 漫畫、場景、圖片 Provider、影片與 TTS。
5. 非 React presentation helpers、validation、confirm／alert 與狀態訊息。
6. 文件標題、`aria-label`、`title`、placeholder、alt text 與空狀態。
7. Prompt defaults、role guidance、preview samples 與 prompt variable descriptions。
8. 排除：程式註解、測試 fixture 中有意保留的中文作品內容、外部服務原始回應。

完成後再執行殘留掃描；每個命中必須被分類為「已本地化」或「刻意保留」，不能以中文字搜尋零結果作為唯一完成標準。

## 實作階段

### Phase 1：i18n 基礎與全域偏好

- 安裝並初始化 `i18next`／`react-i18next`。
- 建立語系解析、靜態 resources、typed locale helpers 與 catalog parity tests。
- 擴充 `settingsStore`、持久化 migration 與設定備份。
- 偏好設定新增 General tab；同步 `<html lang>`、文件標題與 `Intl` formatters。
- 先翻譯 App shell、首頁、Toolbar、Modal／Button 等共用元件，確保切換閉環可操作。

### Phase 2：書籍語言與穩定選項代碼

- 擴充 `Project`、新書建立流程與唯讀語言顯示。
- 建立 genre／style／beat code maps 與 `PresetOrCustom` helpers。
- 完成 legacy normalization、備份 v3、Dexie／SQLite parity tests。
- 更新所有 UI、Prompt context 與搜尋／摘要呼叫點，不再把 localized label 當資料主鍵。

### Phase 3：Prompt 雙語與輸出語言契約

- 拆出繁中／英文 Prompt catalog。
- 建立 prompt provenance 與舊設定 exact-match migration。
- 串接集中 writing-language system instruction。
- 覆蓋一般 AI task、Wiki、Lint、漫畫分鏡與 Multi-Agent。
- 把創作語言寫入 Generation Context Snapshot、trace／preflight 顯示。

### Phase 4：全站介面翻譯

- 依功能域逐一搬移剩餘硬編碼 UI 字串。
- 將 presentation helper 與錯誤轉為 code + localized message。
- 翻譯 tooltip、ARIA、confirm、alert、loading、empty、success／failure 文案。
- 保留 Provider 原始錯誤作 detail，避免翻譯後失去除錯資訊。

### Phase 5：匯出、TTS 與整體驗證

- 改造 HTML／EPUB／TXT metadata 與 label。
- 加入英文 TTS voices、語言相容驗證與預設選擇。
- 補完整單元／整合測試、舊備份 fixtures 與兩種 storage adapter 測試。
- 執行中英文視覺 QA 與殘留字串審核。

每個 Phase 的程式碼變更依專案規則先跑 `tsc -b`；完整 `vitest run` 與 browser 驗證在本功能階段完成時執行。

## 測試與驗收

### 自動測試

- locale resolution：新安裝、既有安裝、`zh-*`、非中文與缺少 `navigator`。
- settings persist／backup：v1 → 新版 migration、API key 保留規則、兩語系 round trip。
- catalog：key parity、插值 parity、無空字串。
- prompt provenance：built-in 隨語系切換；custom 永不覆寫；reset 使用目前語系。
- writing instruction：所有創作型 AI task 都收到書籍語言；image technical prompt 不受影響。
- new book：預設值可於建立前改，建立後沒有修改入口。
- storage：legacy Project／Chapter normalization 在 Dexie 與 SQLite 一致且冪等。
- backup：v1／v2 書籍備份匯入後補繁中；v3 round trip 保存語言與代碼。
- Multi-Agent：snapshot 固定創作語言；resume／restore 不改語言。
- export：中英文書籍的 HTML、EPUB `lang`／`dc:language` 正確。
- TTS：中文／英文 voice 預設、手動選擇保留、不相容 voice 阻擋。

### 視覺與人工驗收

依 UI 規格使用 Edge 驗證 1440×900 與 1024×768，繁中與英文各跑一次：

- App shell、Sidebar、Toolbar、偏好設定 General 與所有既有分頁。
- 新增書本、Outline、Characters、Chapters、Wiki、Comic、Video。
- 英文長字串不裁切、不重疊、不造成頁面級 overflow。
- Button 維持單行，必要 label 可換行或 tooltip。
- 語系切換後 Modal、aria-label、title、placeholder 與日期／數字立即更新。
- 英文介面不出現未分類的繁中文案；繁中介面不出現不必要的英文 fallback。
- 自訂 Prompt、使用者內容、Provider 名稱與外部錯誤 detail 保持原文。

## 完成條件

- 使用者可在偏好設定切換完整繁中／英文介面，無需重啟。
- 全新與既有安裝的初始化規則符合本規格。
- 每本書在建立時保存且鎖定創作語言；中英文書籍可同時存在。
- 所有讀者可見 AI 創作內容只依書籍創作語言。
- 內建 Prompt 雙語完整，自訂 Prompt 不因切換介面而遺失。
- 內建題材、風格、節拍以穩定代碼保存並使用已查證標籤。
- Multi-Agent、匯出與 TTS 都尊重書籍創作語言。
- 舊設定、舊書、舊備份與舊 Run 能安全遷移。
- TypeScript、完整測試與兩個基準尺寸的雙語視覺 QA 全部通過。
