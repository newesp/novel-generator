/**
 * Plan JSON 解析 / 校驗 / slug 正規化 / 衝突降級
 *
 * 規範：spec §4.2 §4.4 §4.7
 *
 * 輸入：LLM 回傳的 raw text + 當前 wiki index（type+slug→page）
 * 輸出：normalized + validated PlanOperations
 *
 * 校驗失敗（不可自動修復）會 throw；可自動修復的（如 slug 衝突）會降級並回 warnings。
 */
import type { WikiPage, WikiPageType } from '../types';

const TYPES: readonly WikiPageType[] =
  ['concept', 'entity', 'summary', 'compare', 'synthesis'] as const;

export interface PlanCreateOp {
  action: 'create';
  type: WikiPageType;
  slug: string;
  title: string;
  aliases: string[];
  description?: string;
  reason: string;
  content_brief: string;
}

export interface PlanUpdateOp {
  action: 'update';
  type: WikiPageType;
  slug: string;
  reason: string;
  change_brief: string;
}

export type PlanOp = PlanCreateOp | PlanUpdateOp;

export interface UnrecordedCharacter {
  name: string;
  sourceExcerpt: string;
}

export interface Plan {
  operations: PlanOp[];
  log_entry: string;
  unrecorded_characters: UnrecordedCharacter[];
  warnings: string[];
}

/** 寬鬆地把 LLM 輸出剝出純 JSON（去除 ```json fence、前後白話） */
export function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) return raw.slice(first, last + 1);
  return raw.trim();
}

export interface PlanValidationContext {
  /** 當前 wiki index — 用 key="type/slug" 查 */
  existing: Map<string, WikiPage>;
}

/** 1. parse → 2. normalize slug → 3. validate against index → 4. downgrade conflicts */
export function parseAndValidatePlan(raw: string, ctx: PlanValidationContext): Plan {
  let json: unknown;
  try {
    json = JSON.parse(extractJson(raw));
  } catch (e) {
    throw new Error(`Plan JSON 解析失敗：${(e as Error).message}`);
  }
  if (!json || typeof json !== 'object') throw new Error('Plan 不是物件');

  const obj = json as Record<string, unknown>;
  const opsRaw = (obj.operations ?? []) as Array<Record<string, unknown>>;
  const warnings: string[] = [];
  const seen = new Set<string>();
  const operations: PlanOp[] = [];

  for (const rawOp of opsRaw) {
    const action = rawOp.action;
    if (action !== 'create' && action !== 'update') {
      warnings.push(`未知 action "${String(action)}"，跳過`);
      continue;
    }
    const { type, slug } = normalizeTypeSlug(rawOp, warnings);
    if (!type || !slug) continue;

    const key = `${type}/${slug}`;
    if (seen.has(key)) {
      warnings.push(`同批重複 ${key}，後者覆寫前者`);
      const idx = operations.findIndex((o) => `${o.type}/${o.slug}` === key);
      if (idx >= 0) operations.splice(idx, 1);
    }
    seen.add(key);

    const existsInIndex = ctx.existing.has(key);

    if (action === 'create' && existsInIndex) {
      warnings.push(`create ${key} 已存在 → 自動改為 update`);
      operations.push({
        action: 'update',
        type, slug,
        reason: String(rawOp.reason ?? '合併新資訊'),
        change_brief: String(rawOp.content_brief ?? rawOp.change_brief ?? '合併新資訊'),
      });
      continue;
    }
    if (action === 'update' && !existsInIndex) {
      warnings.push(`update ${key} 不存在 → 自動改為 create`);
      operations.push({
        action: 'create',
        type, slug,
        title: String(rawOp.title ?? slug),
        aliases: toStringArray(rawOp.aliases),
        description: typeof rawOp.description === 'string' ? rawOp.description : undefined,
        reason: String(rawOp.reason ?? '新建（原 update 不存在）'),
        content_brief: String(rawOp.change_brief ?? rawOp.content_brief ?? ''),
      });
      continue;
    }

    if (action === 'create') {
      operations.push({
        action: 'create',
        type, slug,
        title: String(rawOp.title ?? slug),
        aliases: toStringArray(rawOp.aliases),
        description: typeof rawOp.description === 'string' ? rawOp.description : undefined,
        reason: String(rawOp.reason ?? ''),
        content_brief: String(rawOp.content_brief ?? ''),
      });
    } else {
      operations.push({
        action: 'update',
        type, slug,
        reason: String(rawOp.reason ?? ''),
        change_brief: String(rawOp.change_brief ?? ''),
      });
    }
  }

  const createCount = operations.filter((o) => o.action === 'create').length;
  const updateCount = operations.filter((o) => o.action === 'update').length;

  return {
    operations,
    log_entry: String(obj.log_entry ?? `ingest pages_created=${createCount} pages_updated=${updateCount}`),
    unrecorded_characters: parseUnrecorded(obj.unrecorded_characters),
    warnings,
  };
}

/**
 * 從 op 取出 type / slug，含 spec §4.7 容錯：
 *   - 直接給 {type, slug}：OK
 *   - 給 path 形式 "entity/protagonist.md"：split → 第一段 type、第二段去 .md
 *   - slug 強制 ASCII kebab-case；若 LLM 給中文，正規化（lowercase + 非字母數字換 -）
 */
function normalizeTypeSlug(
  raw: Record<string, unknown>,
  warnings: string[],
): { type: WikiPageType | null; slug: string | null } {
  let type = raw.type as string | undefined;
  let slug = raw.slug as string | undefined;
  const path = raw.path as string | undefined;

  if ((!type || !slug) && typeof path === 'string') {
    const cleaned = path.replace(/^\.\.?\//, '').replace(/\.md$/, '');
    const parts = cleaned.split('/');
    if (parts.length >= 2) {
      type = type ?? parts[parts.length - 2];
      slug = slug ?? parts[parts.length - 1];
    }
  }
  if (!type || !TYPES.includes(type as WikiPageType)) {
    warnings.push(`非法 type "${String(type)}"，跳過`);
    return { type: null, slug: null };
  }
  if (!slug) {
    warnings.push('缺 slug，跳過');
    return { type: null, slug: null };
  }
  const normalized = String(slug)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
  if (!normalized) {
    warnings.push(`slug "${slug}" 正規化後為空，跳過`);
    return { type: null, slug: null };
  }
  if (normalized !== slug) warnings.push(`slug "${slug}" → "${normalized}"`);
  return { type: type as WikiPageType, slug: normalized };
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

function parseUnrecorded(v: unknown): UnrecordedCharacter[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === 'string') return { name: x, sourceExcerpt: '' };
      if (x && typeof x === 'object') {
        return {
          name: String((x as Record<string, unknown>).name ?? ''),
          sourceExcerpt: String((x as Record<string, unknown>).sourceExcerpt ?? ''),
        };
      }
      return null;
    })
    .filter((c): c is UnrecordedCharacter => !!c && !!c.name);
}
