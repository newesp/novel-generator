/**
 * TauriSqliteAdapter 的內部 helpers
 *
 * 主要負責：
 *  - 「entity (TS object) ↔ row (SQL columns)」轉換
 *  - data TEXT 欄位的 JSON.parse / stringify
 *  - 部分更新時的「讀-merge-寫」邏輯
 */
import type { Project, Chapter, ChapterVersion, Character, WikiPage, WikiLogEntry } from '../../types';

export interface ProjectRow {
  id: string;
  data: string;
  created_at: number;
  updated_at: number;
}
export interface ChapterRow {
  id: string;
  project_id: string;
  ord: number;
  updated_at: number;
  data: string;
}
export interface VersionRow {
  id: string;
  chapter_id: string;
  kind: 'full' | 'inline';
  created_at: number;
  data: string;
}
export interface CharacterRow {
  id: string;
  project_id: string;
  name: string;
  data: string;
}
export interface AppMetaRow {
  key: string;
  value: string;
}

// ---------- entity → row ----------

export function projectToRow(p: Project): ProjectRow {
  return {
    id: p.id,
    data: JSON.stringify(p),
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function chapterToRow(c: Chapter): ChapterRow {
  return {
    id: c.id,
    project_id: c.projectId,
    ord: c.order,
    updated_at: c.updatedAt,
    data: JSON.stringify(c),
  };
}

export function versionToRow(v: ChapterVersion): VersionRow {
  return {
    id: v.id,
    chapter_id: v.chapterId,
    kind: v.kind,
    created_at: v.createdAt,
    data: JSON.stringify(v),
  };
}

export function characterToRow(c: Character): CharacterRow {
  return {
    id: c.id,
    project_id: c.projectId,
    name: c.name,
    data: JSON.stringify(c),
  };
}

// ---------- row → entity ----------

export function rowToProject(r: ProjectRow): Project {
  return JSON.parse(r.data) as Project;
}
export function rowToChapter(r: ChapterRow): Chapter {
  return JSON.parse(r.data) as Chapter;
}
export function rowToVersion(r: VersionRow): ChapterVersion {
  return JSON.parse(r.data) as ChapterVersion;
}
export function rowToCharacter(r: CharacterRow): Character {
  return JSON.parse(r.data) as Character;
}

// ---------- partial merge for update() ----------

/**
 * 把 Partial<T> 合進現有 entity，回傳更新後物件。
 * 用於 storage.{kind}.update(id, data) 的「讀-merge-寫」流程。
 */
export function mergePartial<T extends object>(current: T, patch: Partial<T>): T {
  return { ...current, ...patch };
}

// ---------- Wiki rows ----------

export interface WikiPageRow {
  id: string;
  book_id: string;
  type: string;
  slug: string;
  title: string;
  aliases: string;
  related_slugs: string;
  description: string;
  content_md: string;
  created_at: number;
  updated_at: number;
}

export interface WikiLogRow {
  id: string;
  book_id: string;
  batch_id: string;
  applied_at: number;
  kind: string;
  op_status: string;
  page_id: string | null;
  page_type: string;
  page_slug: string;
  page_snapshot_before: string | null;
  page_snapshot_after: string | null;
  source: string;
  summary: string;
  error_message: string | null;
}

export function wikiPageToRow(p: WikiPage): WikiPageRow {
  return {
    id: p.id,
    book_id: p.bookId,
    type: p.type,
    slug: p.slug,
    title: p.title,
    aliases: JSON.stringify(p.aliases ?? []),
    related_slugs: JSON.stringify(p.relatedSlugs ?? []),
    description: p.description ?? '',
    content_md: p.contentMd,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function rowToWikiPage(r: WikiPageRow): WikiPage {
  return {
    id: r.id,
    bookId: r.book_id,
    type: r.type as WikiPage['type'],
    slug: r.slug,
    title: r.title,
    aliases: JSON.parse(r.aliases || '[]'),
    relatedSlugs: JSON.parse(r.related_slugs || '[]'),
    description: r.description ?? '',
    contentMd: r.content_md,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function wikiLogToRow(e: WikiLogEntry): WikiLogRow {
  return {
    id: e.id,
    book_id: e.bookId,
    batch_id: e.batchId,
    applied_at: e.appliedAt,
    kind: e.kind,
    op_status: e.opStatus,
    page_id: e.pageId,
    page_type: e.pageType,
    page_slug: e.pageSlug,
    page_snapshot_before: e.pageSnapshotBefore ? JSON.stringify(e.pageSnapshotBefore) : null,
    page_snapshot_after:  e.pageSnapshotAfter  ? JSON.stringify(e.pageSnapshotAfter)  : null,
    source: e.source,
    summary: e.summary,
    error_message: e.errorMessage ?? null,
  };
}

export function rowToWikiLog(r: WikiLogRow): WikiLogEntry {
  return {
    id: r.id,
    bookId: r.book_id,
    batchId: r.batch_id,
    appliedAt: r.applied_at,
    kind: r.kind as WikiLogEntry['kind'],
    opStatus: r.op_status as WikiLogEntry['opStatus'],
    pageId: r.page_id,
    pageType: r.page_type as WikiLogEntry['pageType'],
    pageSlug: r.page_slug,
    pageSnapshotBefore: r.page_snapshot_before ? JSON.parse(r.page_snapshot_before) : null,
    pageSnapshotAfter:  r.page_snapshot_after  ? JSON.parse(r.page_snapshot_after)  : null,
    source: r.source,
    summary: r.summary,
    errorMessage: r.error_message ?? undefined,
  };
}
