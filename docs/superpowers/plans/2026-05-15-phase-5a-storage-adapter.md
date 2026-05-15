# Phase 5a — StorageAdapter 抽象層 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把現有 Dexie 儲存層包進 `StorageAdapter` interface，讓 UI / stores / lib 程式碼都只依賴抽象介面。完成後瀏覽器版功能完全不變，但程式碼準備好 Phase 5b 換實作為 Tauri + SQLite。

**Architecture:** 新增 `src/lib/storage/` 目錄，內含 (1) `types.ts` interface 定義、(2) `dexie-adapter.ts` 把現有 Dexie 包進 interface、(3) `index.ts` 提供 `storage` singleton。把所有 import `../lib/db` 或 `./db` 的檔案（共 5 個）改成 import `storage`。`db.ts` 保留但僅 `dexie-adapter.ts` 內部使用。

**Tech Stack:** TypeScript strict、Dexie 4、Zustand 5（既有）、無新增 dependency。

**Reference Spec:** `docs/superpowers/specs/2026-05-15-tauri-sqlite-migration-design.md` §4 Phase 5a, §6 StorageAdapter Interface

---

## File Structure

**Create:**
- `src/lib/storage/types.ts` — `StorageAdapter` interface + 子 store interfaces
- `src/lib/storage/dexie-adapter.ts` — `createDexieAdapter()` 實作
- `src/lib/storage/index.ts` — 平台偵測（Phase 5a 永遠回 Dexie）+ `storage` singleton

**Modify:**
- `src/stores/projectStore.ts` — 全部 `db.*` → `storage.*`
- `src/lib/backup.ts` — `exportSnapshot` / `importSnapshot` 改走 adapter
- `src/lib/fs-sync.ts` — `db.appMeta` → `storage.appMeta`
- `src/lib/db-maintenance.ts` — Dev 工具改走 adapter（保留 `db.ts` import 僅在這檔案內，因為 dev tool 直接掛到 window）
- `src/components/home/HomePage.tsx` — wordCounts 用 `storage.chapters.listByProject`

**Keep untouched:**
- `src/lib/db.ts` — 仍是 Dexie 定義；只 `dexie-adapter.ts` 可 import 它

---

## Task 1: 定義 StorageAdapter Interface

**Files:**
- Create: `src/lib/storage/types.ts`

- [ ] **Step 1: 建立 storage 目錄**

```bash
mkdir -p src/lib/storage
```

- [ ] **Step 2: 寫 `src/lib/storage/types.ts`**

```typescript
/**
 * StorageAdapter — 儲存層抽象介面
 *
 * UI / stores / lib 只依賴這個介面，不直接接觸 Dexie / SQLite。
 * Phase 5a：唯一實作是 DexieAdapter（包現有 Dexie code）。
 * Phase 5b：新增 TauriSqliteAdapter，依平台偵測選擇。
 *
 * 設計原則：
 *  - 介面形狀對齊現有 Dexie 用法，refactor 影響最小
 *  - 各 store 方法名稱描述「用途」而非「Dexie 操作」（例 listByProject 而非 whereProject）
 *  - 大型 binary（圖片/音檔/影片）不走這個 interface，由 Phase 6 MediaAdapter 處理
 */
import type { Project, Chapter, ChapterVersion, Character } from '../../types';

export interface ProjectStore {
  /** 依 updatedAt 由新到舊排列（首頁書庫用） */
  listAllByUpdatedDesc(): Promise<Project[]>;
  /** 不排序，供備份 / 診斷 */
  list(): Promise<Project[]>;
  get(id: string): Promise<Project | undefined>;
  add(p: Project): Promise<void>;
  update(id: string, data: Partial<Project>): Promise<void>;
  delete(id: string): Promise<void>;
  bulkDelete(ids: string[]): Promise<void>;
}

export interface ChapterStore {
  list(): Promise<Chapter[]>;
  /** 預設依 order 由小到大排序；opts.sorted=false 則回未排序原始順序 */
  listByProject(projectId: string, opts?: { sorted?: boolean }): Promise<Chapter[]>;
  add(c: Chapter): Promise<void>;
  update(id: string, data: Partial<Chapter>): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByProject(projectId: string): Promise<void>;
  deleteByProjects(projectIds: string[]): Promise<void>;
  bulkDelete(ids: string[]): Promise<void>;
}

export interface VersionStore {
  list(): Promise<ChapterVersion[]>;
  /** 依 createdAt 由新到舊 */
  listByChapterDesc(chapterId: string): Promise<ChapterVersion[]>;
  add(v: ChapterVersion): Promise<void>;
  update(id: string, data: Partial<ChapterVersion>): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByChapter(chapterId: string): Promise<void>;
  deleteByChapters(chapterIds: string[]): Promise<void>;
  /** 取得指定章節集合下所有版本 id（給診斷工具用） */
  idsByChapters(chapterIds: string[]): Promise<string[]>;
  bulkDelete(ids: string[]): Promise<void>;
}

export interface CharacterStore {
  list(): Promise<Character[]>;
  listByProject(projectId: string): Promise<Character[]>;
  add(c: Character): Promise<void>;
  update(id: string, data: Partial<Character>): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByProject(projectId: string): Promise<void>;
  deleteByProjects(projectIds: string[]): Promise<void>;
  bulkDelete(ids: string[]): Promise<void>;
}

export interface AppMetaStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

/** 整體匯出/匯入用的資料束（與 backup.ts BackupSnapshot 對齊但去掉 metadata） */
export interface StorageBundle {
  projects: Project[];
  chapters: Chapter[];
  versions: ChapterVersion[];
  characters: Character[];
}

export interface StorageAdapter {
  projects: ProjectStore;
  chapters: ChapterStore;
  versions: VersionStore;
  characters: CharacterStore;
  appMeta: AppMetaStore;

  /**
   * 原子性清空再寫入（給 backup importSnapshot 用）
   * Dexie 用 transaction；之後 SQLite 用 transaction。
   * 不含 settings（不在備份範圍）。
   */
  replaceAll(bundle: StorageBundle): Promise<void>;
}
```

