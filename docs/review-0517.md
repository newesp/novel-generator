**剩下的小修正**

1. **page_snapshot_after 註解有點矛盾**  
    第 78 行寫 null on delete 或 failed。但第 246-255 行的補償模式是先構造 newSnapshot，寫入 log，再寫 page；如果 page 寫入失敗，理論上 page_snapshot_after 應該仍存在，方便重試。  
    建議改成：null on delete；Apply LLM 失敗時可為 null；page 寫入失敗時保留 after snapshot。
    
2. **Scope 清單漏寫 wikiSyncedHash/wikiSyncStatus**  
    第 677 行只寫 chapters.wikiSyncedAt 欄位 + Migration，但實際 schema 已有 wikiSyncedHash、wikiSyncStatus。  
    建議改成：chapters wikiSyncedAt / wikiSyncedHash / wikiSyncStatus 欄位 + Migration。
    
3. **批次處理沒有明確處理 partial_stale**  
    第 641-642 行說 partial 章節走「重試剩餘」，但 partial_stale 不應重試舊 failed brief。第 616 行 UI 已說不提供重試剩餘。  
    建議第 642 行補：partial_stale 走「還原後重新 ingest」或「完整重跑」。
    
4. **Undo 只還原 op_status='ok'，但 page 寫入失敗的 log 可能有 after snapshot**  
    這沒錯，但建議明確說：failed entries undo 時不反向操作，只保留為歷史紀錄；若要重放，走「重試剩餘」。避免實作者誤以為 undo 要處理 failed rows。