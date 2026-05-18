/**
 * 為章節生成載入 Wiki 內容
 *
 * 規範：spec §5.2 §5.3
 *
 * 三段式：
 *   Step 1: cheap relevance filter（wiki-relevance.ts）
 *   Step 2: 結合優先級權重（type weight + recency）
 *   Step 3: 預算截斷（綠/黃/紅）
 */
import type { WikiPage } from '../types';
import { storage } from './storage';
import { buildNeedles, scorePages, type ChapterContext } from './wiki-relevance';
import { estimateCharsPerToken } from './tokens';

const TYPE_WEIGHT: Record<WikiPage['type'], number> = {
  entity: 5,
  concept: 4,
  synthesis: 3,
  summary: 2,
  compare: 1,
};

export type WikiLoadStatus = 'ok' | 'warn-truncated' | 'red-truncated';

export interface WikiLoaderInput {
  bookId: string;
  contextWindowTokens: number;
  budgetRatio?: number;
  chapterContext?: ChapterContext;
}

export interface WikiLoadResult {
  pages: WikiPage[];
  loadedPages: number;
  totalPages: number;
  truncatedPages: number;
  status: WikiLoadStatus;
  relevanceHits: number;
}

export async function loadWikiForGeneration(input: WikiLoaderInput): Promise<WikiLoadResult> {
  const ratio = input.budgetRatio ?? 0.25;
  const budgetChars = Math.floor(input.contextWindowTokens * ratio * estimateCharsPerToken());

  const all = await storage.wikiPages.list(input.bookId);
  if (all.length === 0) {
    return { pages: [], loadedPages: 0, totalPages: 0, truncatedPages: 0, status: 'ok', relevanceHits: 0 };
  }

  // Step 1: relevance
  const needles = input.chapterContext ? buildNeedles(input.chapterContext) : new Set<string>();
  const scored = scorePages(all, needles);
  const relevanceHits = scored.filter((s) => s.score > 0).length;

  // Step 2: priority
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const withPriority = scored.map((s) => {
    const days = Math.max(0, (now - s.page.updatedAt) / day);
    const recency = 1 / (days + 1);
    const typeWeight = TYPE_WEIGHT[s.page.type] ?? 0;
    const priority =
      (relevanceHits > 0 ? s.score * 100 : 0)
      + typeWeight * 10
      + recency;
    return { page: s.page, priority };
  });
  withPriority.sort((a, b) => b.priority - a.priority);

  // Step 3: truncation
  const totalChars = all.reduce((sum, p) => sum + p.contentMd.length, 0);
  let status: WikiLoadStatus = 'ok';
  if (totalChars > budgetChars * 1.5) status = 'red-truncated';
  else if (totalChars > budgetChars) status = 'warn-truncated';

  let loaded: WikiPage[] = [];
  if (status === 'ok') {
    loaded = withPriority.map((p) => p.page);
  } else {
    let used = 0;
    for (const { page } of withPriority) {
      const cost = page.contentMd.length;
      if (used + cost > budgetChars) continue;
      loaded.push(page);
      used += cost;
    }
  }

  return {
    pages: loaded,
    loadedPages: loaded.length,
    totalPages: all.length,
    truncatedPages: all.length - loaded.length,
    status,
    relevanceHits,
  };
}
