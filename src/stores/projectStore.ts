import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { db } from '../lib/db';
import type { Project, Chapter, ChapterVersion, Character } from '../types';

interface ProjectState {
  books: Project[];
  project: Project | null;
  chapters: Chapter[];
  characters: Character[];
  currentChapterVersions: ChapterVersion[];

  loadAllBooks: () => Promise<void>;
  loadProject: (id: string) => Promise<void>;
  createProject: (p: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateProject: (id: string, data: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  loadChapters: (projectId: string) => Promise<void>;
  createChapter: (projectId: string, title: string) => Promise<string>;
  updateChapter: (id: string, data: Partial<Chapter>) => Promise<void>;
  deleteChapter: (id: string) => Promise<void>;
  /** 依照給定的 id 順序，批次更新所有章節的 order 欄位 */
  reorderChapters: (orderedIds: string[]) => Promise<void>;
  setCurrentChapter: (chapterId: string) => Promise<void>;
  saveVersion: (chapterId: string, content: string, prompt: string, kind?: 'full' | 'inline') => Promise<void>;
  loadVersions: (chapterId: string) => Promise<void>;
  pinVersion: (versionId: string, pinned: boolean) => Promise<void>;
  deleteVersion: (versionId: string) => Promise<void>;

  loadCharacters: (projectId: string) => Promise<void>;
  createCharacter: (projectId: string, data: Omit<Character, 'id' | 'projectId' | 'createdAt'>) => Promise<string>;
  updateCharacter: (id: string, data: Partial<Character>) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  books: [],
  project: null,
  chapters: [],
  characters: [],
  currentChapterVersions: [],

  loadAllBooks: async () => {
    const books = await db.projects.orderBy('updatedAt').reverse().toArray();
    set({ books });
  },

  loadProject: async (id) => {
    const project = await db.projects.get(id);
    set({ project: project || null });
  },

  createProject: async (data) => {
    const id = uuid();
    const now = Date.now();
    const project: Project = { id, ...data, createdAt: now, updatedAt: now };
    await db.projects.add(project);
    set({ project, chapters: [], characters: [], currentChapterVersions: [] });
    // refresh books list
    const books = await db.projects.orderBy('updatedAt').reverse().toArray();
    set({ books });
    return id;
  },

  updateProject: async (id, data) => {
    await db.projects.update(id, { ...data, updatedAt: Date.now() });
    const project = await db.projects.get(id);
    set({ project: project || null });
    // refresh books list
    const books = await db.projects.orderBy('updatedAt').reverse().toArray();
    set({ books });
  },

  deleteProject: async (id) => {
    // Delete all related data
    const chapterIds = (await db.chapters.where('projectId').equals(id).toArray()).map((c) => c.id);
    for (const cid of chapterIds) {
      await db.versions.where('chapterId').equals(cid).delete();
    }
    await db.chapters.where('projectId').equals(id).delete();
    await db.characters.where('projectId').equals(id).delete();
    await db.projects.delete(id);

    // Update state
    const books = get().books.filter((b) => b.id !== id);
    set({ books });
    if (get().project?.id === id) {
      set({ project: null, chapters: [], characters: [], currentChapterVersions: [] });
    }
  },

  loadChapters: async (projectId) => {
    const chapters = await db.chapters.where('projectId').equals(projectId).sortBy('order');
    set({ chapters });
  },

  createChapter: async (projectId, title) => {
    const chapters = get().chapters;
    const order = chapters.length;
    const id = uuid();
    const now = Date.now();
    const chapter: Chapter = {
      id, projectId, order, title,
      targetWords: null, beat: '', points: '',
      content: '', referenceChapterId: null, wikiSyncedAt: null,
      createdAt: now, updatedAt: now,
    };
    await db.chapters.add(chapter);
    set({ chapters: [...chapters, chapter] });
    return id;
  },

  updateChapter: async (id, data) => {
    await db.chapters.update(id, { ...data, updatedAt: Date.now() });
    const chapters = get().chapters.map((c) =>
      c.id === id ? { ...c, ...data, updatedAt: Date.now() } : c
    );
    set({ chapters });
  },

  deleteChapter: async (id) => {
    await db.chapters.delete(id);
    await db.versions.where('chapterId').equals(id).delete();
    set({ chapters: get().chapters.filter((c) => c.id !== id) });
  },

  reorderChapters: async (orderedIds) => {
    const now = Date.now();
    const byId = new Map(get().chapters.map((c) => [c.id, c]));
    // 寫入 DB（批次但仍逐筆，Dexie tx 開銷小）
    await Promise.all(
      orderedIds.map((id, idx) => db.chapters.update(id, { order: idx, updatedAt: now })),
    );
    // 更新 state（保留每章的其他欄位）
    const next: Chapter[] = orderedIds
      .map((id, idx) => {
        const c = byId.get(id);
        return c ? { ...c, order: idx, updatedAt: now } : null;
      })
      .filter((c): c is Chapter => !!c);
    set({ chapters: next });
  },

  setCurrentChapter: async (chapterId) => {
    await get().loadVersions(chapterId);
  },

  saveVersion: async (chapterId, content, prompt, kind = 'full') => {
    const id = uuid();
    const versions = get().currentChapterVersions;

    const nonPinned = versions.filter((v) => !v.isPinned);
    const pinned = versions.filter((v) => v.isPinned);
    if (nonPinned.length >= 3) {
      const oldest = nonPinned.sort((a, b) => a.createdAt - b.createdAt)[0];
      await db.versions.delete(oldest.id);
    }

    const newVersion: ChapterVersion = {
      id, chapterId, content, prompt,
      isPinned: false, label: '',
      kind,
      createdAt: Date.now(),
    };
    await db.versions.add(newVersion);
    const updated = [...pinned, ...nonPinned.filter(v => v.id !== (nonPinned.length >= 3 ? nonPinned.sort((a, b) => a.createdAt - b.createdAt)[0].id : '')), newVersion]
      .sort((a, b) => b.createdAt - a.createdAt);
    set({ currentChapterVersions: updated });
  },

  loadVersions: async (chapterId) => {
    const versions = await db.versions.where('chapterId').equals(chapterId).sortBy('createdAt');
    versions.reverse();
    set({ currentChapterVersions: versions });
  },

  pinVersion: async (versionId, pinned) => {
    await db.versions.update(versionId, { isPinned: pinned });
    const versions = get().currentChapterVersions.map((v) =>
      v.id === versionId ? { ...v, isPinned: pinned } : v
    );
    set({ currentChapterVersions: versions });
  },

  deleteVersion: async (versionId) => {
    await db.versions.delete(versionId);
    set({ currentChapterVersions: get().currentChapterVersions.filter((v) => v.id !== versionId) });
  },

  loadCharacters: async (projectId) => {
    const characters = await db.characters.where('projectId').equals(projectId).toArray();
    set({ characters });
  },

  createCharacter: async (projectId, data) => {
    const id = uuid();
    const character: Character = { id, projectId, ...data, createdAt: Date.now() };
    await db.characters.add(character);
    set({ characters: [...get().characters, character] });
    return id;
  },

  updateCharacter: async (id, data) => {
    await db.characters.update(id, data);
    const characters = get().characters.map((c) =>
      c.id === id ? { ...c, ...data } : c
    );
    set({ characters });
  },

  deleteCharacter: async (id) => {
    await db.characters.delete(id);
    set({ characters: get().characters.filter((c) => c.id !== id) });
  },
}));
