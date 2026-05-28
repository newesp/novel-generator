/**
 * Wiki Ingest pipeline
 *
 * 規範：spec §4.1 §4.4 §4.5
 *
 * 流程：
 *   1. Pre-flight：撈本章 + index + characters + 計算 chapterContentHash
 *   2. Plan (1 LLM call) → parseAndValidatePlan
 *   3. Apply (每 op 1 LLM call，串行) → wiki-parser
 *   4. 寫 DB（補償模式：log 先寫、page 後寫；失敗用 op_status 標記）
 *   5. 更新 chapter wikiSyncStatus / wikiSyncedAt / wikiSyncedHash
 *
 * 沒有 transaction（tauri-plugin-sql 限制）：用 op_status='failed' 記實際結果。
 */
import { v4 as uuid } from 'uuid';
import type {
  Chapter, WikiPage,
  WikiLogEntry, WikiPageSnapshot, WikiSyncStatus,
} from '../types';
import { storage } from './storage';
import { useSettingsStore } from '../stores/settingsStore';
import { complete } from './llm';
import { renderTemplate } from './prompt-template';
import { parseAndValidatePlan, type Plan, type PlanOp } from './wiki-plan';
import { parseWikiPageMarkdown } from './wiki-parser';
import { buildFtsExcerptsSection, buildFtsLookupQuery } from './wiki-ingest-fts';
import { sanitizeWikiRelatedRefs } from './wiki-related-sanitize';
import {
  ensureRequiredCharacterEntityOps,
  findRequiredCharacterEntities,
  formatRequiredCharacterEntitiesForPrompt,
} from './wiki-character-entities';

export interface IngestResult {
  batchId: string;
  okCount: number;
  failedCount: number;
  plan: Plan;
  logEntries: WikiLogEntry[];
  status: WikiSyncStatus;     // 'synced' | 'partial'
}

export async function ingestChapter(chapter: Chapter): Promise<IngestResult> {
  const batchId = uuid();
  const bookId = chapter.projectId;

  // [1] Pre-flight
  const [allPages, allChars] = await Promise.all([
    storage.wikiPages.list(bookId),
    storage.characters.listByProject(bookId),
  ]);
  const chapterContentHash = await sha1Hex(chapter.content);

  const indexJson = JSON.stringify(
    allPages.map((p) => ({
      type: p.type, slug: p.slug, title: p.title,
      description: p.description, aliases: p.aliases,
    })),
    null, 2,
  );
  const knownCharactersList = allChars.map((c) => c.name).filter(Boolean).join('、') || '(無)';
  const requiredCharacterEntities = findRequiredCharacterEntities({
    chapterContent: chapter.content,
    characters: allChars,
    pages: allPages,
  });
  const requiredEntityCandidatesJson = formatRequiredCharacterEntitiesForPrompt(requiredCharacterEntities);

  // [2] Plan
  // 章節序號 — 給 summary slug 避免衝突（spec §4.2 規則 3）
  // chapter.order 是 0-based；對外顯示用 1-based
  const chapterOrdinal = (chapter.order ?? 0) + 1;
  const chapterSummarySlug = `ch-${chapterOrdinal}`;

  const aiPrompts = useSettingsStore.getState().aiPrompts;
  const planPrompt = renderTemplate(withWikiPlanSafetyRules(aiPrompts.wikiIngestPlanTemplate), {
    indexCount: String(allPages.length),
    indexJson,
    knownCharactersList,
    chapterTitle: chapter.title || '(未命名)',
    chapterContent: chapter.content,
    chapterOrdinal: String(chapterOrdinal),
    chapterSummarySlug,
    requiredEntityCandidatesJson,
  });

  let planRaw: string;
  try {
    planRaw = await complete(planPrompt, { maxTokens: 2048 });
  } catch (e) {
    throw new Error(`Plan LLM 呼叫失敗：${(e as Error).message}`, { cause: e });
  }

  const existing = new Map<string, WikiPage>();
  for (const p of allPages) existing.set(`${p.type}/${p.slug}`, p);
  let plan: Plan;
  try {
    plan = ensureRequiredCharacterEntityOps({
      plan: parseAndValidatePlan(planRaw, { existing }),
      required: requiredCharacterEntities,
    });
  } catch {
    // 重試 1 次（spec §4.4）
    planRaw = await complete(planPrompt + '\n\n（重要：請只輸出嚴格 JSON）', { maxTokens: 2048 });
    plan = ensureRequiredCharacterEntityOps({
      plan: parseAndValidatePlan(planRaw, { existing }),
      required: requiredCharacterEntities,
    });
  }
  const plannedKeys = new Set(plan.operations.map((op) => `${op.type}/${op.slug}`));

  // [3]+[4] Apply each op
  const logEntries: WikiLogEntry[] = [];
  let okCount = 0;
  let failedCount = 0;

  for (const op of plan.operations) {
    const opResult = await applyOneOp(bookId, chapter, op, batchId, aiPrompts, existing, plannedKeys);
    logEntries.push(opResult.logEntry);
    if (opResult.logEntry.opStatus === 'ok') okCount++;
    else failedCount++;
  }

  // [5] 更新 chapter
  const status: WikiSyncStatus = failedCount > 0 ? 'partial' : 'synced';
  await storage.chapters.update(chapter.id, {
    wikiSyncedAt: Date.now(),
    wikiSyncedHash: chapterContentHash,
    wikiSyncStatus: status,
  });

  return { batchId, okCount, failedCount, plan, logEntries, status };
}

