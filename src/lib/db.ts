import Dexie, { type Table } from 'dexie';
import type { Project, Chapter, ChapterVersion, Character, LLMConfig } from '../types';

export class NovelDB extends Dexie {
  projects!: Table<Project>;
  chapters!: Table<Chapter>;
  versions!: Table<ChapterVersion>;
  characters!: Table<Character>;
  settings!: Table<LLMConfig>;

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
  }
}

export const db = new NovelDB();