- [ ] **Step 3: 確認檔案能編譯**

Run: `npx tsc --noEmit -p .`
Expected: 編譯通過（types.ts 只有型別宣告，無實作不會 type-check 失敗）

- [ ] **Step 4: Commit**

```bash
git add src/lib/storage/types.ts
git commit -m "feat(storage): 新增 StorageAdapter interface 定義（Phase 5a）"
```

---

## Task 2: 實作 DexieAdapter

**Files:**
- Create: `src/lib/storage/dexie-adapter.ts`

- [ ] **Step 1: 寫 `src/lib/storage/dexie-adapter.ts`**

```typescript
/**
 * DexieAdapter — StorageAdapter 的 Dexie/IndexedDB 實作
 *
 * 這是唯一可以 import './db' 的檔案。
 * Phase 5b 新增 TauriSqliteAdapter 時，這檔案不需修改。
 */
import { db } from '../db';
import type {
  StorageAdapter,
  ProjectStore,
  ChapterStore,
  VersionStore,
  CharacterStore,
  AppMetaStore,
  StorageBundle,
} from './types';

const projects: ProjectStore = {
  listAllByUpdatedDesc: () => db.projects.orderBy('updatedAt').reverse().toArray(),
  list: () => db.projects.toArray(),
  get: (id) => db.projects.get(id),
  add: async (p) => { await db.projects.add(p); },
  update: async (id, data) => { await db.projects.update(id, data); },
  delete: (id) => db.projects.delete(id),
  bulkDelete: (ids) => db.projects.bulkDelete(ids),
};

const chapters: ChapterStore = {
  list: () => db.chapters.toArray(),
  listByProject: async (projectId, opts) => {
    if (opts?.sorted === false) {
      return db.chapters.where('projectId').equals(projectId).toArray();
    }
    return db.chapters.where('projectId').equals(projectId).sortBy('order');
  },
  add: async (c) => { await db.chapters.add(c); },
  update: async (id, data) => { await db.chapters.update(id, data); },
  delete: (id) => db.chapters.delete(id),
  deleteByProject: async (projectId) => {
    await db.chapters.where('projectId').equals(projectId).delete();
  },
  deleteByProjects: async (projectIds) => {
    await db.chapters.where('projectId').anyOf(projectIds).delete();
  },
  bulkDelete: (ids) => db.chapters.bulkDelete(ids),
};

const versions: VersionStore = {
  list: () => db.versions.toArray(),
  listByChapterDesc: async (chapterId) => {
    const arr = await db.versions.where('chapterId').equals(chapterId).sortBy('createdAt');
    return arr.reverse();
  },
  add: async (v) => { await db.versions.add(v); },
  update: async (id, data) => { await db.versions.update(id, data); },
  delete: (id) => db.versions.delete(id),
  deleteByChapter: async (chapterId) => {
    await db.versions.where('chapterId').equals(chapterId).delete();
  },
  deleteByChapters: async (chapterIds) => {
    await db.versions.where('chapterId').anyOf(chapterIds).delete();
  },
  idsByChapters: async (chapterIds) => {
    const keys = await db.versions.where('chapterId').anyOf(chapterIds).primaryKeys();
    return keys as string[];
  },
  bulkDelete: (ids) => db.versions.bulkDelete(ids),
};

const characters: CharacterStore = {
  list: () => db.characters.toArray(),
  listByProject: (projectId) => db.characters.where('projectId').equals(projectId).toArray(),
  add: async (c) => { await db.characters.add(c); },
  update: async (id, data) => { await db.characters.update(id, data); },
  delete: (id) => db.characters.delete(id),
  deleteByProject: async (projectId) => {
    await db.characters.where('projectId').equals(projectId).delete();
  },
  deleteByProjects: async (projectIds) => {
    await db.characters.where('projectId').anyOf(projectIds).delete();
  },
  bulkDelete: (ids) => db.characters.bulkDelete(ids),
};

const appMeta: AppMetaStore = {
  get: async <T = unknown>(key: string): Promise<T | undefined> => {
    const row = await db.appMeta.get(key);
    return (row?.value as T | undefined) ?? undefined;
  },
  put: async (key, value) => { await db.appMeta.put({ key, value }); },
  delete: async (key) => { await db.appMeta.delete(key); },
};

async function replaceAll(bundle: StorageBundle): Promise<void> {
  await db.transaction('rw', [db.projects, db.chapters, db.versions, db.characters], async () => {
    await db.projects.clear();
    await db.chapters.clear();
    await db.versions.clear();
    await db.characters.clear();
    await db.projects.bulkAdd(bundle.projects ?? []);
    await db.chapters.bulkAdd(bundle.chapters ?? []);
    await db.versions.bulkAdd(bundle.versions ?? []);
    await db.characters.bulkAdd(bundle.characters ?? []);
  });
}

export const dexieAdapter: StorageAdapter = {
  projects, chapters, versions, characters, appMeta,
  replaceAll,
};
```