/** 重試 batch 中 op_status='failed' 的條目 */
export async function retryRemaining(chapter: Chapter, batchId: string): Promise<IngestResult> {
  const bookId = chapter.projectId;
  const allLogs = await storage.wikiLog.listByBatch(bookId, batchId);
  const failed = allLogs.filter((l) => l.opStatus === 'failed');

  const aiPrompts = useSettingsStore.getState().aiPrompts;
  const allPages = await storage.wikiPages.list(bookId);
  const existing = new Map<string, WikiPage>();
  for (const p of allPages) existing.set(`${p.type}/${p.slug}`, p);

  const logEntries: WikiLogEntry[] = [];
  let ok = 0, fail = 0;

  for (const oldLog of failed) {
    const after = oldLog.pageSnapshotAfter;
    const op: PlanOp = oldLog.kind === 'create'
      ? {
          action: 'create',
          type: oldLog.pageType,
          slug: oldLog.pageSlug,
          title: after?.title ?? oldLog.pageSlug,
          aliases: after?.aliases ?? [],
          description: after?.description,
          reason: '重試 failed op',
          content_brief: after?.contentMd ?? '',
        }
      : {
          action: 'update',
          type: oldLog.pageType,
          slug: oldLog.pageSlug,
          reason: '重試 failed op',
          change_brief: oldLog.errorMessage ?? '重試',
        };

    const plannedKeys = new Set([...existing.keys(), `${op.type}/${op.slug}`]);
    const r = await applyOneOp(bookId, chapter, op, batchId, aiPrompts, existing, plannedKeys);
    logEntries.push(r.logEntry);
    if (r.logEntry.opStatus === 'ok') {
      await storage.wikiLog.updateStatus(oldLog.id, 'undone');
      ok++;
    } else {
      fail++;
    }
  }

  const remainingFailed = (await storage.wikiLog.listByBatch(bookId, batchId))
    .filter((l) => l.opStatus === 'failed').length;
  const status: WikiSyncStatus = remainingFailed > 0 ? 'partial' : 'synced';
  await storage.chapters.update(chapter.id, { wikiSyncStatus: status });

  return {
    batchId, okCount: ok, failedCount: fail,
    plan: { operations: [], log_entry: 'retry-remaining', unrecorded_characters: [], warnings: [] },
    logEntries, status,
  };
}

interface ApplyResult {
  logEntry: WikiLogEntry;
}

