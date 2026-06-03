import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { storage } from '../lib/storage';
import type { Project, Chapter, ChapterVersion, Character } from '../types';
import { recomputeChapterSyncStatus } from '../lib/wiki-ingest';
import { deleteWikiPageCascade } from '../lib/wiki-mutations';
import { summarySlugForChapter } from '../lib/wiki-summary-quality';

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
    const books = await storage.projects.listAllByUpdatedDesc();
    set({ books });
  },

  loadProject: async (id) => {
    const project = await storage.projects.get(id);
    set({ project: project || null });
  },

  createProject: async (data) => {
    const id = uuid();
    const now = Date.now();
    const project: Project = { id, ...data, createdAt: now, updatedAt: now };
    await storage.projects.add(project);
    set({ project, chapters: [], characters: [], currentChapterVersions: [] });
    // refresh books list
    const books = await storage.projects.listAllByUpdatedDesc();
    set({ books });
    return id;
  },

  updateProject: async (id, data) => {
    await storage.projects.update(id, { ...data, updatedAt: Date.now() });
    const project = await storage.projects.get(id);
    set({ project: project || null });
    // refresh books list
    const books = await storage.projects.listAllByUpdatedDesc();
    set({ books });
  },

  deleteProject: async (id) => {
    // Delete all related data
    const chaptersOfProject = await storage.chapters.listByProject(id, { sorted: false });
    const chapterIds = chaptersOfProject.map((c) => c.id);
    await storage.versions.deleteByChapters(chapterIds);
    await storage.chapters.deleteByProject(id);
    await storage.characters.deleteByProject(id);
    await storage.wikiPages.deleteByBook(id);
    await storage.wikiLog.deleteByBook(id);
    const comicsOfProject = (await storage.comics.listAll()).filter((comic) => comic.projectId === id);
    for (const comic of comicsOfProject) {
      await storage.comicPanels.deleteByComic(comic.id);
    }
    await storage.comics.deleteByProject(id);
    await storage.mediaAssets.deleteByProject(id);
    await storage.sceneVisuals.deleteByProject(id);
    await storage.projects.delete(id);

    // Update state
    const books = get().books.filter((b) => b.id !== id);
    set({ books });
    if (get().project?.id === id) {
      set({ project: null, chapters: [], characters: [], currentChapterVersions: [] });
    }
  },

  loadChapters: async (projectId) => {
    const chapters = await storage.chapters.listByProject(projectId);
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
      content: '', referenceChapterId: null,
      wikiSyncedAt: null, wikiSyncedHash: null, wikiSyncStatus: 'unsynced',
      createdAt: now, updatedAt: now,
    };
    await storage.chapters.add(chapter);
    set({ chapters: [...chapters, chapter] });
    return id;
  },

  updateChapter: async (id, data) => {
    const now = Date.now();
    const before = get().chapters.find((c) => c.id === id);
    let patch: Partial<Chapter> = { ...data, updatedAt: now };

    if (before && data.content !== undefined && data.content !== before.content) {
      const candidate: Chapter = { ...before, ...data, updatedAt: now };
      const newStatus = await recomputeChapterSyncStatus(candidate);
      if (newStatus !== before.wikiSyncStatus) patch = { ...patch, wikiSyncStatus: newStatus };
    }

    await storage.chapters.update(id, patch);
    const chapters = get().chapters.map((c) => c.id === id ? { ...c, ...patch } : c);
    set({ chapters });
  },

  deleteChapter: async (id) => {
    const chapter = get().chapters.find((c) => c.id === id);
    if (chapter) {
      const summaryPage = await storage.wikiPages.findBySlug(
        chapter.projectId,
        'summary',
        summarySlugForChapter(chapter),
      );
      if (summaryPage) {
        await deleteWikiPageCascade({ pageId: summaryPage.id, source: `chapter-delete:${id}` });
      }
    }
    await storage.chapters.delete(id);
    await storage.versions.deleteByChapter(id);
    set({ chapters: get().chapters.filter((c) => c.id !== id) });
  },

  reorderChapters: async (orderedIds) => {
    const now = Date.now();
    const byId = new Map(get().chapters.map((c) => [c.id, c]));
    // 寫入 DB（批次但仍逐筆，Dexie tx 開銷小）
    await Promise.all(
      orderedIds.map((id, idx) => storage.chapters.update(id, { order: idx, updatedAt: now })),
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

  loadVersions: async (chapterId) => {
    const versions = await storage.versions.listByChapterDesc(chapterId);
    set({ currentChapterVersions: versions });
  },

  pinVersion: async (versionId, pinned) => {
    await storage.versions.update(versionId, { isPinned: pinned });
    const versions = get().currentChapterVersions.map((v) =>
      v.id === versionId ? { ...v, isPinned: pinned } : v
    );
    set({ currentChapterVersions: versions });
  },

  deleteVersion: async (versionId) => {
    await storage.versions.delete(versionId);
    set({ currentChapterVersions: get().currentChapterVersions.filter((v) => v.id !== versionId) });
  },

  loadCharacters: async (projectId) => {
    const characters = await storage.characters.listByProject(projectId);
    set({ characters });
  },

  createCharacter: async (projectId, data) => {
    const id = uuid();
    const character: Character = { id, projectId, ...data, createdAt: Date.now() };
    await storage.characters.add(character);
    set({ characters: [...get().characters, character] });
    return id;
  },

  updateCharacter: async (id, data) => {
    await storage.characters.update(id, data);
    const characters = get().characters.map((c) =>
      c.id === id ? { ...c, ...data } : c
    );
    set({ characters });
  },

  deleteCharacter: async (id) => {
    await storage.characters.delete(id);
    set({ characters: get().characters.filter((c) => c.id !== id) });
  },
}));