- [ ] **Step 2: 確認編譯通過**

Run: `npx tsc --noEmit -p .`
Expected: 通過。若 Dexie 型別有警告，先解決再進下一步。

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage/dexie-adapter.ts
git commit -m "feat(storage): DexieAdapter 實作 — 包現有 Dexie code 為 StorageAdapter"
```

---

## Task 3: 平台偵測 + storage singleton

**Files:**
- Create: `src/lib/storage/index.ts`

- [ ] **Step 1: 寫 `src/lib/storage/index.ts`**

```typescript
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
```

- [ ] **Step 2: 確認編譯通過**

Run: `npx tsc --noEmit -p .`
Expected: 通過。

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage/index.ts
git commit -m "feat(storage): storage singleton + 平台偵測骨架"
```

---

## Task 4: 遷移 `src/stores/projectStore.ts`

**Files:**
- Modify: `src/stores/projectStore.ts`

這是最大檔案、最多 `db.*` 呼叫。逐一替換，**保留原有行為**（型別、回傳、副作用都相同）。

- [ ] **Step 1: 改 import**

把 `src/stores/projectStore.ts` 第 3 行

```typescript
import { db } from '../lib/db';
```

改成

```typescript
import { storage } from '../lib/storage';
```

- [ ] **Step 2: 替換 projects 操作**

對應替換表（全檔案逐處改）：

| 原 | 新 |
|----|----|
| `db.projects.orderBy('updatedAt').reverse().toArray()` | `storage.projects.listAllByUpdatedDesc()` |
| `db.projects.get(id)` | `storage.projects.get(id)` |
| `db.projects.add(project)` | `storage.projects.add(project)` |
| `db.projects.update(id, {...})` | `storage.projects.update(id, {...})` |
| `db.projects.delete(id)` | `storage.projects.delete(id)` |

具體 `updateProject` 的程式片段（line 66-73），保留原有的 `updatedAt: Date.now()` 行為：

