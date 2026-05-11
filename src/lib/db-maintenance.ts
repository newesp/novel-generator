/**
 * IndexedDB 診斷與清理工具
 *
 * 用途：清掉舊版本/被中斷刪除流程留下的孤兒資料
 *  - characters / chapters / versions 的 projectId 指向已不存在的 project → 視為孤兒
 *  - versions 的 chapterId 指向已不存在的 chapter → 視為孤兒
 *
 * Dev 環境會自動掛到 window.dbDebug 以便從 Console 呼叫：
 *   window.dbDebug.inspect()            // 列出所有資料統計與孤兒
 *   window.dbDebug.cleanupOrphans()     // 刪除所有孤兒
 *   window.dbDebug.wipeAllExceptBook('小圓舞進行曲')
 *                                       // 只保留指定書名（含子資料），其餘全清
 */
import { db } from './db';

export interface DBReport {
  books: { id: string; title: string; chapterCount: number; characterCount: number }[];
  orphanCharacters: { id: string; name: string; projectId: string }[];
  orphanChapters: { id: string; title: string; projectId: string }[];
  orphanVersions: { id: string; chapterId: string }[];
}

export async function inspect(): Promise<DBReport> {
  const projects = await db.projects.toArray();
  const chapters = await db.chapters.toArray();
  const characters = await db.characters.toArray();
  const versions = await db.versions.toArray();

  const bookIds = new Set(projects.map((p) => p.id));
  const chapterIds = new Set(chapters.map((c) => c.id));

  const books = projects.map((p) => ({
    id: p.id,
    title: p.title,
    chapterCount: chapters.filter((c) => c.projectId === p.id).length,
    characterCount: characters.filter((c) => c.projectId === p.id).length,
  }));

  const orphanCharacters = characters
    .filter((c) => !bookIds.has(c.projectId))
    .map((c) => ({ id: c.id, name: c.name, projectId: c.projectId }));

  const orphanChapters = chapters
    .filter((c) => !bookIds.has(c.projectId))
    .map((c) => ({ id: c.id, title: c.title, projectId: c.projectId }));

  const orphanVersions = versions
    .filter((v) => !chapterIds.has(v.chapterId))
    .map((v) => ({ id: v.id, chapterId: v.chapterId }));

  const report: DBReport = { books, orphanCharacters, orphanChapters, orphanVersions };
  console.table(books);
  if (orphanCharacters.length) {
    console.warn(`[孤兒角色] ${orphanCharacters.length} 筆：`);
    console.table(orphanCharacters);
  }
  if (orphanChapters.length) {
    console.warn(`[孤兒章節] ${orphanChapters.length} 筆：`);
    console.table(orphanChapters);
  }
  if (orphanVersions.length) {
    console.warn(`[孤兒版本] ${orphanVersions.length} 筆`);
  }
  if (!orphanCharacters.length && !orphanChapters.length && !orphanVersions.length) {
    console.log('✅ 沒有孤兒資料');
  }
  return report;
}

export async function cleanupOrphans(): Promise<{ characters: number; chapters: number; versions: number }> {
  const report = await inspect();
  const charIds = report.orphanCharacters.map((c) => c.id);
  const chapIds = report.orphanChapters.map((c) => c.id);
  const verIds = report.orphanVersions.map((v) => v.id);

  if (charIds.length) await db.characters.bulkDelete(charIds);
  if (chapIds.length) {
    // 同時清掉指向這些章節的版本
    const versionsOfOrphanChapters = await db.versions
      .where('chapterId').anyOf(chapIds).primaryKeys();
    await db.versions.bulkDelete(versionsOfOrphanChapters as string[]);
    await db.chapters.bulkDelete(chapIds);
  }
  if (verIds.length) await db.versions.bulkDelete(verIds);

  console.log(`🧹 已清除：${charIds.length} 個孤兒角色 / ${chapIds.length} 個孤兒章節 / ${verIds.length + (chapIds.length ? '+'  : '')} 個孤兒版本`);
  return { characters: charIds.length, chapters: chapIds.length, versions: verIds.length };
}

/**
 * 強力清理：只保留指定書名的書本，其他全部刪除（含子資料）。
 * 若 title 對應多本書，全部保留。
 */
export async function wipeAllExceptBook(title: string): Promise<void> {
  const projects = await db.projects.toArray();
  const keep = projects.filter((p) => p.title === title);
  if (keep.length === 0) {
    console.warn(`找不到書名為「${title}」的書本，沒有任何動作`);
    return;
  }
  const keepIds = new Set(keep.map((p) => p.id));

  const removeProjectIds = projects.filter((p) => !keepIds.has(p.id)).map((p) => p.id);
  if (removeProjectIds.length === 0) {
    console.log(`✅ 已經只剩下「${title}」，無需清理`);
  }

  // 刪除非保留書的所有子資料
  const removeChapters = await db.chapters.where('projectId').anyOf(removeProjectIds).toArray();
  const removeChapterIds = removeChapters.map((c) => c.id);
  if (removeChapterIds.length) {
    await db.versions.where('chapterId').anyOf(removeChapterIds).delete();
    await db.chapters.bulkDelete(removeChapterIds);
  }
  await db.characters.where('projectId').anyOf(removeProjectIds).delete();
  await db.projects.bulkDelete(removeProjectIds);

  // 再做一次孤兒清理（保險）
  await cleanupOrphans();

  console.log(`🧹 已只保留「${title}」（${keep.length} 本），刪除其他 ${removeProjectIds.length} 本書與相關資料`);
  console.log('請重新整理頁面以看到結果');
}

// Dev 模式下掛到 window，方便從 Console 操作
if (import.meta.env.DEV) {
  (window as unknown as { dbDebug: unknown }).dbDebug = {
    inspect,
    cleanupOrphans,
    wipeAllExceptBook,
    db,
  };
}
