/**
 * 極簡 prompt template engine。
 *
 * 語法：
 *   - `{{var}}` 會被替換為 vars[var]；若 var 不存在，替換為空字串
 *   - 不支援條件分支、迴圈、過濾器 — 由 caller 預先把區塊組好再傳入
 *     例如「沒有現有章節時不顯示『現有章節』段落」→ caller 把 `existingChaptersSection`
 *     設為 '' 或完整的多行字串，模板上直接 `{{existingChaptersSection}}`
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | undefined | null>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    if (v === undefined || v === null) return '';
    return String(v);
  });
}

/** 列出 template 內所有 `{{var}}` 變數名，方便 UI 顯示「可用變數」 */
export function listTemplateVars(template: string): string[] {
  const set = new Set<string>();
  const re = /\{\{(\w+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) set.add(m[1]);
  return [...set];
}