```typescript
updateProject: async (id, data) => {
  await storage.projects.update(id, { ...data, updatedAt: Date.now() });
  const project = await storage.projects.get(id);
  set({ project: project || null });
  const books = await storage.projects.listAllByUpdatedDesc();
  set({ books });
},
```

`deleteProject` (line 75-91) — 把 chapterIds 撈出來再刪 versions / chapters / characters / project：

```typescript
deleteProject: async (id) => {
  const chapters = await storage.chapters.listByProject(id, { sorted: false });
  const chapterIds = chapters.map((c) => c.id);
  await storage.versions.deleteByChapters(chapterIds);
  await storage.chapters.deleteByProject(id);
  await storage.characters.deleteByProject(id);
  await storage.projects.delete(id);

  const books = get().books.filter((b) => b.id !== id);
  set({ books });
  if (get().project?.id === id) {
    set({ project: null, chapters: [], characters: [], currentChapterVersions: [] });
  }
},
```

- [ ] **Step 3: 替換 chapters 操作**

| 原 | 新 |
|----|----|
| `db.chapters.where('projectId').equals(id).sortBy('order')` | `storage.chapters.listByProject(id)` |
| `db.chapters.add(chapter)` | `storage.chapters.add(chapter)` |
| `db.chapters.update(id, {...})` | `storage.chapters.update(id, {...})` |
| `db.chapters.delete(id)` | `storage.chapters.delete(id)` |

`reorderChapters` (line 128-143) — `Promise.all` 內的 update 也走 adapter：

```typescript
reorderChapters: async (orderedIds) => {
  const now = Date.now();
  const byId = new Map(get().chapters.map((c) => [c.id, c]));
  await Promise.all(
    orderedIds.map((id, idx) => storage.chapters.update(id, { order: idx, updatedAt: now })),
  );
  const next: Chapter[] = orderedIds
    .map((id, idx) => {
      const c = byId.get(id);
      return c ? { ...c, order: idx, updatedAt: now } : null;
    })
    .filter((c): c is Chapter => !!c);
  set({ chapters: next });
},
```

- [ ] **Step 4: 替換 versions 操作**

`deleteChapter` (line 122-126)：

```typescript
deleteChapter: async (id) => {
  await storage.chapters.delete(id);
  await storage.versions.deleteByChapter(id);
  set({ chapters: get().chapters.filter((c) => c.id !== id) });
},
```

`saveVersion` (line 149-170)：把 `db.versions.delete` / `db.versions.add` 改成 adapter：

```typescript
saveVersion: async (chapterId, content, prompt, kind = 'full') => {
  const id = uuid();
  const versions = get().currentChapterVersions;

  const nonPinned = versions.filter((v) => !v.isPinned);
  const pinned = versions.filter((v) => v.isPinned);
  if (nonPinned.length >= 3) {
    const oldest = nonPinned.sort((a, b) => a.createdAt - b.createdAt)[0];
    await storage.versions.delete(oldest.id);
  }

  const newVersion: ChapterVersion = {
    id, chapterId, content, prompt,
    isPinned: false, label: '',
    kind,
    createdAt: Date.now(),
  };
  await storage.versions.add(newVersion);
  const updated = [...pinned, ...nonPinned.filter(v => v.id !== (nonPinned.length >= 3 ? nonPinned.sort((a, b) => a.createdAt - b.createdAt)[0].id : '')), newVersion]
    .sort((a, b) => b.createdAt - a.createdAt);
  set({ currentChapterVersions: updated });
},
```

`loadVersions` (line 172-176)：

```typescript
loadVersions: async (chapterId) => {
  const versions = await storage.versions.listByChapterDesc(chapterId);
  set({ currentChapterVersions: versions });
},
```

`pinVersion` / `deleteVersion`：直接替換對應 db 呼叫。

- [ ] **Step 5: 替換 characters 操作**

| 原 | 新 |
|----|----|
| `db.characters.where('projectId').equals(projectId).toArray()` | `storage.characters.listByProject(projectId)` |
| `db.characters.add(character)` | `storage.characters.add(character)` |
| `db.characters.update(id, data)` | `storage.characters.update(id, data)` |
| `db.characters.delete(id)` | `storage.characters.delete(id)` |

- [ ] **Step 6: 確認 build 通過**

