import { v4 as uuid } from 'uuid';
import type { Chapter, Character, WikiLogEntry, WikiPage } from '../types';
import { complete } from './llm';
import { storage } from './storage';
import { summarySlugForChapter } from './wiki-summary-quality';

export interface RebuildSummaryResult {
  page: WikiPage;
  logEntry: WikiLogEntry;
  action: 'create' | 'update';
}

export function buildSummaryRebuildPrompt(input: {
  chapter: Chapter;
  charactersList: string;
}): string {
  const slug = summarySlugForChapter(input.chapter);
  return [
    'You are updating a novel Wiki summary page.',
    `Target page: summary/${slug}`,
    `Chapter title: ${input.chapter.title}`,
    `Chapter beat: ${input.chapter.beat || '(none)'}`,
    `Chapter points: ${input.chapter.points || '(none)'}`,
    `Characters: ${input.charactersList || '(none)'}`,
    '',
    'Write concise Traditional Chinese Markdown for the Wiki summary page.',
    'Requirements:',
    '- Keep the title exactly as the chapter title.',
    '- Capture key events, character state changes, unresolved hooks, and continuity notes.',
    '- Do not invent facts not present in the chapter.',
    '- Output only Markdown content for the Wiki summary page.',
    '',
    'Chapter content:',
    input.chapter.content,
  ].join('\n');
}

export async function rebuildChapterSummary(input: {
  chapter: Chapter;
  characters: Character[];
}): Promise<RebuildSummaryResult> {
  const slug = summarySlugForChapter(input.chapter);
  const now = Date.now();
  const before = await storage.wikiPages.findBySlug(input.chapter.projectId, 'summary', slug);
  const charactersList = input.characters.map((character) => character.name).filter(Boolean).join(', ');
  const prompt = buildSummaryRebuildPrompt({ chapter: input.chapter, charactersList });
  const contentMd = await complete(prompt, { maxTokens: 1600, temperature: 0.3 });
  const action: 'create' | 'update' = before ? 'update' : 'create';
  const page: WikiPage = before
    ? {
        ...before,
        title: input.chapter.title,
        description: `第 ${input.chapter.order + 1} 章摘要`,
        contentMd,
        updatedAt: now,
      }
    : {
        id: uuid(),
        bookId: input.chapter.projectId,
        type: 'summary',
        slug,
        title: input.chapter.title,
        aliases: [],
        relatedSlugs: [],
        description: `第 ${input.chapter.order + 1} 章摘要`,
        contentMd,
        createdAt: now,
        updatedAt: now,
      };

  if (before) await storage.wikiPages.update(page);
  else await storage.wikiPages.add(page);

  const logEntry: WikiLogEntry = {
    id: uuid(),
    bookId: input.chapter.projectId,
    batchId: uuid(),
    appliedAt: now,
    kind: action,
    opStatus: 'ok',
    pageId: page.id,
    pageType: 'summary',
    pageSlug: slug,
    pageSnapshotBefore: before ?? null,
    pageSnapshotAfter: page,
    source: `summary-rebuild:${input.chapter.id}`,
    summary: `${action === 'create' ? '+' : '~'}summary/${slug}`,
  };
  await storage.wikiLog.add(logEntry);
  return { page, logEntry, action };
}
