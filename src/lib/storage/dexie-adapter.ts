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
  WikiPagesStore,
  WikiLogStore,
  ChapterComicStore,
  ComicPanelStore,
  ComicPanelImageVariantStore,
  MediaAssetStore,
  SceneVisualStore,
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

const wikiPages: WikiPagesStore = {
  list: (bookId) => db.wikiPages.where('bookId').equals(bookId).toArray(),
  get: (id) => db.wikiPages.get(id),
  findBySlug: (bookId, type, slug) =>
    db.wikiPages.where('[bookId+type+slug]').equals([bookId, type, slug]).first(),
  add: async (p) => { await db.wikiPages.add(p); },
  update: async (p) => { await db.wikiPages.put(p); },
  delete: (id) => db.wikiPages.delete(id),
  totalLength: async (bookId) => {
    const pages = await db.wikiPages.where('bookId').equals(bookId).toArray();
    return pages.reduce((sum, p) => sum + (p.contentMd?.length ?? 0), 0);
  },
  listAll: () => db.wikiPages.toArray(),
  deleteByBook: async (bookId) => {
    await db.wikiPages.where('bookId').equals(bookId).delete();
  },
};

const wikiLog: WikiLogStore = {
  list: async (bookId, limit) => {
    const arr = await db.wikiLog.where('bookId').equals(bookId).sortBy('appliedAt');
    arr.reverse();
    return limit ? arr.slice(0, limit) : arr;
  },
  listByBatch: (bookId, batchId) =>
    db.wikiLog.where('batchId').equals(batchId).toArray()
      .then((arr) => arr.filter((e) => e.bookId === bookId)),
  add: async (e) => { await db.wikiLog.add(e); },
  updateStatus: async (id, opStatus, errorMessage) => {
    await db.wikiLog.update(id, { opStatus, errorMessage });
  },
  listAll: () => db.wikiLog.toArray(),
  deleteByBook: async (bookId) => {
    await db.wikiLog.where('bookId').equals(bookId).delete();
  },
};

const appMeta: AppMetaStore = {
  get: async <T = unknown>(key: string): Promise<T | undefined> => {
    const row = await db.appMeta.get(key);
    return (row?.value as T | undefined) ?? undefined;
  },
  put: async (key, value) => { await db.appMeta.put({ key, value }); },
  delete: async (key) => { await db.appMeta.delete(key); },
};

const comics: ChapterComicStore = {
  listAll: () => db.comics.toArray(),
  listByChapter: async (chapterId) => {
    const arr = await db.comics.where('chapterId').equals(chapterId).sortBy('updatedAt');
    return arr.reverse();
  },
  get: (id) => db.comics.get(id),
  add: async (comic) => { await db.comics.add(comic); },
  update: async (id, data) => { await db.comics.update(id, data); },
  delete: (id) => db.comics.delete(id),
  deleteByProject: async (projectId) => {
    await db.comics.where('projectId').equals(projectId).delete();
  },
};

const comicPanels: ComicPanelStore = {
  listAll: () => db.comicPanels.toArray(),
  listByComic: (comicId) => db.comicPanels.where('comicId').equals(comicId).sortBy('order'),
  get: (id) => db.comicPanels.get(id),
  add: async (panel) => { await db.comicPanels.add(panel); },
  bulkAdd: async (panels) => { await db.comicPanels.bulkAdd(panels); },
  update: async (id, data) => { await db.comicPanels.update(id, data); },
  deleteByComic: async (comicId) => {
    await db.comicPanels.where('comicId').equals(comicId).delete();
  },
};