async function applyOneOp(
  bookId: string, chapter: Chapter, op: PlanOp, batchId: string,
  aiPrompts: ReturnType<typeof useSettingsStore.getState>['aiPrompts'],
  existing: Map<string, WikiPage>,
  plannedKeys: Set<string>,
): Promise<ApplyResult> {
  const now = Date.now();
  const logId = uuid();
  const key = `${op.type}/${op.slug}`;
  const beforePage = existing.get(key) ?? null;
  const source = `ingest:${chapter.id}`;
  const summary = op.action === 'create'
    ? `+${op.type}/${op.slug}`
    : `~${op.type}/${op.slug}`;
  const allowedRelatedRefsList = [...new Set([...existing.keys(), ...plannedKeys, key])]
    .sort()
    .map((ref) => `- ${ref}`)
    .join('\n') || '- (none)';

  // chapter excerpt（前 4k 字）
  const chapterExcerpt = chapter.content.slice(0, 4000);

  let afterContent: string;
  try {
    if (op.action === 'create') {
      let ftsExcerptsSection = '';
      if (storage.search) {
        try {
          const query = buildFtsLookupQuery({
            title: op.title,
            aliases: op.aliases,
            contentBrief: op.content_brief,
          });
          const hits = await storage.search.search(bookId, query, { scope: 'chapter', limit: 4 });
          ftsExcerptsSection = buildFtsExcerptsSection(
            hits.filter((hit) => hit.id !== chapter.id).slice(0, 3),
          );
        } catch (e) {
          console.warn('FTS search failed during wiki ingest create; continuing without excerpts.', e);
        }
      }
      const prompt = renderTemplate(withWikiRelatedSafetyRules(aiPrompts.wikiIngestCreateTemplate), {
        type: op.type, slug: op.slug, title: op.title,
        aliasesList: op.aliases.join('、') || '(無)',
        reason: op.reason, contentBrief: op.content_brief,
        chapterExcerpt,
        ftsExcerptsSection,
        allowedRelatedRefsList,
      });
      afterContent = await complete(prompt, { maxTokens: 2048 });
    } else {
      if (!beforePage) {
        throw new Error('update 但既有頁不存在（不該發生，校驗會降級）');
      }
      const prompt = renderTemplate(withWikiRelatedSafetyRules(aiPrompts.wikiIngestUpdateTemplate), {
        type: op.type, slug: op.slug,
        existingMarkdown: beforePage.contentMd,
        reason: op.reason, changeBrief: op.change_brief,
        chapterExcerpt,
        allowedRelatedRefsList,
      });
      afterContent = await complete(prompt, { maxTokens: 2048 });
    }
  } catch (e) {
    // Apply LLM 失敗 — 寫 failed log，page_snapshot_after = null
    const failedLog: WikiLogEntry = {
      id: logId, bookId, batchId, appliedAt: now,
      kind: op.action === 'create' ? 'create' : 'update',
      opStatus: 'failed',
      pageId: beforePage?.id ?? null,
      pageType: op.type, pageSlug: op.slug,
      pageSnapshotBefore: beforePage,
      pageSnapshotAfter: null,
      source, summary,
      errorMessage: (e as Error).message,
    };
    await safeAddLog(failedLog);
    return { logEntry: failedLog };
  }

  // 解析 Apply 輸出
  const parsed = parseWikiPageMarkdown(afterContent, op.action === 'create' ? op.title : beforePage!.title);
  const allowedRefs = new Set([...existing.keys(), ...plannedKeys, key]);
  const sanitized = sanitizeWikiRelatedRefs({
    markdown: parsed.contentMd,
    relatedSlugs: parsed.relatedSlugs,
    allowedRefs,
  });
  const description = op.action === 'create' && op.description
    ? op.description
    : parsed.fallbackDescription;

  let afterPage: WikiPageSnapshot;
  if (op.action === 'create') {
    afterPage = beforePage
      ? {
          ...beforePage,
          title: parsed.title || op.title,
          aliases: parsed.aliases.length ? parsed.aliases : op.aliases,
          relatedSlugs: sanitized.relatedSlugs,
          description,
          contentMd: sanitized.contentMd,
          updatedAt: now,
        }
      : {
          id: uuid(), bookId, type: op.type, slug: op.slug,
          title: parsed.title || op.title,
          aliases: parsed.aliases.length ? parsed.aliases : op.aliases,
          relatedSlugs: sanitized.relatedSlugs,
          description,
          contentMd: sanitized.contentMd,
          createdAt: now, updatedAt: now,
        };
  } else {
    // update — beforePage 必存在（上方已 throw 過）
    afterPage = {
      ...beforePage!,
      title: parsed.title || beforePage!.title,
      aliases: parsed.aliases.length ? parsed.aliases : beforePage!.aliases,
      relatedSlugs: sanitized.relatedSlugs,
      description,
      contentMd: sanitized.contentMd,
      updatedAt: now,
    };
  }

  // [4] 補償寫入：先 log 再 page
  const okLog: WikiLogEntry = {
    id: logId, bookId, batchId, appliedAt: now,
    kind: op.action === 'create' ? 'create' : 'update',
    opStatus: 'ok',
    pageId: afterPage.id,
    pageType: op.type, pageSlug: op.slug,
    pageSnapshotBefore: beforePage,
    pageSnapshotAfter: afterPage,
    source, summary,
  };
  try {
    await storage.wikiLog.add(okLog);
  } catch (e) {
    return {
      logEntry: { ...okLog, opStatus: 'failed', pageSnapshotAfter: null,
        errorMessage: `wiki_log insert 失敗：${(e as Error).message}` },
    };
  }
  try {
    if (op.action === 'create') {
      await storage.wikiPages.add(afterPage);
    } else {
      await storage.wikiPages.update(afterPage);
    }
    existing.set(key, afterPage);
    return { logEntry: okLog };
  } catch (e) {
    await storage.wikiLog.updateStatus(okLog.id, 'failed', (e as Error).message);
    return { logEntry: { ...okLog, opStatus: 'failed', errorMessage: (e as Error).message } };
  }
}

