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