Run: `npm run build`
Expected: build 成功，無 TypeScript 錯誤。

- [ ] **Step 7: Grep 確認檔案內已無 `db.`**

Run（在專案根）：`grep -n "db\." src/stores/projectStore.ts | grep -v "^\\s*//"`
Expected: 無輸出（已全部換成 `storage.`）。

注意：如果有 inline comment 提到 db 是 OK 的，只要實際呼叫都換掉即可。

- [ ] **Step 8: Commit**

```bash
git add src/stores/projectStore.ts
git commit -m "refactor(stores): projectStore 改走 storage adapter"
```

---

## Task 5: 遷移 `src/lib/backup.ts`

**Files:**
- Modify: `src/lib/backup.ts`

- [ ] **Step 1: 改 import + 改 exportSnapshot / importSnapshot**

替換整個檔案內容（保留外部 API 不變：`exportSnapshot`, `importSnapshot`, `downloadSnapshotAsJson`, `readSnapshotFromFile`, `describeSnapshot`, `BACKUP_SCHEMA_VERSION`, `BACKUP_FILENAME`, `BackupSnapshot` 型別）：

```typescript
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
import type { Project, Chapter, ChapterVersion, Character } from '../types';

export const BACKUP_SCHEMA_VERSION = 1 as const;
export const BACKUP_FILENAME = 'novel-generator-backup.json';

export interface BackupSnapshot {
  schema: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: number;
  app: 'novel-generator';
  projects: Project[];
  chapters: Chapter[];
  versions: ChapterVersion[];
  characters: Character[];
}

export async function exportSnapshot(): Promise<BackupSnapshot> {
  const [projects, chapters, versions, characters] = await Promise.all([
    storage.projects.list(),
    storage.chapters.list(),
    storage.versions.list(),
    storage.characters.list(),
  ]);
  return {
    schema: BACKUP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    app: 'novel-generator',
    projects, chapters, versions, characters,
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
  if (snapshot.schema !== BACKUP_SCHEMA_VERSION) {
    throw new Error(`不支援的備份版本：${snapshot.schema}（目前支援 v${BACKUP_SCHEMA_VERSION}）`);
  }

  if (mode === 'replace') {
    await storage.replaceAll({
      projects: snapshot.projects ?? [],
      chapters: snapshot.chapters ?? [],
      versions: snapshot.versions ?? [],
      characters: snapshot.characters ?? [],
    });
  }
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
  return `${s.projects?.length ?? 0} 本書 · ${s.chapters?.length ?? 0} 章節 · ${s.characters?.length ?? 0} 角色 · 匯出於 ${t}`;
}
```

- [ ] **Step 2: Build 確認**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: Commit**

```bash
git add src/lib/backup.ts
git commit -m "refactor(backup): 改走 storage adapter（replaceAll 取代直接 transaction）"
```

---

## Task 6: 遷移 `src/lib/fs-sync.ts`

**Files:**
- Modify: `src/lib/fs-sync.ts`

- [ ] **Step 1: 改 import + appMeta 呼叫**

把第 13 行：

```typescript
import { db } from './db';
```

改成：

```typescript
import { storage } from './storage';
```

然後改 `saveHandle` / `loadHandle` / `clearHandle`（line 29-40）：

```typescript
async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await storage.appMeta.put(HANDLE_META_KEY, handle);
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  const value = await storage.appMeta.get<FileSystemDirectoryHandle>(HANDLE_META_KEY);
  return value ?? null;
}

async function clearHandle(): Promise<void> {
  await storage.appMeta.delete(HANDLE_META_KEY);
}
```

檔案其餘部分（pickAndLinkFolder / getLinkedFolderHandle / pushSnapshotNow 等）不變。

- [ ] **Step 2: Build 確認**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: Grep 確認**

Run: `grep -n "from './db'" src/lib/fs-sync.ts`
Expected: 無輸出。

- [ ] **Step 4: Commit**

```bash
git add src/lib/fs-sync.ts
git commit -m "refactor(fs-sync): appMeta 改走 storage adapter"
```

---

## Task 7: 遷移 `src/lib/db-maintenance.ts`

**Files:**
- Modify: `src/lib/db-maintenance.ts`

這是 dev 工具（掛到 `window.dbDebug`），改成走 adapter。**但要保留 `window.dbDebug.db` 仍指向原本 Dexie 實例**（dev console 經常需要直接戳 db），所以這個檔案是**唯一允許**保留 `import { db }` 的非 adapter 檔案。

