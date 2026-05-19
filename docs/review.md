# Review: specs/2026-05-19-consistency-lint-design.md

整體評估：這份 `specs/2026-05-19-consistency-lint-design.md` 方向是對的，而且範圍控制得不錯。它把 Lint 拆成 structural checks 與 LLM batch checks，不持久化 report、手動觸發、dismiss session-only，這些都很適合 Phase 2.5。

但不建議直接開實作，先修幾個會影響資料一致性與假陽性的點。

## 主要問題

### 1. Auto-fix 繞過 `wiki_log`

Broken link fix 直接 `storage.wikiPages.update()`，孤頁 fix 直接 `storage.wikiPages.delete()`，且孤頁明寫「不進 log」。這和 LLM Wiki Phase 2 的 `wiki_log/page_snapshot` 設計衝突。

建議：所有 Lint fix 都走 `wikiStore.savePage/deletePage`，或新增 `source='lint:<checkId>'` 的 `wiki_log`。Report 不持久化沒問題，但「實際修復」一定要進 log。

### 2. `removeRelatedSlug` 只存 slug 不夠

`relatedSlugs` 是 `{type, slug}`，但 AutoFix 是 `{ slugToRemove: string }`。如果不同 type 有同 slug，會誤刪。

建議改成：

```ts
{
  kind: 'removeRelatedSlug'
  pageId: string
  target: { type: WikiPageType; slug: string }
}
```

### 3. 孤頁一鍵刪除太激進

孤頁不等於垃圾頁。長篇小說裡很多設定頁可能暫時沒被引用，例如未登場勢力、未回收伏筆、世界觀規則。

建議：孤頁只給 `info` + 跳轉，或提供「標記待檢視」。如果保留刪除，必須強確認且寫 `wiki_log` snapshot。

### 4. 未登錄角色檢查會產生大量假陽性

「連續 2-4 個中文字、字頻 ≥2」會抓到大量普通詞，例如「突然」「這時」「眼前」「不能」「師父」之類。這個 check 很可能會非常吵。

建議：Phase 2.5 先收窄規則，例如只抓：

- 出現在引號 / 對話標籤附近的人名
- 出現在「叫做 / 名為 / 姓 / 師兄 / 姑娘 / 長老」等語境
- 或改成 LLM batch check，而不是 structural

### 5. Wiki vs 章節應該用角色 aliases

目前每角色取「角色名出現過的章節」，但長篇常用稱號、外號、姓氏、身份稱呼。

建議：輸入應包含 character aliases + wiki entity aliases，章節 excerpt 搜尋也要用 aliases 集合。

## 次要建議

- LLM fix 套用後從 report 移除 issue 可以，但最好標記「已套用」而不是直接消失，避免使用者不知道剛才修了什麼。
- `LintIssue.targets` 只有 `wikiPage | chapter`，未登錄角色可能需要 `textSpan/sourceExcerpt`，否則跳轉到章節後不好定位。
- Settings 的 `setLintPrefs(partial)` 要注意 nested merge，避免只改一個 checkbox 時整個 `checks` 被覆蓋。
- Wiki 內部矛盾只讀每頁前 800 字，容易漏掉角色細節。建議改成下方的 `lintDigest` 策略。

## Lint Digest 建議

針對「Wiki 內部矛盾只讀每頁前 800 字」的設計，建議不要固定截取前段內容。這對小說角色頁、世界觀規則頁很容易漏掉真正會矛盾的細節，因為年齡、武器、傷勢、關係、伏筆、限制與代價常常散落在中後段。

建議改成 **分層抽取 + 預算截斷**。

### 1. 每頁先抽 `lintDigest`

不要直接丟 `contentMd.slice(0, 800)` 給 LLM。先把 Wiki page 轉成面向一致性檢查的 digest：

```ts
interface WikiLintDigest {
  pageId: string
  type: WikiPageType
  slug: string
  title: string
  aliases: string[]
  description: string
  facts: string[]
  relations: string[]
  timeline: string[]
  openQuestions: string[]
}
```

### 2. MVP 先用 deterministic markdown parser

Phase 2.5 不一定需要 LLM 先做 digest。可以先用規則式 parser 從 markdown 抽：

- H1
- aliases / related
- description
- 各 `##` section 標題
- 含關鍵詞的 bullet 或句子

建議關鍵詞：

```txt
年齡、身份、性別、種族、武器、能力、傷勢、死亡、失蹤、關係、
父親、母親、師父、徒弟、真名、秘密、弱點、目標、限制、代價、
時間、第X章
```

### 3. 不同 page type 用不同抽取重點

- `entity`：身份、別名、外貌、能力、關係、狀態、出處
- `concept`：規則、限制、代價、例外
- `summary`：事件、時間線、角色狀態變更
- `compare` / `synthesis`：結論、差異、跨頁引用

### 4. LLM contradiction check 吃 digest

LLM 輸入應改為 `title + description + aliases + lintDigest`，例如：

```json
{
  "page": "entity/li-si",
  "title": "李四",
  "aliases": ["李小四"],
  "facts": [
    "年齡：17 歲",
    "武器：長劍",
    "第 5 章：聲稱從未握劍",
    "師父：王大"
  ],
  "relations": ["王大 -> 師父"],
  "timeline": ["第 3 章拜師", "第 5 章受傷"]
}
```

### 5. Digest 超預算時再截斷

截斷優先順序：

```txt
aliases / description
→ facts
→ relations
→ timeline
→ openQuestions
```

## 建議替換規格文字

把原本：

```txt
pageType 全部頁的 title + description + contentMd（前 800 字）
```

改成：

```txt
pageType 全部頁的 title + description + aliases + lintDigest。
lintDigest 由 deterministic markdown parser 產生，抽取各 section 中含設定、
狀態、關係、時間線關鍵詞的 bullet 或句子；若仍超出預算，依
facts → relations → timeline → openQuestions 順序截斷。
```

## 建議實作順序

先做：

1. Broken link 只讀報告 + 寫 log 的一鍵修
2. Alias duplicate 只讀報告
3. Wiki 內部矛盾 LLM check，改用 `lintDigest`
4. Wiki vs 章節 LLM check，加入 aliases 搜尋

晚一點再做：

- 孤頁刪除
- 未登錄角色 structural check
- LLM fix preview / apply

## 結論

這份 spec 架構可以採納，但建議先修三件事再動工：

1. Lint fix 必須寫入 `wiki_log`
2. `removeRelatedSlug` 改成 `{type, slug}`
3. 未登錄角色檢查收窄規則，避免假陽性爆炸

另外，Wiki 內部矛盾檢查建議改用 `lintDigest`，不要只取前 800 字。這樣 LLM call 成本差不多，但一致性檢查命中率會高很多，也比較適合長篇小說的 Wiki 結構。
