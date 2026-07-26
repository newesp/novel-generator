# Issue tracker: GitHub

本專案的 issue 與 PRD 使用 GitHub Issues，repo 由目前 clone 的 `git remote` 判定。使用 `gh` CLI 建立、讀取、編輯、標記與關閉 issue。

## 慣例

- 建立：`gh issue create --title "..." --body-file <file>`
- 讀取：`gh issue view <number> --comments`
- 列表：`gh issue list --state open --json number,title,body,labels,comments`
- 留言：`gh issue comment <number> --body "..."`
- 標記：`gh issue edit <number> --add-label "..."`
- 關閉：`gh issue close <number> --comment "..."`

技能要求「publish to the issue tracker」時，建立 GitHub issue。PR 不作為需求 triage 入口。
