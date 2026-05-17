剩下我會標成「實作前建議修」的點：

**1. Snapshot 不夠完整，會影響 undo delete / round-trip**  
spec (line 121) 的 WikiPageSnapshot 只有 title/aliases/relatedSlugs/description/contentMd，但 §4.6 說 delete undo 要用 snapshot INSERT 回 wiki_pages。  
建議：WikiPageSnapshot 直接等同完整 WikiPage，至少補 id/bookId/type/slug/createdAt/updatedAt。不然還原刪除頁時會靠 log 欄位拼裝，時間戳也會失真。

**2. partial 被章節修改轉成 stale 後，失敗狀態會被蓋掉**  
狀態轉換 (line 111) 寫 status in ('synced','partial') 且內容變更就變 stale。這會讓「上次 ingest 有 failed ops」的紅色狀態消失。  
建議：要嘛新增 partial_stale，要嘛 UI 顯示時以「仍有 failed log」優先於 stale 判斷。

**3. llm-wiki prompt 仍是 filesystem path 介面，spec 要求 type+slug，但尚未明確列出改寫規格**  
prompt 移植 (line 603) 寫「filesystem path 改成 type+slug」。我檢查現有 ingest-plan.md 仍輸出 path: "concept/attention.md"。  
建議：spec 加一小節「Prompt adaptation rules」，明確 update op 的輸出從 path 改成 { type, slug }，或應用層負責 path -> type/slug 正規化。

**4. 驗收標準尚未覆蓋 partial 與 retry**  
新版加入 wikiSyncStatus='partial' 是對的，但 驗收標準 (line 657) 還停在成功/還原/提醒。  
建議補兩條：

- 模擬一個 apply/page 寫入失敗，章節應顯示 partial，可看到失敗數。
- 點「重試剩餘」後，成功則轉 synced，失敗則維持 partial。

**5. Cheap relevance filter 的中文切詞需要最小定義**  
Step 1 (line 417) 提到「章節要點中的 N-gram」「高頻名詞 top 20」，但中文名詞抽取如果沒有工具，容易每個人實作不同。  
建議 Phase 2 先定義簡單版：用角色名、aliases、slug/title、章節標題、章節要點中的連續 2-4 字片段；高頻名詞 top 20 可以延後或只做簡單正則。

**總結**  
這版已經很接近可交付實作。 
我會在動工前只再補：完整 snapshot、partial/stale 優先序、prompt adaptation 規則、partial retry 驗收。補完後就可以開切了。