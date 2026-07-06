import { v4 as uuid } from 'uuid';
import { complete } from '../../llm';
import { renderTemplate } from '../../prompt-template';
import type { Chapter, Character, WikiPage } from '../../../types';
import type { LintCheck, LintContext, LintIssue, IssueTarget } from '../types';

/**
 * 未登錄角色 — hybrid check
 *
 * 演算法（v2，2026-05-19 修補）：
 *   先找 context marker（對話標籤 / 稱呼前綴 / 敬稱後綴），再從 marker
 *   位置抽出緊鄰的 2-3 字當 candidate name。
 *
 *   舊版用「2-4 字滑動窗 + post-hoc inContext check」，會被 `叫做林七的弟子` 這種
 *   片段誤判（4 字窗 `林七的弟` 撞到 prefix `叫做` 就過），把真的 `林七`
 *   被 overlap dedup 蓋掉。
 *
 *   新版只在三種錨點抓 name，幾乎不會抓到通用名詞與文法碎片。
 */

/** 黑名單：候選不會是這些 */
const STOPWORDS = new Set<string>([
  '突然', '這時', '此時', '當下', '眼前', '不能', '不行', '不要', '可以',
  '可能', '應該', '已經', '依然', '仍然', '繼續', '主人', '師父', '主公',
  '師兄', '師姐', '師妹', '師弟', '長老', '弟子', '前輩', '晚輩',
  '一個', '兩個', '三個', '幾個', '所有', '其中', '其他', '所謂',
  '一陣', '一聲', '一道', '一片', '那一', '這一',
]);

/** 文法字元黑名單：候選名稱不能以這些字開頭或結尾 */
const GRAMMAR_BOUNDARY_CHARS = new Set<string>([
  '的', '了', '在', '是', '和', '與', '也', '有', '就', '或', '還', '又',
  '這', '那', '個', '中', '上', '下', '出', '到', '來', '去', '把', '被',
  '從', '向', '對', '為', '以', '及', '之', '其', '所', '而', '但', '已',
  '不', '都', '很', '太', '更', '最', '會', '能', '要', '想', '可', '一',
  '著', '過', '們', '然', '做',
]);

function hasGrammarBoundary(name: string): boolean {
  if (name.length === 0) return true;
  return GRAMMAR_BOUNDARY_CHARS.has(name[0]) || GRAMMAR_BOUNDARY_CHARS.has(name[name.length - 1]);
}

export interface UnrecordedCandidate {
  name: string;
  occurrences: Array<{ chapterId: string; excerpt: string }>;
  freq: number;
}

interface MatchHit {
  chapterId: string;
  index: number;          // 章節內 name 起始位置
}

const CHINESE = '[\\u4e00-\\u9fff]';

/**
 * Anchor patterns — 每個 pattern 配一個「name capture group index」說明哪個
 * group 是真正的人名。
 *
 * 整體策略：
 *   - 對話標籤：「...」+ name(2-3 字) + 動詞
 *   - 動作賓語：name(2-3 字) + 動詞 + 道|說（少用，太鬆）
 *   - 稱呼前綴：叫做|名為|這位 + name(2-3 字)
 *   - 敬稱後綴：name(2-3 字) + 師兄|師姐|大人|姑娘|公子|長老|...
 *
 * 全部要求 name 長度 2-3 字（人名常見長度），4 字單字名極少在現代小說。
 */
const ANCHOR_PATTERNS: Array<{ regex: RegExp; nameGroup: number }> = [
  // 「對話」name + 動詞
  { regex: new RegExp(`」(${CHINESE}{2,3})(?:說|問|答|道|喊|叫|吼|笑|哭|怒|呼|罵|喃|嘆|嚷|嘶|嗤|啐|唸)`, 'g'), nameGroup: 1 },
  // 稱呼前綴
  { regex: new RegExp(`(?:叫做|名為|這位|名叫)(${CHINESE}{2,3})`, 'g'), nameGroup: 1 },
  // 敬稱後綴
  { regex: new RegExp(`(${CHINESE}{2,3})(?:師兄|師姐|師妹|師弟|師父|師娘|姑娘|公子|長老|大人|先生|夫人|前輩|宗主|掌門|城主|教主)`, 'g'), nameGroup: 1 },
];

