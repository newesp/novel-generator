/**
 * 將提示詞寫到 dev server 的 temp/ 資料夾（透過 vite plugin /log-prompt）。
 * Production build（無 dev server）會 silently 失敗，不影響使用者。
 */
export async function logPromptToTemp(
  prefix: string,
  content: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    const ts = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
    const filename = `${prefix}-${stamp}.txt`;

    const header = meta
      ? `# ${prefix}\n# time: ${ts.toISOString()}\n${Object.entries(meta).map(([k, v]) => `# ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')}\n\n---\n\n`
      : `# ${prefix}\n# time: ${ts.toISOString()}\n\n---\n\n`;

    await fetch('/log-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content: header + content }),
    });
  } catch {
    // 忽略：log 失敗不應影響主流程
  }
}
