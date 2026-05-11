/**
 * File System Access 同步 — E 方案
 *
 * 使用者一次性「連結」一個本機資料夾（建議選在 OneDrive / Google Drive / iCloud
 * 同步資料夾內），之後 app 會：
 *   - 在資料夾中讀寫 `novel-generator-backup.json`
 *   - 任何書本/章節變動，debounced 自動寫入該檔
 *   - App 啟動且本機 DB 為空時，自動從該檔還原
 *
 * Handle 透過 IndexedDB（Dexie appMeta table）持久化，重開瀏覽器仍有效。
 * 無痕模式關閉後 IndexedDB 被清，handle 一起消失 — 此情境下每次需重新連結。
 */
import { db } from './db';
import {
  BACKUP_FILENAME,
  exportSnapshot,
  importSnapshot,
  readSnapshotFromFile,
  type BackupSnapshot,
} from './backup';

const HANDLE_META_KEY = 'fs-sync-folder-handle';

/** Vendor-prefixed API 不存在的瀏覽器（Firefox / Safari）會回 false。 */
export function isFsAccessSupported(): boolean {
  return typeof (globalThis as any).showDirectoryPicker === 'function';
}

async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await db.appMeta.put({ key: HANDLE_META_KEY, value: handle });
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  const row = await db.appMeta.get(HANDLE_META_KEY);
  return (row?.value as FileSystemDirectoryHandle | undefined) ?? null;
}

async function clearHandle(): Promise<void> {
  await db.appMeta.delete(HANDLE_META_KEY);
}

/** 檢查 / 請求 read+write 權限。回傳是否取得權限。 */
async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<boolean> {
  // queryPermission / requestPermission 是 File System Access 提供的方法（非 standard TS lib types）
  const h = handle as unknown as {
    queryPermission: (o: { mode: string }) => Promise<PermissionState>;
    requestPermission: (o: { mode: string }) => Promise<PermissionState>;
  };
  const opt = { mode };
  if ((await h.queryPermission(opt)) === 'granted') return true;
  return (await h.requestPermission(opt)) === 'granted';
}

/** 讓使用者選一個資料夾並儲存 handle。回傳 handle 或 null（取消）。 */
export async function pickAndLinkFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFsAccessSupported()) {
    throw new Error('此瀏覽器不支援 File System Access API（請使用 Chrome / Edge / Opera）');
  }
  try {
    const handle: FileSystemDirectoryHandle = await (globalThis as any).showDirectoryPicker({
      mode: 'readwrite',
      id: 'novel-generator-sync',
      startIn: 'documents',
    });
    if (!(await ensurePermission(handle, 'readwrite'))) {
      throw new Error('未授予資料夾寫入權限');
    }
    await saveHandle(handle);
    return handle;
  } catch (err) {
    // 使用者取消選取會丟 AbortError
    if ((err as Error).name === 'AbortError') return null;
    throw err;
  }
}

/** 取得目前連結的 handle 並確認權限仍有效，否則回 null。 */
export async function getLinkedFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await loadHandle();
  if (!handle) return null;
  // 不主動 prompt — 只查詢；若已被撤銷，UI 端再決定要不要請求重新授權
  const h = handle as unknown as {
    queryPermission: (o: { mode: string }) => Promise<PermissionState>;
  };
  const state = await h.queryPermission({ mode: 'readwrite' });
  if (state === 'granted') return handle;
  return null;
}

/** 取得 handle 並主動請求權限（用於剛載入頁面要恢復連結）。 */
export async function reactivateLinkedFolder(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await loadHandle();
  if (!handle) return null;
  if (await ensurePermission(handle, 'readwrite')) return handle;
  return null;
}

export async function unlinkFolder(): Promise<void> {
  await clearHandle();
}

/** 取得連結資料夾的顯示名稱（供 UI）。 */
export async function getLinkedFolderName(): Promise<string | null> {
  const handle = await loadHandle();
  return handle ? handle.name : null;
}

/** 寫入 snapshot 到資料夾中的 backup 檔。 */
export async function writeSnapshotToFolder(
  handle: FileSystemDirectoryHandle,
  snapshot: BackupSnapshot,
): Promise<void> {
  const fileHandle = await handle.getFileHandle(BACKUP_FILENAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(snapshot, null, 2));
  await writable.close();
}

/** 讀取資料夾中的 backup 檔；不存在回 null。 */
export async function readSnapshotFromFolder(
  handle: FileSystemDirectoryHandle,
): Promise<BackupSnapshot | null> {
  try {
    const fileHandle = await handle.getFileHandle(BACKUP_FILENAME, { create: false });
    const file = await fileHandle.getFile();
    return await readSnapshotFromFile(file);
  } catch (err) {
    if ((err as Error).name === 'NotFoundError') return null;
    throw err;
  }
}

/** 立刻把目前 DB dump 並寫入連結資料夾。回傳是否成功寫入。 */
export async function pushSnapshotNow(): Promise<boolean> {
  const handle = await getLinkedFolderHandle();
  if (!handle) return false;
  const snapshot = await exportSnapshot();
  await writeSnapshotToFolder(handle, snapshot);
  return true;
}

/** 從連結資料夾讀取並還原至本機 DB。回傳是否完成。 */
export async function pullSnapshotNow(): Promise<boolean> {
  const handle = await getLinkedFolderHandle();
  if (!handle) return false;
  const snapshot = await readSnapshotFromFolder(handle);
  if (!snapshot) return false;
  await importSnapshot(snapshot, 'replace');
  return true;
}