export function findCandidates(
  chapters: Chapter[],
  pages: WikiPage[],
  characters: Character[],
): UnrecordedCandidate[] {
  // 已知名稱集合
  const known = new Set<string>();
  for (const c of characters) {
    if (c.name) known.add(c.name);
  }
  for (const p of pages) {
    if (p.type !== 'entity') continue;
    if (p.title) known.add(p.title);
    for (const a of p.aliases) known.add(a);
  }

  // name → hits
  const hitsByName = new Map<string, MatchHit[]>();

  for (const chapter of chapters) {
    const content = chapter.content;

    for (const { regex, nameGroup } of ANCHOR_PATTERNS) {
      // 每個 chapter 跑 pattern，重置 lastIndex
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(content)) !== null) {
        const name = m[nameGroup];
        if (!name) continue;
        if (name.length < 2) continue;
        if (STOPWORDS.has(name)) continue;
        if (hasGrammarBoundary(name)) continue;
        if (known.has(name)) continue;
        // 額外排除：是更長已知名稱的子字串
        let isSubstringOfKnown = false;
        for (const k of known) {
          if (k.length > name.length && k.includes(name)) { isSubstringOfKnown = true; break; }
        }
        if (isSubstringOfKnown) continue;

        // 計算 name 在 content 內的實際 index
        const nameIndex = m.index + m[0].indexOf(name);

        const list = hitsByName.get(name) ?? [];
        list.push({ chapterId: chapter.id, index: nameIndex });
        hitsByName.set(name, list);
      }
    }
  }

  // 收 occurrences（每章只取一個 excerpt，最多 2 章）
  const candidates: UnrecordedCandidate[] = [];
  for (const [name, hits] of hitsByName.entries()) {
    const seenChapters = new Set<string>();
    const occurrences: UnrecordedCandidate['occurrences'] = [];
    for (const hit of hits) {
      if (seenChapters.has(hit.chapterId)) continue;
      seenChapters.add(hit.chapterId);
      const chapter = chapters.find((c) => c.id === hit.chapterId)!;
      const start = Math.max(0, hit.index - 40);
      const end = Math.min(chapter.content.length, hit.index + name.length + 40);
      occurrences.push({ chapterId: chapter.id, excerpt: chapter.content.slice(start, end) });
      if (occurrences.length >= 2) break;
    }
    candidates.push({ name, occurrences, freq: hits.length });
  }

  // 排字頻降冪
  candidates.sort((a, b) => b.freq - a.freq);
  return candidates;
}

interface LlmVerifyResult {
  newCharacters: Array<{ name: string; isMainEnough: boolean; chapterRefs: string[] }>;
  rejected: string[];
}

function parseVerifyJson(raw: string): LlmVerifyResult {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('LLM 回應不含 JSON');
  const json = JSON.parse(s.slice(start, end + 1));
  return {
    newCharacters: Array.isArray(json.newCharacters) ? json.newCharacters : [],
    rejected: Array.isArray(json.rejected) ? json.rejected : [],
  };
}

export const unrecordedCheck: LintCheck = {
  id: 'unrecorded',
  label: '未登錄角色',
  kind: 'hybrid',
  async run(ctx: LintContext) {
    const allCandidates = findCandidates(ctx.chapters, ctx.pages, ctx.characters);
    const cap = ctx.prefs.maxUnrecordedCandidates;
    const candidates = allCandidates.slice(0, cap);
    const unprocessed = allCandidates.length > cap
      ? [{ reason: `候選 ${allCandidates.length} 個，超出上限 ${cap}，未送 LLM 驗證的：${allCandidates.slice(cap).map((c) => c.name).join('、')}` }]
      : [];

    if (candidates.length === 0) return { issues: [], unprocessed };

    const knownNames = [
      ...ctx.characters.map((c) => c.name),
      ...ctx.pages.filter((p) => p.type === 'entity').map((p) => p.title),
    ].filter(Boolean);

    const prompt = renderTemplate(ctx.aiPrompts.lintUnrecordedVerifyTemplate, {
      knownNamesList: knownNames.join('、') || '(無)',
      candidatesJson: JSON.stringify(candidates, null, 2),
    });

    let raw: string;
    try {
      raw = await complete(prompt, { maxTokens: 2048 }, ctx.signal);
    } catch (e) {
      throw new Error(`未登錄角色 LLM verify 失敗：${(e as Error).message}`, { cause: e });
    }

    let parsed: LlmVerifyResult;
    try {
      parsed = parseVerifyJson(raw);
    } catch {
      // 重試 1 次
      raw = await complete(prompt + '\n\n（重要：請只輸出嚴格 JSON）', { maxTokens: 2048 }, ctx.signal);
      parsed = parseVerifyJson(raw);
    }

    const issues: LintIssue[] = [];
    for (const nc of parsed.newCharacters) {
      const cand = candidates.find((c) => c.name === nc.name);
      if (!cand) continue;
      const targets: IssueTarget[] = cand.occurrences.map((o) => ({
        kind: 'chapter' as const,
        id: o.chapterId,
        label: `章節 ${ctx.chapters.find((c) => c.id === o.chapterId)?.title ?? o.chapterId.slice(0, 6)}`,
        sourceExcerpt: o.excerpt,
      }));
      issues.push({
        id: uuid(),
        checkId: 'unrecorded',
        severity: 'warn',
        status: 'open',
        title: `未登錄角色「${nc.name}」${nc.isMainEnough ? '（建議加入）' : '（次要）'}`,
        detail: `候選名稱「${nc.name}」出現 ${cand.freq} 次，未在 wiki entity 或 characters 表登錄。`,
        targets,
        fix: { kind: 'llm' },
      });
    }
    return { issues, unprocessed };
  },
};