- [ ] **Step 1: 改檔案內容**

替換為：

```typescript
/**
 * IndexedDB 診斷與清理工具
 *
 * 用途：清掉舊版本/被中斷刪除流程留下的孤兒資料
 *  - characters / chapters / versions 的 projectId 指向已不存在的 project → 視為孤兒
 *  - versions 的 chapterId 指向已不存在的 chapter → 視為孤兒
 *
 * Dev 環境會自動掛到 window.dbDebug 以便從 Console 呼叫：
 *   window.dbDebug.inspect()            // 列出所有資料統計與孤兒
 *   window.dbDebug.cleanupOrphans()     // 刪除所有孤兒
 *   window.dbDebug.wipeAllExceptBook('小圓舞進行曲')
 *                                       // 只保留指定書名（含子資料），其餘全清
 *
 * 注意：此檔案另外 import 原始 `db` 並掛到 window.dbDebug.db，
 * 方便從 dev console 直接戳 Dexie。其餘檔案禁止 import './db'。
 */
import { storage } from './storage';
import { db } from './db';

export interface DBReport {
  books: { id: string; title: string; chapterCount: number; characterCount: number }[];
  orphanCharacters: { id: string; name: string; projectId: string }[];
  orphanChapters: { id: string; title: string; projectId: string }[];
  orphanVersions: { id: string; chapterId: string }[];
}

export async function inspect(): Promise<DBReport> {
  const projects = await storage.projects.list();
  const chapters = await storage.chapters.list();
  const characters = await storage.characters.list();
  const versions = await storage.versions.list();

  const bookIds = new Set(projects.map((p) => p.id));
  const chapterIds = new Set(chapters.map((c) => c.id));

  const books = projects.map((p) => ({
    id: p.id,
    title: p.title,
    chapterCount: chapters.filter((c) => c.projectId === p.id).length,
    characterCount: characters.filter((c) => c.projectId === p.id).length,
  }));

  const orphanCharacters = characters
    .filter((c) => !bookIds.has(c.projectId))
    .map((c) => ({ id: c.id, name: c.name, projectId: c.projectId }));

  const orphanChapters = chapters
    .filter((c) => !bookIds.has(c.projectId))
    .map((c) => ({ id: c.id, title: c.title, projectId: c.projectId }));

  const orphanVersions = versions
    .filter((v) => !chapterIds.has(v.chapterId))
    .map((v) => ({ id: v.id, chapterId: v.chapterId }));

  const report: DBReport = { books, orphanCharacters, orphanChapters, orphanVersions };
  console.table(books);
  if (orphanCharacters.length) {
    console.warn(`[孤兒角色] ${orphanCharacters.length} 筆：`);
    console.table(orphanCharacters);
  }
  if (orphanChapters.length) {
    console.warn(`[孤兒章節] ${orphanChapters.length} 筆：`);
    console.table(orphanChapters);
  }
  if (orphanVersions.length) {
    console.warn(`[孤兒版本] ${orphanVersions.length} 筆`);
  }
  if (!orphanCharacters.length && !orphanChapters.length && !orphanVersions.length) {
    console.log('✅ 沒有孤兒資料');
  }
  return report;
}

export async function cleanupOrphans(): Promise<{ characters: number; chapters: number; versions: number }> {
  const report = await inspect();
  const charIds = report.orphanCharacters.map((c) => c.id);
  const chapIds = report.orphanChapters.map((c) => c.id);
  const verIds = report.orphanVersions.map((v) => v.id);

  if (charIds.length) await storage.characters.bulkDelete(charIds);
  if (chapIds.length) {
    // 同時清掉指向這些章節的版本
    const versionsOfOrphanChapters = await storage.versions.idsByChapters(chapIds);
    await storage.versions.bulkDelete(versionsOfOrphanChapters);
    await storage.chapters.bulkDelete(chapIds);
  }
  if (verIds.length) await storage.versions.bulkDelete(verIds);

  console.log(`🧹 已清除：${charIds.length} 個孤兒角色 / ${chapIds.length} 個孤兒章節 / ${verIds.length + (chapIds.length ? '+'  : '')} 個孤兒版本`);
  return { characters: charIds.length, chapters: chapIds.length, versions: verIds.length };
}

/**
 * 強力清理：只保留指定書名的書本，其他全部刪除（含子資料）。
 * 若 title 對應多本書，全部保留。
 */
export async function wipeAllExceptBook(title: string): Promise<void> {
  const projects = await storage.projects.list();
  const keep = projects.filter((p) => p.title === title);
  if (keep.length === 0) {
    console.warn(`找不到書名為「${title}」的書本，沒有任何動作`);
    return;
  }
  const keepIds = new Set(keep.map((p) => p.id));

  const removeProjectIds = projects.filter((p) => !keepIds.has(p.id)).map((p) => p.id);
  if (removeProjectIds.length === 0) {
    console.log(`✅ 已經只剩下「${title}」，無需清理`);
  }

  // 刪除非保留書的所有子資料
  const removeChapters = (await storage.chapters.list()).filter((c) => removeProjectIds.includes(c.projectId));
  const removeChapterIds = removeChapters.map((c) => c.id);
  if (removeChapterIds.length) {
    await storage.versions.deleteByChapters(removeChapterIds);
    await storage.chapters.bulkDelete(removeChapterIds);
  }
  await storage.characters.deleteByProjects(removeProjectIds);
  await storage.projects.bulkDelete(removeProjectIds);

  // 再做一次孤兒清理（保險）
  await cleanupOrphans();

  console.log(`🧹 已只保留「${title}」（${keep.length} 本），刪除其他 ${removeProjectIds.length} 本書與相關資料`);
  console.log('請重新整理頁面以看到結果');
}

// Dev 模式下掛到 window，方便從 Console 操作
if (import.meta.env.DEV) {
  (window as unknown as { dbDebug: unknown }).dbDebug = {
    inspect,
    cleanupOrphans,
    wipeAllExceptBook,
    db,        // 仍掛原始 Dexie 實例供 dev console 直接戳
    storage,   // 也掛 adapter 方便測試
  };
}
```

