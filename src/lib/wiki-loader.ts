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
import { getSummaryChapterNumber } from './wiki-list';

const TYPE_WEIGHT: Record<WikiPage['type'], number> = {
  entity: 5,
  concept: 4,
  synthesis: 3,
  summary: 2,
  compare: 1,
};

export type WikiLoadStatus = 'ok' | 'warn-truncated' | 'red-truncated';
export type WikiSelectionMode = 'auto' | 'relevance' | 'pick-pages';

export interface WikiLoaderInput {
  bookId: string;
  contextWindowTokens: number;
  budgetRatio?: number;
  chapterContext?: ChapterContext;
  selectionMode?: WikiSelectionMode;
}

export interface WikiLoadResult {
  pages: WikiPage[];
  loadedPages: number;
  totalPages: number;
  truncatedPages: number;
  status: WikiLoadStatus;
  relevanceHits: number;
  selectionModeUsed?: WikiSelectionMode;
}

export interface WikiSelectionInput {
  pages: WikiPage[];
  budgetChars: number;
  chapterContext?: ChapterContext;
  mode?: WikiSelectionMode;
}

export interface WikiSelectionResult {
  pages: WikiPage[];
  status: WikiLoadStatus;
  relevanceHits: number;
  omittedPages: number;
  selectionModeUsed: WikiSelectionMode;
}

export async function loadWikiForGeneration(input: WikiLoaderInput): Promise<WikiLoadResult> {
  const ratio = input.budgetRatio ?? 0.25;
  const budgetChars = Math.floor(input.contextWindowTokens * ratio * estimateCharsPerToken());

  const all = await storage.wikiPages.list(input.bookId);
  if (all.length === 0) {
    return { pages: [], loadedPages: 0, totalPages: 0, truncatedPages: 0, status: 'ok', relevanceHits: 0 };
  }

  const selected = selectWikiPagesForPrompt({
    pages: all,
    budgetChars,
    chapterContext: input.chapterContext,
    mode: input.selectionMode ?? 'auto',
  });

  return {
    pages: selected.pages,
    loadedPages: selected.pages.length,
    totalPages: all.length,
    truncatedPages: selected.omittedPages,
    status: selected.status,
    relevanceHits: selected.relevanceHits,
    selectionModeUsed: selected.selectionModeUsed,
  };
}

export function selectWikiPagesForPrompt(input: WikiSelectionInput): WikiSelectionResult {
  const all = input.pages;
  if (all.length === 0) {
    return { pages: [], status: 'ok', relevanceHits: 0, omittedPages: 0, selectionModeUsed: input.mode ?? 'auto' };
  }

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

  const totalChars = all.reduce((sum, p) => sum + p.contentMd.length, 0);
  let status: WikiLoadStatus = 'ok';
  if (totalChars > input.budgetChars * 1.5) status = 'red-truncated';
  else if (totalChars > input.budgetChars) status = 'warn-truncated';

  const requestedMode = input.mode ?? 'auto';
  const selectionModeUsed: WikiSelectionMode =
    requestedMode === 'auto'
      ? (status === 'ok' ? 'relevance' : 'pick-pages')
      : requestedMode;

  let loaded: WikiPage[] = [];
  if (status === 'ok') {
    loaded = withPriority.map((p) => p.page);
  } else if (selectionModeUsed === 'pick-pages') {
    loaded = pickPagesForLargeWiki(withPriority, input.budgetChars);
  } else {
    let used = 0;
    for (const { page } of withPriority) {
      const cost = page.contentMd.length;
      if (used + cost > input.budgetChars) continue;
      loaded.push(page);
      used += cost;
    }
  }

  return {
    pages: loaded,
    status,
    relevanceHits,
    omittedPages: all.length - loaded.length,
    selectionModeUsed,
  };
}

function pickPagesForLargeWiki(
  withPriority: Array<{ page: WikiPage; priority: number }>,
  budgetChars: number,
): WikiPage[] {
  const selected: WikiPage[] = [];
  let used = 0;
  const add = (page: WikiPage): void => {
    if (selected.some((item) => item.id === page.id)) return;
    const cost = page.contentMd.length;
    if (used + cost > budgetChars) return;
    selected.push(page);
    used += cost;
  };

  const relevant = withPriority
    .filter((item) => item.priority >= (TYPE_WEIGHT[item.page.type] ?? 0) * 10 + 1)
    .sort((a, b) => b.priority - a.priority);
  for (const { page } of relevant) add(page);

  const recentSummaries = withPriority
    .filter((item) => item.page.type === 'summary' && getSummaryChapterNumber(item.page) !== null)
    .sort((a, b) => (getSummaryChapterNumber(b.page) ?? 0) - (getSummaryChapterNumber(a.page) ?? 0));
  for (const { page } of recentSummaries) add(page);

  if (selected.length === 0) {
    for (const { page } of withPriority) add(page);
  }

  return selected.sort((a, b) => {
    const typeOrder = TYPE_WEIGHT[b.type] - TYPE_WEIGHT[a.type];
    if (typeOrder !== 0) return typeOrder;
    return a.slug.localeCompare(b.slug);
  });
}
