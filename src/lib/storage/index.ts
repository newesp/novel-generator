/**
 * Storage entry point
 *
 * 平台偵測決定 adapter：
 *  - Tauri webview → TauriSqliteAdapter（Phase 5b）
 *  - 一般瀏覽器  → DexieAdapter（Phase 5a）
 *
 * 對外只 export `storage`（singleton）；UI / stores / lib 都 import 它。
 */
import type { StorageAdapter } from './types';
import { dexieAdapter } from './dexie-adapter';
import { tauriSqliteAdapter } from './tauri-sqlite-adapter';
import { isTauri } from '../platform';

function pickAdapter(): StorageAdapter {
  return isTauri() ? tauriSqliteAdapter : dexieAdapter;
}

export const storage: StorageAdapter = pickAdapter();
export type { StorageAdapter, StorageBundle } from './types';