- [ ] **Step 2: Build 確認**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: Commit**

```bash
git add src/lib/db-maintenance.ts
git commit -m "refactor(db-maintenance): 業務邏輯走 storage adapter，db 實例僅供 dev console"
```

---

## Task 8: 遷移 `src/components/home/HomePage.tsx`

**Files:**
- Modify: `src/components/home/HomePage.tsx`

- [ ] **Step 1: 改 import**

把 line 4：

```typescript
import { db } from '../../lib/db';
```

改成：

```typescript
import { storage } from '../../lib/storage';
```

- [ ] **Step 2: 改 wordCounts 計算**

把 line 25-35 的 useEffect 內 `db.chapters.where(...)` 換成 adapter：

```typescript
  // Compute word counts for each book
  useEffect(() => {
    if (books.length === 0) return;
    (async () => {
      const counts: Record<string, number> = {};
      for (const book of books) {
        const chapters = await storage.chapters.listByProject(book.id, { sorted: false });
        counts[book.id] = chapters.reduce((sum, c) => sum + (c.content?.length ?? 0), 0);
      }
      setWordCounts(counts);
    })();
  }, [books]);
```

- [ ] **Step 3: Build 確認**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 4: Commit**

```bash
git add src/components/home/HomePage.tsx
git commit -m "refactor(home): wordCounts 改走 storage adapter"
```

---

## Task 9: 全專案驗證 — 確認除 adapter 外無人 import db

**Files:** （驗證）

- [ ] **Step 1: Grep 全專案 db 直接 import**

Run（在專案根；注意要排除 `node_modules`、build 產物、adapter 本身、dev-only maintenance）：

```bash
grep -rn "from '\./db'\|from '\.\./db'\|from '\.\./lib/db'\|from '\.\.\/\.\.\/lib\/db'" src/ --include="*.ts" --include="*.tsx"
```

Expected 輸出（只能有這兩行）：

```
src/lib/storage/dexie-adapter.ts:<n>:import { db } from '../db';
src/lib/db-maintenance.ts:<n>:import { db } from './db';
```

如果出現其他檔案的引用，回去把它們改成 `import { storage } from '<相對路徑>/lib/storage'`。

- [ ] **Step 2: Build + Lint 雙驗證**

Run: `npm run build && npm run lint`
Expected: 兩者皆無錯誤。

- [ ] **Step 3: 視情況 commit**

