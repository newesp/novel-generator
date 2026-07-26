# 中間產物保存為執行軌跡而非章節版本

Writer 與 Editor 的中間草稿必須可供使用者查看、比較與追溯，Planner、Critic、失敗嘗試與人工決策也必須能形成完整的 Agent 可觀測性；但這些資料尚未成為正式正文，不應套用既有 `ChapterVersion` 的語義與三份未釘選版本保留規則。因此每個生成執行保存獨立、不可覆寫的執行軌跡，步驟輸入以檢查點關聯，輸出保存候選草稿或結構化結果，並記錄角色、嘗試次數、狀態、時間、provider／model 快照、Prompt 與回應中可取得的 token／request metadata、去敏化錯誤及路由決策；只有最終採用時才把原正文存成章節版本並更新 `Chapter.content`。
