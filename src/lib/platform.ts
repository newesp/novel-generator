/**
 * 平台偵測 — 只回答「目前是不是跑在 Tauri webview 內」
 *
 * Tauri 2.x 在 window 上注入 __TAURI_INTERNALS__；舊版用 __TAURI__。
 * 同時檢查兩者，相容性最廣。
 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}
