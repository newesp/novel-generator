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
    this.version(1).stores({
      projects: 'id, createdAt',
      chapters: 'id, projectId, order',
      versions: 'id, chapterId, createdAt',
      characters: 'id, projectId, name',
      settings: 'id',
    });
  }
}

export const db = new NovelDB();
