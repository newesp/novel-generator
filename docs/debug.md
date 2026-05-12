## 使用方式（在瀏覽器 Console 操作）

開啟 dev server，在瀏覽器 F12 開 Console，輸入：

**1. 先檢查（不會改任何東西）**

```
await dbDebug.inspect()
```

會印出三個表格：

- 所有書本（id、書名、章節數、角色數）
- 孤兒角色列表
- 孤兒章節 / 版本列表

**2. 只清孤兒資料（保險，建議先做）**

```
await dbDebug.cleanupOrphans()
```

**3. 一鍵保留「小圓舞進行曲」並刪除其他所有書本**

```
await dbDebug.wipeAllExceptBook('小圓舞進行曲')
```

> 此函式會：刪除其他所有書本 + 章節 + 版本 + 角色，再 cascade 清孤兒。完成後請重新整理頁面。

**4. 直接操作 db（進階）**

```
dbDebug.db.projects.toArray().then(console.table)dbDebug.db.characters.toArray().then(console.table)
```

---

## 安全性

- 工具只在 `import.meta.env.DEV` 為真時掛到 `window`（production build 不會載入）
- 三個函式都會 console.log 摘要，方便確認結果
- `inspect()` 是純讀取，可以安心多次執行
- `cleanupOrphans()` 只刪除確認沒有對應 parent 的記錄
- `wipeAllExceptBook(title)` 是破壞性操作 — 先用 `inspect()` 確認書名拼字正確

建議流程：先跑 `inspect()` 看狀況 → 確認「小圓舞進行曲」存在且 id 正確 → 跑 `wipeAllExceptBook('小圓舞進行曲')` → 重新整理。