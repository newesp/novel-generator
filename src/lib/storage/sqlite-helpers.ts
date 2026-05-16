/**
 * TauriSqliteAdapter 的內部 helpers
 *
 * 主要負責：
 *  - 「entity (TS object) ↔ row (SQL columns)」轉換
 *  - data TEXT 欄位的 JSON.parse / stringify
 *  - 部分更新時的「讀-merge-寫」邏輯
 */
import type { Project, Chapter, ChapterVersion, Character } from '../../types';

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
