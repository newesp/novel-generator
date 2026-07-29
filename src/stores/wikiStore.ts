import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { storage } from '../lib/storage';
import type { WikiPage, WikiPageType, WikiLogEntry } from '../types';
import { renameWikiSlugInPages } from '../lib/wiki-slug-rename';
import { deleteWikiPageCascade, updateWikiPageWithIntegrity } from '../lib/wiki-mutations';
import type { WritingLanguage } from '../lib/language-policy';
import { buildBlankWikiPageContent } from '../lib/wiki-list';

interface WikiState {
  pages: WikiPage[];
  log: WikiLogEntry[];
  selectedPageId: string | null;
  totalLength: number;

  loadForBook: (bookId: string) => Promise<void>;
  selectPage: (id: string | null) => void;
  createPageBlank: (
    bookId: string,
    type: WikiPageType,
    slug: string,
    title: string,
    writingLanguage?: WritingLanguage,
  ) => Promise<string>;
  savePage: (page: WikiPage) => Promise<void>;
  renamePageSlug: (id: string, newSlug: string) => Promise<void>;
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

  createPageBlank: async (bookId, type, slug, title, writingLanguage = 'zh-Hant') => {
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
      contentMd: buildBlankWikiPageContent(title, type, writingLanguage),
      createdAt: now,
      updatedAt: now,
    };
    await updateWikiPageWithIntegrity({
      page,
      source: 'manual:create',
      summary: `+${type}/${slug}`,
    });
    await get().loadForBook(bookId);
    return id;
  },

  savePage: async (page) => {
    const saved = await updateWikiPageWithIntegrity({
      page,
      source: 'manual:save',
      summary: `~${page.type}/${page.slug}`,
    });
    await get().loadForBook(saved.bookId);
  },

  renamePageSlug: async (id, newSlug) => {
    const selected = get().pages.find((p) => p.id === id) ?? await storage.wikiPages.get(id);
    if (!selected) throw new Error(`Wiki page not found: ${id}`);

    const pages = await storage.wikiPages.list(selected.bookId);
    const plan = renameWikiSlugInPages({ pages, pageId: id, newSlug });
    if (plan.changedPages.length === 0) {
      set({ selectedPageId: id });
      return;
    }

    const beforeById = new Map(pages.map((page) => [page.id, page]));
    const batchId = uuid();
    const appliedAt = Date.now();

    for (const afterPage of plan.changedPages) {
      const beforePage = beforeById.get(afterPage.id) ?? null;
      const isTarget = afterPage.id === id;
      const logEntry: WikiLogEntry = {
        id: uuid(),
        bookId: afterPage.bookId,
        batchId,
        appliedAt,
        kind: 'update',
        opStatus: 'ok',
        pageId: afterPage.id,
        pageType: afterPage.type,
        pageSlug: afterPage.slug,
        pageSnapshotBefore: beforePage,
        pageSnapshotAfter: afterPage,
        source: `slug-rename:${id}`,
        summary: isTarget
          ? `~${plan.oldRef.type}/${plan.oldRef.slug} -> ${plan.newRef.type}/${plan.newRef.slug}`
          : `~${afterPage.type}/${afterPage.slug} rewrite refs ${plan.oldRef.type}/${plan.oldRef.slug} -> ${plan.newRef.type}/${plan.newRef.slug}`,
      };
      await storage.wikiLog.add(logEntry);
      await storage.wikiPages.update(afterPage);
    }

    await get().loadForBook(plan.bookId);
    set({ selectedPageId: id });
  },

  deletePage: async (id) => {
    const page = get().pages.find((p) => p.id === id);
    if (!page) return;
    await deleteWikiPageCascade({ pageId: id, source: 'manual:delete' });
    await get().loadForBook(page.bookId);
  },
}));