async function safeAddLog(entry: WikiLogEntry): Promise<void> {
  try { await storage.wikiLog.add(entry); } catch { /* swallow */ }
}

async function sha1Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-1', enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function withWikiPlanSafetyRules(template: string): string {
  return `${template}

## 系統補充規則（不可忽略）
- 「已知角色」只代表角色庫已有資料，不代表 Wiki entity 已存在。若當前 Wiki 索引沒有該角色的 entity，本章又提供足夠資訊，請建立 entity；只有 Wiki 索引已存在該 entity 時才使用 update。
- 若要在 Related 建立關聯，必須同時在 operations 中建立/更新該目標頁，或目標頁已存在於當前 Wiki 索引。
- 以下角色是程式已判定「角色庫已有、本章出現、但 Wiki entity 不存在」的必建候選；除非候選明顯錯誤，operations 必須包含對應 create entity。若你漏掉，系統會自動補上。
{{requiredEntityCandidatesJson}}`;
}

function withWikiRelatedSafetyRules(template: string): string {
  return `${template}

## 系統補充規則（不可忽略）
Related 只能使用以下 type/slug 目標；沒有合適目標就省略 Related 整行。連結格式必須是 \`../type/slug\`，不要加 \`.md\`。
{{allowedRelatedRefsList}}`;
}

// 給 UI 用：判斷章節是否該標 stale（spec §3.2）
export async function recomputeChapterSyncStatus(chapter: Chapter): Promise<WikiSyncStatus> {
  if (chapter.wikiSyncedHash === null) return 'unsynced';
  const currentHash = await sha1Hex(chapter.content);
  const changed = currentHash !== chapter.wikiSyncedHash;
  if (!changed) return chapter.wikiSyncStatus;
  if (chapter.wikiSyncStatus === 'synced') return 'stale';
  if (chapter.wikiSyncStatus === 'partial') return 'partial_stale';
  return chapter.wikiSyncStatus;
}

/** 給 ChapterEditor 用：取得 chapter 同 batch 的 failed log count（partial 數字） */
export async function getFailedCountForChapter(chapter: Chapter): Promise<number> {
  if (chapter.wikiSyncStatus !== 'partial' && chapter.wikiSyncStatus !== 'partial_stale') return 0;
  const logs = await storage.wikiLog.list(chapter.projectId, 200);
  const myIngests = logs.filter((l) => l.source === `ingest:${chapter.id}`);
  if (myIngests.length === 0) return 0;
  const lastBatch = myIngests[0].batchId;
  return myIngests.filter((l) => l.batchId === lastBatch && l.opStatus === 'failed').length;
}