如果這個 task 修了額外漏網檔案，commit；否則跳過。

---

## Task 10: 手動 smoke test

**Files:** （無修改，純驗證）

- [ ] **Step 1: 啟動 dev server**

Run: `npm run dev`
Expected: Vite 啟動，瀏覽器開 `http://localhost:5173` 看到首頁。

- [ ] **Step 2: 跑過所有資料路徑**

逐項驗證（每個都應該正常運作，與重構前行為一致）：

1. **首頁書庫**：能看到既有書本，字數統計正確（HomePage `storage.chapters.listByProject`）
2. **建立新書**：點「新增書本」→ 填表 → 進入編輯器（projectStore `createProject`）
3. **編輯大綱**：在大綱頁填寫世界觀/主線劇情並儲存（`updateProject`）
4. **新增章節**：建立兩個章節並拖曳換順序（`createChapter` + `reorderChapters`）
5. **生成本章正文** + 版本管理：生成一次正文 → 看版本列表 → 釘選版本 → 切換版本（`saveVersion` / `loadVersions` / `pinVersion`）
6. **新增角色**：手動建一個 + AI 生成（`createCharacter`）
7. **AI 填寫角色欄位**（驗證 `ai-tasks.ts` 與 store 配合無誤）
8. **刪除章節**：刪一個章節，相關版本應一併消失（`deleteChapter` + `versions.deleteByChapter`）
9. **刪除書本**：刪除整本書，相關章節/角色/版本應一併消失（`deleteProject`）
10. **匯出備份**：偏好設定 → 匯出 JSON snapshot（`exportSnapshot`）
11. **匯入備份**：清空後匯入剛剛的 JSON（`importSnapshot` → `replaceAll`）
12. **File System Access 連結資料夾**：偏好設定點「連結資料夾」→ 確認 handle 存到 IndexedDB（`fs-sync` 走 `storage.appMeta`）
13. **Dev console**：F12 → `await window.dbDebug.inspect()` 能跑出資料統計

- [ ] **Step 2.5: 紀錄 smoke test 結果**

任何路徑壞掉就 stop，回去修，不要硬推。

- [ ] **Step 3: 如有修正則 commit**

```bash
git add -p   # 視情況挑修正內容
git commit -m "fix(storage): smoke test 發現 <具體問題>"
```

- [ ] **Step 4: 最終確認 — git log 與 CHANGELOG**

Run: `git log --oneline -10`
Expected: 看到 Task 1-8（+ 可能的 Task 9/10 修正）一連串 commit。

更新 `docs/CHANGELOG.md`（在頂部加一段 Phase 5a 摘要）：

```markdown
## Phase 5a — StorageAdapter 抽象層（YYYY-MM-DD）

把 Dexie 包進 `StorageAdapter` interface，UI / stores / lib 都改走 `src/lib/storage`
singleton，不再直接 import `db`。功能完全不變，但為 Phase 5b（Tauri + SQLite）
鋪好換實作的路。

- `src/lib/storage/types.ts`：interface 定義
- `src/lib/storage/dexie-adapter.ts`：Dexie 實作（唯一 import `./db` 的業務檔）
- `src/lib/storage/index.ts`：平台偵測 + `storage` singleton
- 5 個消費端遷移：`projectStore` / `backup` / `fs-sync` / `db-maintenance` / `HomePage`
- 例外：`db-maintenance.ts` 因 dev console 需要直接戳 Dexie，仍 import `db`
  並掛到 `window.dbDebug.db`
```

Commit：

```bash
git add docs/CHANGELOG.md
git commit -m "docs(changelog): 記錄 Phase 5a — StorageAdapter 抽象層完成"
```

---

## 驗收標準（M1）

- [ ] `grep -rn "from '\./db'\|from '\.\./db'\|from '\.\./lib/db'\|from '\.\.\/\.\.\/lib\/db'" src/` 只出現在 `dexie-adapter.ts` 與 `db-maintenance.ts`
- [ ] `npm run build` 通過
- [ ] `npm run lint` 通過
- [ ] Smoke test 13 項全綠
- [ ] CHANGELOG 已更新
- [ ] Git log 看得到至少 8 個 commit（Task 1-8 各一）

完成後本 plan 結束。Phase 5b（Tauri + SQLite）由獨立 plan 處理，預期在 5a 穩定運行一段時間後才開始。
