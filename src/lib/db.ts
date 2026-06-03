import Dexie, { type Table } from 'dexie';
import type {
  Project, Chapter, ChapterVersion, Character, LLMConfig, WikiPage, WikiLogEntry,
  ChapterComic, ComicPanel, MediaAsset, SceneVisual,
} from '../types';

/** appMeta：存放跨 app 共用的小型 key-value（同步資料夾 handle 等） */
export interface AppMetaRow {
  key: string;
  value: unknown;
}

export class NovelDB extends Dexie {
  projects!: Table<Project>;
  chapters!: Table<Chapter>;
  versions!: Table<ChapterVersion>;
  characters!: Table<Character>;
  settings!: Table<LLMConfig>;
  appMeta!: Table<AppMetaRow, string>;
  wikiPages!: Table<WikiPage>;
  wikiLog!: Table<WikiLogEntry>;
  comics!: Table<ChapterComic>;
  comicPanels!: Table<ComicPanel>;
  mediaAssets!: Table<MediaAsset>;
  sceneVisuals!: Table<SceneVisual>;

  constructor() {
    super('NovelGenerator');

    // v1 — initial schema
    this.version(1).stores({
      projects: 'id, createdAt',
      chapters: 'id, projectId, order',
      versions: 'id, chapterId, createdAt',
      characters: 'id, projectId, name',
      settings: 'id',
    });

    // v2 — ChapterVersion 加入 kind 欄位（'full' | 'inline'）
    // 升級時將既有版本一律標記為 'full'
    this.version(2)
      .stores({
        projects: 'id, createdAt',
        chapters: 'id, projectId, order',
        versions: 'id, chapterId, createdAt',
        characters: 'id, projectId, name',
        settings: 'id',
      })
      .upgrade(async (tx) => {
        await tx.table('versions').toCollection().modify((v: ChapterVersion) => {
          if (v.kind === undefined) v.kind = 'full';
        });
      });

    // v3 — projects 加入 updatedAt 索引，供書庫首頁按更新時間排序使用
    this.version(3)
      .stores({
        projects: 'id, createdAt, updatedAt',
        chapters: 'id, projectId, order',
        versions: 'id, chapterId, createdAt',
        characters: 'id, projectId, name',
        settings: 'id',
      })
      .upgrade(async (tx) => {
        // 既有 projects 若缺 updatedAt 欄位，補成 createdAt
        await tx.table('projects').toCollection().modify((p: Project) => {
          if (p.updatedAt === undefined) p.updatedAt = p.createdAt;
        });
      });

    // v4 — 加入 appMeta（存放 File System Access directory handle 等跨 session 小資料）
    this.version(4).stores({
      projects: 'id, createdAt, updatedAt',
      chapters: 'id, projectId, order',
      versions: 'id, chapterId, createdAt',
      characters: 'id, projectId, name',
      settings: 'id',
      appMeta: 'key',
    });

    // v5 — 章節新增 wikiSyncedHash / wikiSyncStatus；wiki_pages / wiki_log 兩新表
    this.version(5)
      .stores({
        projects: 'id, createdAt, updatedAt',
        chapters: 'id, projectId, order, wikiSyncStatus',
        versions: 'id, chapterId, createdAt',
        characters: 'id, projectId, name',
        settings: 'id',
        appMeta: 'key',
        wikiPages: 'id, bookId, [bookId+type+slug]',
        wikiLog: 'id, bookId, batchId, appliedAt',
      })
      .upgrade(async (tx) => {
        await tx.table('chapters').toCollection().modify((c: Chapter) => {
          if (c.wikiSyncedHash === undefined) c.wikiSyncedHash = null;
          if (c.wikiSyncStatus === undefined) {
            c.wikiSyncStatus = c.wikiSyncedAt ? 'synced' : 'unsynced';
          }
        });
      });

    // v6 — Phase 6 comic image MVP metadata tables
    this.version(6).stores({
      projects: 'id, createdAt, updatedAt',
      chapters: 'id, projectId, order, wikiSyncStatus',
      versions: 'id, chapterId, createdAt',
      characters: 'id, projectId, name',
      settings: 'id',
      appMeta: 'key',
      wikiPages: 'id, bookId, [bookId+type+slug]',
      wikiLog: 'id, bookId, batchId, appliedAt',
      comics: 'id, projectId, chapterId, updatedAt',
      comicPanels: 'id, comicId, order, status',
      mediaAssets: 'id, projectId, chapterId, kind, createdAt',
    });

    // v7: project-level reusable scene visual settings for comic image generation.
    this.version(7).stores({
      projects: 'id, createdAt, updatedAt',
      chapters: 'id, projectId, order, wikiSyncStatus',
      versions: 'id, chapterId, createdAt',
      characters: 'id, projectId, name',
      settings: 'id',
      appMeta: 'key',
      wikiPages: 'id, bookId, [bookId+type+slug]',
      wikiLog: 'id, bookId, batchId, appliedAt',
      comics: 'id, projectId, chapterId, updatedAt',
      comicPanels: 'id, comicId, order, status',
      mediaAssets: 'id, projectId, chapterId, kind, createdAt',
      sceneVisuals: 'id, projectId, &[projectId+slug], updatedAt',
    });
  }
}

export const db = new NovelDB();