const comicPanelImageVariants: ComicPanelImageVariantStore = {
  listAll: () => db.comicPanelImageVariants.toArray(),
  listByComic: (comicId) => db.comicPanelImageVariants.where('comicId').equals(comicId).sortBy('createdAt'),
  listByPanel: (panelId) => db.comicPanelImageVariants.where('panelId').equals(panelId).sortBy('createdAt'),
  get: (id) => db.comicPanelImageVariants.get(id),
  add: async (variant) => { await db.comicPanelImageVariants.add(variant); },
  update: async (id, data) => { await db.comicPanelImageVariants.update(id, data); },
  delete: (id) => db.comicPanelImageVariants.delete(id),
  deleteByComic: async (comicId) => {
    await db.comicPanelImageVariants.where('comicId').equals(comicId).delete();
  },
  deleteByPanel: async (panelId) => {
    await db.comicPanelImageVariants.where('panelId').equals(panelId).delete();
  },
};

const mediaAssets: MediaAssetStore = {
  listAll: () => db.mediaAssets.toArray(),
  listByChapter: (chapterId) => db.mediaAssets.where('chapterId').equals(chapterId).sortBy('createdAt'),
  get: (id) => db.mediaAssets.get(id),
  add: async (asset) => { await db.mediaAssets.add(asset); },
  update: async (id, data) => { await db.mediaAssets.update(id, data); },
  delete: (id) => db.mediaAssets.delete(id),
  deleteByProject: async (projectId) => {
    await db.mediaAssets.where('projectId').equals(projectId).delete();
  },
};

const sceneVisuals: SceneVisualStore = {
  listAll: () => db.sceneVisuals.toArray(),
  listByProject: (projectId) => db.sceneVisuals.where('projectId').equals(projectId).sortBy('title'),
  get: (id) => db.sceneVisuals.get(id),
  findBySlug: (projectId, slug) =>
    db.sceneVisuals.where('[projectId+slug]').equals([projectId, slug]).first(),
  add: async (scene) => { await db.sceneVisuals.add(scene); },
  update: async (id, data) => { await db.sceneVisuals.update(id, data); },
  delete: (id) => db.sceneVisuals.delete(id),
  deleteByProject: async (projectId) => {
    await db.sceneVisuals.where('projectId').equals(projectId).delete();
  },
};

async function replaceAll(bundle: StorageBundle): Promise<void> {
  await db.transaction('rw',
    [db.projects, db.chapters, db.versions, db.characters, db.wikiPages, db.wikiLog,
      db.comics, db.comicPanels, db.comicPanelImageVariants, db.mediaAssets, db.sceneVisuals],
    async () => {
      await db.sceneVisuals.clear();
      await db.mediaAssets.clear();
      await db.comicPanelImageVariants.clear();
      await db.comicPanels.clear();
      await db.comics.clear();
      await db.projects.clear();
      await db.chapters.clear();
      await db.versions.clear();
      await db.characters.clear();
      await db.wikiPages.clear();
      await db.wikiLog.clear();
      await db.projects.bulkAdd(bundle.projects ?? []);
      await db.chapters.bulkAdd(bundle.chapters ?? []);
      await db.versions.bulkAdd(bundle.versions ?? []);
      await db.characters.bulkAdd(bundle.characters ?? []);
      // pages → log 順序（spec §3.4）
      await db.wikiPages.bulkAdd(bundle.wikiPages ?? []);
      await db.wikiLog.bulkAdd(bundle.wikiLog ?? []);
      await db.comics.bulkAdd(bundle.comics ?? []);
      await db.comicPanels.bulkAdd(bundle.comicPanels ?? []);
      await db.comicPanelImageVariants.bulkAdd(bundle.comicPanelImageVariants ?? []);
      await db.mediaAssets.bulkAdd(bundle.mediaAssets ?? []);
      await db.sceneVisuals.bulkAdd(bundle.sceneVisuals ?? []);
    },
  );
}

export const dexieAdapter: StorageAdapter = {
  projects, chapters, versions, characters, appMeta,
  wikiPages, wikiLog, comics, comicPanels, comicPanelImageVariants, mediaAssets, sceneVisuals,
  replaceAll,
};
