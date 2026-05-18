import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { storage } from '../lib/storage';
import type { WikiPage, WikiPageType, WikiLogEntry } from '../types';

interface WikiState {
  pages: WikiPage[];
  log: WikiLogEntry[];
  selectedPageId: string | null;
  totalLength: number;

  loadForBook: (bookId: string) => Promise<void>;
  selectPage: (id: string | null) => void;
  createPageBlank: (bookId: string, type: WikiPageType, slug: string, title: string) => Promise<string>;
  savePage: (page: WikiPage) => Promise<void>;
  deletePage: (id: string) => Promise<void>;
}

export const useWikiStore = create<WikiState>((set, get) => ({
  pages: [],
  log: [],
  selectedPageId: null,
  totalLength: 0,

  loadForBook: async (bookId) => {
    const [pages, log, totalLength] = await Promise.all([
      storage.wikiPages.list(bookId),
      storage.wikiLog.list(bookId, 50),
      storage.wikiPages.totalLength(bookId),
    ]);
    set({ pages, log, totalLength });
  },

  selectPage: (id) => set({ selectedPageId: id }),

  createPageBlank: async (bookId, type, slug, title) => {
    const now = Date.now();
    const id = uuid();
    const page: WikiPage = {
      id,
      bookId,
      type,
      slug,
      title,
      aliases: [],
      relatedSlugs: [],
      description: '',
      contentMd: `# ${title}\n\n> **Type:** ${type}\n\n## 概述\n\n`,
      createdAt: now,
      updatedAt: now,
    };
    await storage.wikiPages.add(page);
    await get().loadForBook(bookId);
    return id;
  },

  savePage: async (page) => {
    await storage.wikiPages.update({ ...page, updatedAt: Date.now() });
    await get().loadForBook(page.bookId);
  },

  deletePage: async (id) => {
    const page = get().pages.find((p) => p.id === id);
    if (!page) return;
    await storage.wikiPages.delete(id);
    await get().loadForBook(page.bookId);
  },
}));
