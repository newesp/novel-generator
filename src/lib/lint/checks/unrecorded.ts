import { v4 as uuid } from 'uuid';
import { complete } from '../../llm';
import { renderTemplate } from '../../prompt-template';
import type { Chapter, Character, WikiPage } from '../../../types';
import type { LintCheck, LintContext, LintIssue, IssueTarget } from '../types';

/** 黑名單：常見虛詞 / 通用詞，避免假陽性炸 */
const STOPWORDS = new Set<string>([
  '突然', '這時', '此時', '當下', '眼前', '不能', '不行', '不要', '可以',
  '可能', '應該', '已經', '依然', '仍然', '繼續', '主人', '師父', '主公',
  '師兄', '師姐', '師妹', '師弟', '長老', '弟子', '前輩', '晚輩',
  '一個', '兩個', '三個', '幾個', '所有', '其中', '其他', '所謂',
  '一陣', '一聲', '一道', '一片', '那一', '這一',
]);

/** 對話標籤動詞 / 稱呼語境 */
const DIALOGUE_VERBS = ['說', '問', '答', '道', '喊', '叫', '吼', '笑', '哭', '怒', '呼', '罵'];
const NAME_PREFIX = ['叫做', '名為', '叫', '稱', '這位'];
const HONORIFICS = ['師兄', '師姐', '師妹', '師弟', '師父', '師娘', '姑娘', '公子', '長老', '大人', '先生', '夫人'];

export interface UnrecordedCandidate {
  name: string;
  occurrences: Array<{ chapterId: string; excerpt: string }>;
  freq: number;
}

interface MatchHit {
  chapterId: string;
  index: number;
  inContext: boolean;
}

function isInContext(content: string, name: string, index: number): boolean {
  const before = content.slice(Math.max(0, index - 8), index);
  const after = content.slice(index + name.length, index + name.length + 8);
  // 對話標籤：後面接動詞
  if (DIALOGUE_VERBS.some((v) => after.startsWith(v))) return true;
  // 對話標籤：「」+ 名字
  if (before.endsWith('」')) return true;
  // 稱呼語境：前綴
  if (NAME_PREFIX.some((p) => before.endsWith(p))) return true;
  // 稱呼語境：後綴
  if (HONORIFICS.some((h) => after.startsWith(h))) return true;
  return false;
}

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
    // 對每個 2-4 字長度都掃一遍
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= content.length - len; i++) {
        const name = content.slice(i, i + len);
        if (!/^[一-鿿]+$/.test(name)) continue;
        if (STOPWORDS.has(name)) continue;
        if (known.has(name)) continue;
        const list = hitsByName.get(name) ?? [];
        list.push({ chapterId: chapter.id, index: i, inContext: isInContext(content, name, i) });
        hitsByName.set(name, list);
      }
    }
  }

  // 篩選：(a) 在語境中出現 ≥1 次  或  (b) 字頻 ≥3
  const candidates: UnrecordedCandidate[] = [];
  for (const [name, hits] of hitsByName.entries()) {
    const inContextCount = hits.filter((h) => h.inContext).length;
    const freq = hits.length;
    if (inContextCount === 0 && freq < 3) continue;

    // 額外保險：若名字是更長已知名稱的子字串就略過（e.g.「王大」是「王大山」子字串）
    let isSubstringOfKnown = false;
    for (const k of known) {
      if (k.length > name.length && k.includes(name)) { isSubstringOfKnown = true; break; }
    }
    if (isSubstringOfKnown) continue;

    // 收 occurrences（每章只取一個 excerpt，最多 2 章）
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
    candidates.push({ name, occurrences, freq });
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
      throw new Error(`未登錄角色 LLM verify 失敗：${(e as Error).message}`);
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
