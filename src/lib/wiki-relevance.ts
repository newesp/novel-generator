/**
 * Cheap relevance filter（Phase 2 — 純 JS 零依賴）
 *
 * 規範：spec §5.3 Step 1
 *
 * needle 集合：
 *   - 角色名 + aliases
 *   - 章節標題（整串 + 2-4 字滑動窗）
 *   - 章節要點（2-4 字滑動窗）
 *   - 故事節拍（去括號後整串）
 *   - 參考章節尾段 1500 字的 2-4 字滑動窗，取字頻 top 50
 * 去重、過濾長度 < 2 / 全標點、英文 lowercase。
 *
 * relevanceScore：
 *   slug 命中 +10；title 命中 +8；aliases ∩ needles 數 ×6；contentMd 含 needle 個數（cap 5）×1
 */
import type { WikiPage } from '../types';

export interface ChapterContext {
  title?: string;
  points?: string;
  beat?: string;
  referenceChapterContent?: string;
  characterNames?: string[];
  characterAliases?: string[];
}

export interface RelevanceScored {
  page: WikiPage;
  score: number;
}

const PUNCT = /^[\s\p{P}\p{S}]+$/u;

/** 從一段文字生出 2-4 字滑動窗 */
function sliding2to4(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const t = text.replace(/\s+/g, ' ');
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i + n <= t.length; i++) {
      const piece = t.slice(i, i + n);
      if (!PUNCT.test(piece)) out.push(piece);
    }
  }
  return out;
}

/** 取字串尾段 N 字 */
function tail(s: string, n: number): string {
  if (!s || s.length <= n) return s || '';
  return s.slice(s.length - n);
}

/** 字頻 top K */
function topNByFrequency(arr: string[], k: number): string[] {
  const freq = new Map<string, number>();
  for (const x of arr) freq.set(x, (freq.get(x) ?? 0) + 1);
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([s]) => s);
}

export function buildNeedles(ctx: ChapterContext): Set<string> {
  const out = new Set<string>();
  const add = (s: string | undefined) => {
    if (!s) return;
    const v = s.trim();
    if (v.length >= 2 && !PUNCT.test(v)) out.add(v.toLowerCase());
  };

  for (const n of ctx.characterNames ?? []) add(n);
  for (const a of ctx.characterAliases ?? []) add(a);

  if (ctx.title) {
    add(ctx.title);
    for (const p of sliding2to4(ctx.title)) add(p);
  }
  if (ctx.points) {
    for (const p of sliding2to4(ctx.points)) add(p);
  }
  if (ctx.beat) {
    add(ctx.beat.replace(/\(.+?\)/g, '').trim());
  }
  if (ctx.referenceChapterContent) {
    const pieces = sliding2to4(tail(ctx.referenceChapterContent, 1500));
    for (const p of topNByFrequency(pieces, 50)) add(p);
  }
  return out;
}

export function scorePages(pages: WikiPage[], needles: Set<string>): RelevanceScored[] {
  const out: RelevanceScored[] = [];
  for (const page of pages) {
    let score = 0;
    const slug = page.slug.toLowerCase();
    const title = page.title.toLowerCase();

    if (containsAny(slug, needles)) score += 10;
    if (containsAny(title, needles)) score += 8;

    const aliasHits = page.aliases.reduce(
      (n, a) => n + (needles.has(a.toLowerCase()) ? 1 : 0), 0);
    score += aliasHits * 6;

    let contentHits = 0;
    const md = page.contentMd.toLowerCase();
    for (const n of needles) {
      if (md.includes(n)) {
        contentHits++;
        if (contentHits >= 5) break;
      }
    }
    score += contentHits;

    out.push({ page, score });
  }
  return out;
}

function containsAny(text: string, needles: Set<string>): boolean {
  for (const n of needles) {
    if (text.includes(n)) return true;
  }
  return false;
}
