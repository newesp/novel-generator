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
import type {
  Project, Chapter, ChapterVersion, Character,
  WikiPage, WikiLogEntry, WikiPageType,
  ChapterComic, ComicPanel, ComicPanelImageVariant, MediaAsset, SceneVisual,
} from '../../types';
import type { SearchStore } from '../search/types';

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

export interface WikiPagesStore {
  list(bookId: string): Promise<WikiPage[]>;
  get(id: string): Promise<WikiPage | undefined>;
  findBySlug(bookId: string, type: WikiPageType, slug: string): Promise<WikiPage | undefined>;
  add(page: WikiPage): Promise<void>;
  update(page: WikiPage): Promise<void>;
  delete(id: string): Promise<void>;
  /** SUM(length(content_md)) over the book */
  totalLength(bookId: string): Promise<number>;
  /** 給匯出 / 級聯用 */
  listAll(): Promise<WikiPage[]>;
  deleteByBook(bookId: string): Promise<void>;
}

export interface WikiLogStore {
  list(bookId: string, limit?: number): Promise<WikiLogEntry[]>;
  listByBatch(bookId: string, batchId: string): Promise<WikiLogEntry[]>;
  add(entry: WikiLogEntry): Promise<void>;
  updateStatus(id: string, opStatus: WikiLogEntry['opStatus'], errorMessage?: string): Promise<void>;
  /** 給匯出 / 級聯用 */
  listAll(): Promise<WikiLogEntry[]>;
  deleteByBook(bookId: string): Promise<void>;
}

export interface ChapterComicStore {
  listAll(): Promise<ChapterComic[]>;
  listByChapter(chapterId: string): Promise<ChapterComic[]>;
  get(id: string): Promise<ChapterComic | undefined>;
  add(comic: ChapterComic): Promise<void>;
  update(id: string, data: Partial<ChapterComic>): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByProject(projectId: string): Promise<void>;
}

export interface ComicPanelStore {
  listAll(): Promise<ComicPanel[]>;
  listByComic(comicId: string): Promise<ComicPanel[]>;
  get(id: string): Promise<ComicPanel | undefined>;
  add(panel: ComicPanel): Promise<void>;
  bulkAdd(panels: ComicPanel[]): Promise<void>;
  update(id: string, data: Partial<ComicPanel>): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByComic(comicId: string): Promise<void>;
}

export interface ComicPanelImageVariantStore {
  listAll(): Promise<ComicPanelImageVariant[]>;
  listByComic(comicId: string): Promise<ComicPanelImageVariant[]>;
  listByPanel(panelId: string): Promise<ComicPanelImageVariant[]>;
  get(id: string): Promise<ComicPanelImageVariant | undefined>;
  add(variant: ComicPanelImageVariant): Promise<void>;
  update(id: string, data: Partial<ComicPanelImageVariant>): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByComic(comicId: string): Promise<void>;
  deleteByPanel(panelId: string): Promise<void>;
}

export interface MediaAssetStore {
  listAll(): Promise<MediaAsset[]>;
  listByChapter(chapterId: string): Promise<MediaAsset[]>;
  get(id: string): Promise<MediaAsset | undefined>;
  add(asset: MediaAsset): Promise<void>;
  update(id: string, data: Partial<MediaAsset>): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByProject(projectId: string): Promise<void>;
}

/** 整體匯出/匯入用的資料束（與 backup.ts BackupSnapshot 對齊但去掉 metadata） */
export interface SceneVisualStore {
  listAll(): Promise<SceneVisual[]>;
  listByProject(projectId: string): Promise<SceneVisual[]>;
  get(id: string): Promise<SceneVisual | undefined>;
  findBySlug(projectId: string, slug: string): Promise<SceneVisual | undefined>;
  add(scene: SceneVisual): Promise<void>;
  update(id: string, data: Partial<SceneVisual>): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByProject(projectId: string): Promise<void>;
}

export interface StorageBundle {
  projects: Project[];
  chapters: Chapter[];
  versions: ChapterVersion[];
  characters: Character[];
  wikiPages?: WikiPage[];
  wikiLog?: WikiLogEntry[];
  comics?: ChapterComic[];
  comicPanels?: ComicPanel[];
  comicPanelImageVariants?: ComicPanelImageVariant[];
  mediaAssets?: MediaAsset[];
  sceneVisuals?: SceneVisual[];
}

export interface StorageAdapter {
  projects: ProjectStore;
  chapters: ChapterStore;
  versions: VersionStore;
  characters: CharacterStore;
  appMeta: AppMetaStore;
  wikiPages: WikiPagesStore;
  wikiLog: WikiLogStore;
  comics: ChapterComicStore;
  comicPanels: ComicPanelStore;
  comicPanelImageVariants: ComicPanelImageVariantStore;
  mediaAssets: MediaAssetStore;
  sceneVisuals: SceneVisualStore;
  /** Tauri-only FTS5 search store. Browser/Dexie adapter leaves this undefined. */
  search?: SearchStore;

  /**
   * 原子性清空再寫入（給 backup importSnapshot 用）
   * Dexie 用 transaction；之後 SQLite 用 transaction。
   * 不含 settings（不在備份範圍）。
   */
  replaceAll(bundle: StorageBundle): Promise<void>;
}
