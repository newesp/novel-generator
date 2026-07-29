import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateFixSuggestion } from './llm-fix';
import { complete } from '../llm';
import type { LintIssue } from './types';
import type { WikiPage } from '../../types';

vi.mock('../llm', () => ({
  complete: vi.fn(),
}));

const mockIssue: LintIssue = {
  id: 'issue-1',
  checkId: 'broken-link',
  title: 'Broken link to entity/unknown',
  detail: 'Wiki page contains broken link to non-existent entity/unknown',
  severity: 'warn',
  status: 'open',
  targets: [{ kind: 'wikiPage', id: 'page-1', label: 'concept/magic' }],
};

const mockPages: WikiPage[] = [
  {
    id: 'page-1',
    bookId: 'b-1',
    type: 'concept',
    slug: 'magic',
    title: 'Magic System',
    description: 'System of magic',
    aliases: [],
    relatedSlugs: [],
    contentMd: '# Magic System\nSee [unknown](entity/unknown).',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const mockAiPrompts = {
  lintFixSuggestTemplate: 'Issue: {{issueTitle}}\nDetail: {{issueDetail}}\nOriginal: {{originalMarkdown}}\nDirection: {{userDirection}}',
} as any;

describe('Lint Fix LLM Language Boundary (Ticket #25)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepends Traditional Chinese System Prompt for zh-Hant books', async () => {
    vi.mocked(complete).mockResolvedValue('# Magic System\nFixed content.');

    await generateFixSuggestion(
      mockIssue,
      mockPages,
      mockAiPrompts,
      '',
      'page-1',
      undefined,
      'zh-Hant',
    );

    const callPrompt = vi.mocked(complete).mock.calls[0][0];
    expect(callPrompt).toContain('你是專業小說知識庫編輯，請依診斷問題與指示修復頁面');
    expect(callPrompt).toContain('(留白：請依 issue 內容自行判斷)');
  });

  it('prepends English System Prompt for English books (writingLanguage: en)', async () => {
    vi.mocked(complete).mockResolvedValue('# Magic System\nFixed English content.');

    await generateFixSuggestion(
      mockIssue,
      mockPages,
      mockAiPrompts,
      '',
      'page-1',
      undefined,
      'en',
    );

    const callPrompt = vi.mocked(complete).mock.calls[0][0];
    expect(callPrompt).toContain('You are a professional novel knowledge graph editor');
    expect(callPrompt).toContain('(Blank: analyze and resolve issue automatically)');
  });
});
