/**
 * 備份格式 — JSON snapshot
 * 用於：
 *  - 手動匯出/匯入（A 方案）
 *  - File System Access 自動同步寫入的檔案內容（E 方案）
 *
 * 不包含 settings（LLM API key）— 避免明文洩漏；使用者偏好（含 prompts）走 Zustand persist，
 * 不在書本資料的備份範圍內。
 */
import { storage } from './storage';
import type {
  Project, Chapter, ChapterVersion, Character,
  WikiPage, WikiLogEntry,
} from '../types';

// v1: 無 wiki；v2: 含 wikiPages / wikiLog
export const BACKUP_SCHEMA_VERSION = 2 as const;
export const BACKUP_FILENAME = 'novel-generator-backup.json';

export interface BackupSnapshot {
  schema: 1 | 2;                   // 接受讀入 v1 與 v2，輸出固定 v2
  exportedAt: number;
  app: 'novel-generator';
  projects: Project[];
  chapters: Chapter[];
  versions: ChapterVersion[];
  characters: Character[];
  wikiPages?: WikiPage[];          // v1 缺欄位
  wikiLog?: WikiLogEntry[];        // v1 缺欄位
}

export async function exportSnapshot(): Promise<BackupSnapshot> {
  const [projects, chapters, versions, characters, wikiPages, wikiLog] = await Promise.all([
    storage.projects.list(),
    storage.chapters.list(),
    storage.versions.list(),
    storage.characters.list(),
    storage.wikiPages.listAll(),
    storage.wikiLog.listAll(),
  ]);
  return {
    schema: 2,
    exportedAt: Date.now(),
    app: 'novel-generator',
    projects, chapters, versions, characters, wikiPages, wikiLog,
  };
}

/**
 * 還原 snapshot 至本機 DB。
 * 目前只支援 'replace'（清空再寫入）— 簡單、可預期。
 * merge 模式之後需要時再加，會涉及 id 衝突處理。
 */
export async function importSnapshot(snapshot: BackupSnapshot, mode: 'replace' = 'replace'): Promise<void> {
  if (snapshot?.app !== 'novel-generator') {
    throw new Error('檔案格式不是 novel-generator 備份');
  }
  if (snapshot.schema !== 1 && snapshot.schema !== 2) {
    throw new Error(`不支援的備份版本：${snapshot.schema}（目前支援 v1, v2）`);
  }

  if (mode === 'replace') {
    await storage.replaceAll({
      projects: snapshot.projects ?? [],
      chapters: (snapshot.chapters ?? []).map(upgradeChapterV1ToV2),
      versions: snapshot.versions ?? [],
      characters: snapshot.characters ?? [],
      wikiPages: snapshot.wikiPages ?? [],
      wikiLog: snapshot.wikiLog ?? [],
    });
  }
}

/** v1 backup 的 chapter 沒有 wikiSyncedHash / wikiSyncStatus，補預設值 */
function upgradeChapterV1ToV2(c: Chapter): Chapter {
  return {
    ...c,
    wikiSyncedHash: c.wikiSyncedHash ?? null,
    wikiSyncStatus: c.wikiSyncStatus ?? (c.wikiSyncedAt ? 'synced' : 'unsynced'),
  };
}

/** 觸發瀏覽器下載 JSON 檔（手動匯出用） */
export function downloadSnapshotAsJson(snapshot: BackupSnapshot, filename = BACKUP_FILENAME): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 從 File 物件讀取並 parse 成 snapshot */
export async function readSnapshotFromFile(file: File): Promise<BackupSnapshot> {
  const text = await file.text();
  try {
    return JSON.parse(text) as BackupSnapshot;
  } catch {
    throw new Error('JSON 解析失敗，請確認檔案內容');
  }
}

/** 統計 snapshot 內容用於 UI 顯示 */
export function describeSnapshot(s: BackupSnapshot): string {
  const t = new Date(s.exportedAt).toLocaleString();
  const wiki = s.wikiPages?.length ?? 0;
  return `${s.projects?.length ?? 0} 本書 · ${s.chapters?.length ?? 0} 章節 · ${s.characters?.length ?? 0} 角色 · ${wiki} Wiki 頁 · 匯出於 ${t}`;
}
