import type { Chapter, Character, WikiPage, WikiPageType } from '../../types';
import type { AIPromptPrefs } from '../../stores/settingsStore';

export type LintCheckKind = 'structural' | 'hybrid' | 'llm';

export interface IssueTarget {
  kind: 'wikiPage' | 'chapter';
  id: string;
  /** 顯示用標籤，例如 "entity/wang-da" 或 "ch-3 王大入山" */
  label: string;
  /** 章節用：含關鍵詞前後 40 字節錄 */
  sourceExcerpt?: string;
}

export type AutoFix = {
  kind: 'removeRelatedSlug';
  pageId: string;
  target: { type: WikiPageType; slug: string };
} | {
  kind: 'renameWikiSlug';
  pageId: string;
  newSlug: string;
};

export interface LlmFixHint {
  kind: 'llm';
}

export type IssueStatus = 'open' | 'dismissed' | 'applied';

export interface LintIssue {
  id: string;
  checkId: string;
  severity: 'error' | 'warn' | 'info';
  status: IssueStatus;
  title: string;
  detail: string;
  targets: IssueTarget[];
  fix?: AutoFix | LlmFixHint;
  /** LLM 類修改建議的原始 markdown（套用前留存供 diff） */
  fixOriginalMarkdown?: string;
}

export interface LintReport {
  bookId: string;
  ranAt: number;
  /** 共用 batch_id，所有 lint fix 的 wiki_log 條目共用，便於日後 undo 整批 */
  lintBatchId: string;
  issues: LintIssue[];
  failedChecks: Array<{ checkId: string; error: string }>;
  unprocessed: Array<{ checkId: string; reason: string }>;
  cancelled: boolean;
}

export interface LintPrefs {
  checks: {
    brokenLink: boolean;
    orphan: boolean;
    aliasDup: boolean;
    summaryMismatch: boolean;
    unrecorded: boolean;
    wikiContradict: boolean;
    wikiVsChapter: boolean;
  };
  maxPagesPerTypeContradict: number;
  maxCharactersVsChapter: number;
  maxChapterExcerptsPerChar: number;
  maxUnrecordedCandidates: number;
}

export const DEFAULT_LINT_PREFS: LintPrefs = {
  checks: {
    brokenLink: true,
    orphan: true,
    aliasDup: true,
    summaryMismatch: true,
    unrecorded: true,
    wikiContradict: true,
    wikiVsChapter: true,
  },
  maxPagesPerTypeContradict: 20,
  maxCharactersVsChapter: 10,
  maxChapterExcerptsPerChar: 3,
  maxUnrecordedCandidates: 30,
};

export interface LintContext {
  bookId: string;
  pages: WikiPage[];
  characters: Character[];
  chapters: Chapter[];
  prefs: LintPrefs;
  aiPrompts: AIPromptPrefs;
  lintBatchId: string;
  signal?: AbortSignal;
}

export interface LintCheck {
  id: string;
  label: string;
  kind: LintCheckKind;
  run(ctx: LintContext): Promise<{
    issues: LintIssue[];
    unprocessed?: Array<{ reason: string }>;
  }>;
}

export interface WikiLintDigest {
  pageId: string;
  type: WikiPageType;
  slug: string;
  title: string;
  aliases: string[];
  description: string;
  /** 含「年齡 / 武器 / 能力 / 限制 / 代價 ...」等關鍵詞的 bullet / 句 */
  facts: string[];
  /** 含「父親 / 師父 / → / 屬於 ...」等關係的句 */
  relations: string[];
  /** 含「第 N 章 / 之前 / 之後 / 最終 ...」等時間線的句 */
  timeline: string[];
  /** 含「不明 / 未知 / 之謎 / 是否 / 伏筆 ...」等未解的句 */
  openQuestions: string[];
}
