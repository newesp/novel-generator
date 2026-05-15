/**
 * Storage entry point
 *
 * 平台偵測決定 adapter：
 *  - Phase 5a：永遠回 DexieAdapter
 *  - Phase 5b：偵測 window.__TAURI__ → TauriSqliteAdapter，否則 DexieAdapter
 *
 * 對外只 export `storage`（singleton）；UI / stores / lib 都 import 它。
 */
import type { StorageAdapter } from './types';
import { dexieAdapter } from './dexie-adapter';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

function pickAdapter(): StorageAdapter {
  if (isTauri()) {
    // Phase 5b 會在這裡回 TauriSqliteAdapter；目前先 fall through
    // 這個分支目前不會走到（Phase 5a 還沒引入 Tauri shell）
  }
  return dexieAdapter;
}

export const storage: StorageAdapter = pickAdapter();
export type { StorageAdapter, StorageBundle } from './types';
