/**
 * 備份格式 — JSON snapshot
 * 用於：
 *  - 手動匯出/匯入（A 方案）
 *  - File System Access 自動同步寫入的檔案內容（E 方案）
 *
 * 不包含 settings（LLM API key）— 避免明文洩漏；使用者偏好（含 prompts）走 Zustand persist，
 * 不在書本資料的備份範圍內。
 */
import { downloadTextFile, saveJsonFile, type SaveTextFileResult } from './file-export';
import { storage } from './storage';
import type {
  Project, Chapter, ChapterVersion, Character,
  WikiPage, WikiLogEntry, ChapterComic, ComicPanel, ComicPanelImageVariant, MediaAsset, SceneVisual,
  GenerationRun, GenerationStep, GenerationCheckpoint,
} from '../types';

// v1: 無 wiki；v2: 含 wikiPages / wikiLog / multi-agent
export const BACKUP_SCHEMA_VERSION = 2 as const;
export const BACKUP_FILENAME = 'novel-generator-backup.json';

export interface BackupExportOptions {
  includeFullAgentTrace?: boolean;
}

export interface BackupSnapshot {
  schema: 1 | 2;                   // 接受讀入 v1 與 v2，輸出固定 v2
  exportedAt: number;
  app: 'novel-generator';
  projects: Project[];
  chapters: Chapter[];
  versions: ChapterVersion[];
  characters: Character[];
  wikiPages?: WikiPage[];          // v1 缺欄位
  wikiLog?: WikiLogEntry[];        // v1 缺欄位
  comics?: ChapterComic[];
  comicPanels?: ComicPanel[];
  comicPanelImageVariants?: ComicPanelImageVariant[];
  mediaAssets?: MediaAsset[];
  sceneVisuals?: SceneVisual[];
  generationRuns?: GenerationRun[];
  generationSteps?: GenerationStep[];
  generationCheckpoints?: GenerationCheckpoint[];
}

export async function exportSnapshot(options?: BackupExportOptions): Promise<BackupSnapshot> {
  const includeTrace = options?.includeFullAgentTrace ?? true;
  const [
    projects, chapters, versions, characters, wikiPages, wikiLog,
    comics, comicPanels, comicPanelImageVariants, mediaAssets, sceneVisuals,
    runs, rawSteps, checkpoints,
  ] = await Promise.all([
    storage.projects.list(),
    storage.chapters.list(),
    storage.versions.list(),
    storage.characters.list(),
    storage.wikiPages.listAll(),
    storage.wikiLog.listAll(),
    storage.comics.listAll(),
    storage.comicPanels.listAll(),
    storage.comicPanelImageVariants.listAll(),
    storage.mediaAssets.listAll(),
    storage.sceneVisuals.listAll(),
    storage.generationRuns.listAll(),
    storage.generationSteps.listAll(),
    storage.generationCheckpoints.listAll(),
  ]);

  const sanitizedRuns = runs.map((r) => {
    const profilesSnapshot: Record<string, any> = {};
    if (r.snapshot?.profilesSnapshot) {
      for (const [k, p] of Object.entries(r.snapshot.profilesSnapshot)) {
        const { apiKey, ...rest } = p as any;
        profilesSnapshot[k] = rest;
      }
    }
    return {
      ...r,
      snapshot: {
        ...r.snapshot,
        profilesSnapshot,
      },
    };
  });

  const steps = includeTrace
    ? rawSteps
    : rawSteps.map((s) => ({
        ...s,
        prompt: '[備份匯出已排除軌跡內容]',
        response: s.response ? '[備份匯出已排除軌跡內容]' : undefined,
      }));

  return {
    schema: 2,
    exportedAt: Date.now(),
    app: 'novel-generator',
    projects,
    chapters,
    versions,
    characters,
    wikiPages,
    wikiLog,
    comics,
    comicPanels,
    comicPanelImageVariants,
    mediaAssets,
    sceneVisuals,
    generationRuns: sanitizedRuns,
    generationSteps: steps,
    generationCheckpoints: checkpoints,
  };
}

/**
 * 還原 snapshot 至本機 DB。
 * 目前只支援 'replace'（清空再寫入）— 簡單、可預期。
 * merge 模式之後需要時再加，會涉及 id 衝突處理。
 */
