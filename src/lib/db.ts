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
  }
}

export const db = new NovelDB();
