import type { WikiPage } from '../../types';
import type { WikiLintDigest } from './types';

export const DIGEST_KEYWORDS = {
  facts: [
    '年齡', '身份', '性別', '種族', '武器', '能力', '傷勢', '死亡', '失蹤',
    '真名', '秘密', '弱點', '限制', '代價', '規則', '出身', '身高', '體重',
  ],
  relations: [
    '父親', '母親', '師父', '徒弟', '兄弟', '姐妹', '朋友', '敵人',
    '屬於', '隸屬', '效忠', '→',
  ],
  timeline: [
    '之前', '之後', '最終', '當時', '隨後', '多年後', '從此', '日後',
  ],
  openQuestions: [
    '不明', '未知', '待解', '之謎', '為何', '是否', '留下伏筆', '暗示',
  ],
} as const;

const SENTENCE_DELIMITERS = /[。！？\n]+/;

/** 提取 bullet / 句子內容，去除前後空白與 markdown 標記 */
function extractItems(md: string): string[] {
  const lines = md.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: string[] = [];
  for (const line of lines) {
    // bullet
    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      // 標準化 bullet：去掉「：」「:」前後空白以利測試比對
      const raw = bulletMatch[1].trim();
      items.push(raw.replace(/\s*[:：]\s*/, ':'));
      continue;
    }
    // 跳過 heading / blockquote
    if (/^#{1,6}\s/.test(line)) continue;
    if (/^>/.test(line)) continue;
    // 一般段落 → 切句
    for (const s of line.split(SENTENCE_DELIMITERS)) {
      const t = s.trim();
      if (t) items.push(t);
    }
  }
  return items;
}

/** 第 N 章 / chapter X 也算 timeline 關鍵詞 */
function isTimelineItem(item: string): boolean {
  if (/第\s*[一二三四五六七八九十百千0-9]+\s*章/.test(item)) return true;
  return DIGEST_KEYWORDS.timeline.some((k) => item.includes(k));
}

type DigestBucket = 'facts' | 'relations' | 'timeline' | 'openQuestions';

function categorizeItem(item: string): DigestBucket | null {
  // openQuestions 優先，因為「為何」「是否」很容易其他也命中
  if (DIGEST_KEYWORDS.openQuestions.some((k) => item.includes(k))) return 'openQuestions';
  if (DIGEST_KEYWORDS.relations.some((k) => item.includes(k))) return 'relations';
  if (isTimelineItem(item)) return 'timeline';
  if (DIGEST_KEYWORDS.facts.some((k) => item.includes(k))) return 'facts';
  return null;
}

const DIGEST_BUDGET_CHARS = 600;

function totalLen(d: WikiLintDigest): number {
  return d.description.length
    + d.facts.join('').length
    + d.relations.join('').length
    + d.timeline.join('').length
    + d.openQuestions.join('').length;
}

/** 超預算時依 openQuestions → timeline → relations → facts 順序截尾 */
function truncate(d: WikiLintDigest): WikiLintDigest {
  const order: DigestBucket[] = ['openQuestions', 'timeline', 'relations', 'facts'];
  for (const field of order) {
    while (totalLen(d) > DIGEST_BUDGET_CHARS && d[field].length > 0) {
      d[field].pop();
    }
    if (totalLen(d) <= DIGEST_BUDGET_CHARS) break;
  }
  return d;
}

export function buildDigest(page: WikiPage): WikiLintDigest {
  const items = extractItems(page.contentMd);
  const digest: WikiLintDigest = {
    pageId: page.id,
    type: page.type,
    slug: page.slug,
    title: page.title,
    aliases: [...page.aliases],
    description: page.description || '',
    facts: [],
    relations: [],
    timeline: [],
    openQuestions: [],
  };

  // 從第一句填 description（若 page.description 為空）
  if (!digest.description) {
    const firstSentence = items[0] ?? '';
    digest.description = firstSentence;
  }

  for (const item of items) {
    const cat = categorizeItem(item);
    if (!cat) continue;
    digest[cat].push(item);
  }

  return truncate(digest);
}
