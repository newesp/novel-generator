# Multi-Agent 使用四份獨立 Prompt 契約

既有 `chapterContentTemplate` 屬於快速模式且可能已被使用者自訂，直接加入生成細綱變數或改變輸出要求會造成不相容；讓 Multi-Agent Writer 沿用它也可能使 Planner 結果被舊模板忽略。因此快速模式保持現狀，Multi-Agent 另外新增 Planner、Writer、Critic、Editor 四份可獨立版本化、編輯與測試的 Prompt 契約。Writer 與 Editor 的契約分離，但兩者共用 generation executor，不建立重複的 Agent 執行個體。
