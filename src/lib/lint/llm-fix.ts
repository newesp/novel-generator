import { v4 as uuid } from 'uuid';
import { complete } from '../llm';
import { renderTemplate } from '../prompt-template';
import { storage } from '../storage';
import { updateWikiPageWithIntegrity } from '../wiki-mutations';
import type { WikiPage, WikiLogEntry, WikiPageSnapshot, WikiPageType } from '../../types';
import type { AIPromptPrefs } from '../../stores/settingsStore';
import type { LintIssue } from './types';
import type { InterfaceLocale, WritingLanguage } from '../language-policy';
import { lintText } from './messages';

export interface LlmFixSuggestion {
  /** LLM 產出的完整新 markdown */
  newMarkdown: string;
  /** 給 preview modal 用：原 markdown */
  originalMarkdown: string;
  /** 被修改的頁 id */
  targetPageId: string;
  targetLabel: string;
}

/** 對單一 issue 召喚 LLM 修改建議。失敗時拋例外。 */
export async function generateFixSuggestion(
  issue: LintIssue,
  pages: WikiPage[],
  aiPrompts: AIPromptPrefs,
  userDirection: string,
  preferredTargetPageId?: string,
  signal?: AbortSignal,
  writingLanguage: WritingLanguage = 'zh-Hant',
  interfaceLocale: InterfaceLocale = 'zh-TW',
): Promise<LlmFixSuggestion> {
  const wikiTargets = issue.targets.filter((t) => t.kind === 'wikiPage');
  const wikiTarget = wikiTargets.find((t) => t.id === preferredTargetPageId) ?? wikiTargets[0];
  if (!wikiTarget) throw new Error(lintText(
    interfaceLocale,
    'Issue 沒有 Wiki 頁面目標，無法產生修改建議',
    'The issue has no Wiki page target, so a fix suggestion cannot be generated',
  ));
  const page = pages.find((p) => p.id === wikiTarget.id);
  if (!page) throw new Error(lintText(
    interfaceLocale,
    `找不到對應 Wiki 頁面 id=${wikiTarget.id}`,
    `Matching Wiki page not found: id=${wikiTarget.id}`,
  ));

  const isEn = writingLanguage === 'en';
  const systemPrompt = isEn
    ? 'You are a professional novel knowledge graph editor. Fix the issue according to instructions and output the revised Markdown.'
    : '你是專業小說知識庫編輯，請依診斷問題與指示修復頁面並輸出完整的新 Markdown。';

  const defaultDirection = isEn
    ? '(Blank: analyze and resolve issue automatically)'
    : '(留白：請依 issue 內容自行判斷)';

  const promptBody = renderTemplate(aiPrompts.lintFixSuggestTemplate, {
    issueTitle: issue.title,
    issueDetail: issue.detail,
    originalMarkdown: page.contentMd,
    userDirection: userDirection || defaultDirection,
  });

  const prompt = `${systemPrompt}\n\n${promptBody}`;

  const raw = await complete(prompt, { maxTokens: 4096 }, signal);
  const newMarkdown = raw.trim().replace(/^```(?:markdown)?\s*/i, '').replace(/```\s*$/i, '');

  return {
    newMarkdown,
    originalMarkdown: page.contentMd,
    targetPageId: page.id,
    targetLabel: `${page.type}/${page.slug}`,
  };
}

/**
 * 套用 LLM fix：先寫 wiki_log 再 update page（補償模式，仿 wiki-ingest）。
 */
export async function applyLlmFix(args: {
  bookId: string;
  page: WikiPage;
  newMarkdown: string;
  checkId: string;
  lintBatchId: string;
}): Promise<{ status: 'ok' | 'failed'; error?: string }> {
  const { page, newMarkdown, checkId, lintBatchId } = args;
  try {
    await updateWikiPageWithIntegrity({
      page: { ...page, contentMd: newMarkdown },
      source: `lint:${checkId}`,
      summary: `~${page.type}/${page.slug} (lint:${checkId})`,
      batchId: lintBatchId,
    });
    return { status: 'ok' };
  } catch (e) {
    return { status: 'failed', error: (e as Error).message };
  }
}

/**
 * 套用 AutoFix(removeRelatedSlug)：移除一筆 relatedSlug，寫 wiki_log 補償。
 */
export async function applyRemoveRelatedSlug(args: {
  bookId: string;
  page: WikiPage;
  removeTarget: { type: WikiPageType; slug: string };
  lintBatchId: string;
  interfaceLocale?: InterfaceLocale;
}): Promise<{ status: 'ok' | 'failed'; error?: string }> {
  const { bookId, page, removeTarget, lintBatchId, interfaceLocale = 'zh-TW' } = args;
  const now = Date.now();
  const logId = uuid();

  const afterPage: WikiPage = {
    ...page,
    relatedSlugs: page.relatedSlugs.filter(
      (r) => !(r.type === removeTarget.type && r.slug === removeTarget.slug),
    ),
    contentMd: removeMarkdownLinksToTarget(page.contentMd, removeTarget),
    updatedAt: now,
  };

  const okLog: WikiLogEntry = {
    id: logId, bookId, batchId: lintBatchId, appliedAt: now,
    kind: 'update',
    opStatus: 'ok',
    pageId: page.id,
    pageType: page.type, pageSlug: page.slug,
    pageSnapshotBefore: page as WikiPageSnapshot,
    pageSnapshotAfter: afterPage as WikiPageSnapshot,
    source: `lint:broken-link`,
    summary: `~${page.type}/${page.slug} 移除 broken ref ${removeTarget.type}/${removeTarget.slug}`,
  };

  try {
    await storage.wikiLog.add(okLog);
  } catch (e) {
    return {
      status: 'failed',
      error: lintText(
        interfaceLocale,
        `wiki_log 寫入失敗：${(e as Error).message}`,
        `Failed to insert wiki_log entry: ${(e as Error).message}`,
      ),
    };
  }

  try {
    await storage.wikiPages.update(afterPage);
    return { status: 'ok' };
  } catch (e) {
    await storage.wikiLog.updateStatus(okLog.id, 'failed', (e as Error).message);
    return { status: 'failed', error: (e as Error).message };
  }
}

function removeMarkdownLinksToTarget(
  markdown: string,
  target: { type: WikiPageType; slug: string },
): string {
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  const cleaned = markdown.replace(linkRe, (full, _label: string, href: string) => {
    return hrefTargetsPage(href, target) ? '' : full;
  });
  return cleaned
    .replace(/[ \t]*,[ \t]*,[ \t]*/g, ', ')
    .replace(/([（(>]\s*)[,，]\s*/g, '$1')
    .replace(/[ \t]*[,，][ \t]*(\r?\n|$)/g, '$1')
    .replace(/[ \t]{2,}/g, ' ');
}

function hrefTargetsPage(href: string, target: { type: WikiPageType; slug: string }): boolean {
  const normalized = href
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^\.\.\//, '')
    .replace(/[#?].*$/, '')
    .toLowerCase();
  return normalized === `${target.type}/${target.slug}`.toLowerCase();
}
