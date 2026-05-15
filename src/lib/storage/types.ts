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
