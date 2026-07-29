# 規格｜v2 UI 設計規範

> 版本：2.1　更新日期：2026-07-29
>
> 主編輯器布局參見 [UI-layout.md](UI-layout.md)；實際套件版本以 `package.json` 為準。

## 設計方向

v2 是本機創作工具的工作介面，不是行銷頁。設計優先順序如下：

1. **清楚**：功能依工作流程分區，避免同一動作在不同頁面重複出現。
2. **穩定**：頁面外層不捲動；清單、長文字與圖庫只在自己的區域內捲動。
3. **緊湊**：使用固定工具列、可收合側欄與小型控制元件，避免不必要空白。
4. **一致**：新介面以 Mantine 元件、Gray 主題與 Lucide 圖示為主；舊自製元件保留作功能相容層。
5. **功能優先**：重排 UI 不改 Store、StorageAdapter、生成流程或資料模型。

## 介面語言

- 所有 production UI 文字必須透過 `src/lib/language-policy/` 的 locale catalog 顯示，不在 JSX 硬編碼中文或英文。
- `interfaceLocale` 支援 `zh-TW` / `en`，切換後即時更新 UI、`<html lang>`、日期格式與 Tauri 視窗標題。
- `interfaceLocale` 不得用來決定小說、Wiki、漫畫旁白或 AI 生成內容的語言；內容語言一律取自目前書本的 `writingLanguage`。
- 書名、角色名、章節正文等使用者內容不因介面語言切換而翻譯。
- 題材、風格、章節節拍等內建選項以穩定代碼保存，顯示時才依介面語言解析；自訂文字保持原文。
- 新增或修改元件時，`src/lib/language-policy/ui-localization.test.ts` 必須持續通過。

## 技術與主題

- UI framework：Mantine，使用 Default Colors 的 `gray` 色階。
- 圖示：Lucide React；沒有適合圖示時才使用既有文字或符號。
- 樣式：`src/v2.css` + CSS variables；不使用 Tailwind。
- 色彩模式：目前固定深色。
- 動效：只用於 hover、focus、選取與面板狀態回饋，並尊重 `prefers-reduced-motion`。

## 色彩系統

| 用途 | CSS variable | v2 值 |
|------|--------------|-------|
| 主背景 | `--bg-primary` | `#0b0d0f` |
| 次背景 | `--bg-secondary` | `#111418` |
| 輸入／工具背景 | `--bg-tertiary` | `#1b1f24` |
| Hover | `--bg-hover` | `#24292f` |
| 邊框 | `--border` | `#2b3036` |
| 強邊框 | `--border-light` | `#3b4148` |
| 主文字 | `--text-primary` | `#f1f3f5` |
| 次文字 | `--text-secondary` | `#c1c7cd` |
| 輔助文字 | `--text-tertiary` | `#868e96` |
| 強調色 | `--accent` | `#495057` |
| 強調背景 | `--accent-bg` | `rgba(206, 212, 218, 0.12)` |

Gray 是介面的主色，不以大面積單一亮色區分功能。危險、警告、成功等語意狀態可使用既有 danger、warn、success 色彩。

## 字體與尺寸

- 字體：系統 UI 字體，優先 `Segoe UI`、`PingFang TC`、`Microsoft JhengHei`。
- 頁面／工作區標題：14–15px，600。
- 表單與一般內容：13–14px。
- Label、meta、說明：11–12px。
- 不使用依 viewport 寬度縮放的字級。
- 長標題與 slug 必須允許截斷或換行，不得撐破容器。

## 間距與圓角

- 常用間距：4、6、8、10、12、16、18、24px。
- 小型控制圓角：3–5px。
- 面板與工具區圓角：6–8px。
- 不使用卡片包卡片；全頁區塊以邊框、背景或欄位分隔。

## 元件規範

### 按鈕

- 清楚命令使用文字或圖示＋文字。
- 熟悉工具命令優先使用 Lucide 圖示並提供 `title` / `aria-label`。
- 工具列按鈕使用內容寬，不因 Grid 的剩餘空間被拉長。
- 危險操作使用 danger 色並保留確認。
- Disabled 必須同時有視覺狀態與原因提示。

### 表單

- Label 與輸入控制預設間距 4–6px。
- 文字輸入與 Select 高度約 32–36px。
- 長文字 textarea 填滿所在編輯區，內容在 textarea 內捲動。
- 二元設定使用 checkbox / toggle；模式切換使用 segmented control 或 tabs。
- 說明使用 help icon / tooltip，不在畫面堆疊長篇操作教學。

### 面板與捲動

- App、主工作區與固定欄位使用 `min-width: 0`、`min-height: 0`，避免 Grid/Flex 溢位。
- 頁面外層維持 `overflow: hidden`。
- 清單、圖庫與長文字區可使用局部 `overflow-y: auto`。
- 固定工具列、按鈕或動態內容不得改變主要欄位尺寸。

### Dialog

- 偏好設定、批次 AI 操作與需要明確確認的流程可使用 Modal。
- 頻繁編輯的主要資源不使用長表單 Modal；角色已改為右側 inline editor。
- Modal 必須支援關閉、Escape 與合理的 focus 行為。

## 響應式基準

- 主要驗證尺寸：1440×900、1024×768。
- 寬度不超過 1040px 時，側欄自動收合為 58px 圖示列。
- 大綱在較窄寬度將世界觀／主線編輯器上下排列。
- 場景與角色的雙欄內容會降低最小欄寬，但不產生頁面級水平捲動。

## 無障礙與驗證

- 互動元件提供可辨識的 focus 狀態。
- 圖示按鈕提供 tooltip 或 accessible label。
- 文字和控制不得互相遮擋。
- UI 階段完成時，以 Edge 在 1440×900、1024×768 檢查：
  - body 與 workspace 無非預期 overflow。
  - 按鈕文字沒有裁切。
  - 固定區塊不因 hover、選取或動態內容位移。
  - 需要捲動的內容只在指定局部區域捲動。
  - 分別以繁體中文與 English 巡覽所有工作區、Modal、空狀態、錯誤與動態狀態。
  - 英文介面不得殘留硬編碼中文；中文介面不得因技術選項而強制翻譯使用者內容。