import { normalizeProjectLanguage } from '../stores/projectStore';

export async function importSnapshot(
  snapshot: BackupSnapshot,
  mode: 'replace' = 'replace',
  locale: InterfaceLocale = 'zh-TW',
): Promise<void> {
  if (snapshot?.app !== 'novel-generator') {
    throw new Error(t('backup.invalidFormat', undefined, locale));
  }
  if (snapshot.schema !== 1 && snapshot.schema !== 2) {
    throw new Error(t('backup.unsupportedVersion', { version: snapshot.schema }, locale));
  }

  if (mode === 'replace') {
    // Restored incomplete runs must NOT automatically trigger paid requests -> normalize to awaiting_input
    const restoredRuns = (snapshot.generationRuns ?? []).map((r) => {
      if (r.status === 'running' || r.status === 'pending') {
        return { ...r, status: 'awaiting_input' as const };
      }
      return r;
    });

    await storage.replaceAll({
      projects: (snapshot.projects ?? []).map(normalizeProjectLanguage),
      chapters: (snapshot.chapters ?? []).map(upgradeChapterV1ToV2),
      versions: snapshot.versions ?? [],
      characters: snapshot.characters ?? [],
      wikiPages: snapshot.wikiPages ?? [],
      wikiLog: snapshot.wikiLog ?? [],
      comics: snapshot.comics ?? [],
      comicPanels: snapshot.comicPanels ?? [],
      comicPanelImageVariants: snapshot.comicPanelImageVariants ?? [],
      mediaAssets: snapshot.mediaAssets ?? [],
      sceneVisuals: snapshot.sceneVisuals ?? [],
      generationRuns: restoredRuns,
      generationSteps: snapshot.generationSteps ?? [],
      generationCheckpoints: snapshot.generationCheckpoints ?? [],
    });
  }
}

/** v1 backup 的 chapter 沒有 wikiSyncedHash / wikiSyncStatus，補預設值 */
function upgradeChapterV1ToV2(c: Chapter): Chapter {
  return {
    ...c,
    wikiSyncedHash: c.wikiSyncedHash ?? null,
    wikiSyncStatus: c.wikiSyncStatus ?? (c.wikiSyncedAt ? 'synced' : 'unsynced'),
  };
}

/** 觸發瀏覽器下載 JSON 檔（手動匯出用） */
export function downloadSnapshotAsJson(snapshot: BackupSnapshot, filename = BACKUP_FILENAME): void {
  downloadTextFile(JSON.stringify(snapshot, null, 2), filename, 'application/json');
}

export function saveSnapshotAsJson(
  snapshot: BackupSnapshot,
  filename = BACKUP_FILENAME,
  locale: InterfaceLocale = 'zh-TW',
): Promise<SaveTextFileResult> {
  return saveJsonFile({
    filename,
    content: JSON.stringify(snapshot, null, 2),
    pickerTitle: t('backup.exportPickerTitle', undefined, locale),
  });
}

/** 從 File 物件讀取並 parse 成 snapshot */
export async function readSnapshotFromFile(
  file: File,
  locale: InterfaceLocale = 'zh-TW',
): Promise<BackupSnapshot> {
  const text = await file.text();
  try {
    return JSON.parse(text) as BackupSnapshot;
  } catch {
    throw new Error(t('backup.parseError', undefined, locale));
  }
}

import { t, type InterfaceLocale } from './language-policy';

/** 統計 snapshot 內容用於 UI 顯示 */
export function describeSnapshot(s: BackupSnapshot, locale: InterfaceLocale = 'zh-TW'): string {
  const tStr = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(s.exportedAt);
  const wiki = s.wikiPages?.length ?? 0;
  const media = s.mediaAssets?.length ?? 0;
  const scenes = s.sceneVisuals?.length ?? 0;
  return t('backup.descStats', {
    projects: String(s.projects?.length ?? 0),
    chapters: String(s.chapters?.length ?? 0),
    characters: String(s.characters?.length ?? 0),
    wiki: String(wiki),
    media: String(media),
    scenes: String(scenes),
    time: tStr
  }, locale);
}
