import { invoke } from '@tauri-apps/api/core';
import { exportSnapshot, importSnapshot, type BackupSnapshot } from './backup';
import { isTauri } from './platform';
import { t, type InterfaceLocale } from './language-policy';

export interface ProjectArchiveMissingFile {
  assetId: string;
  originalPath: string;
  reason: string;
}

export interface ProjectArchiveResult {
  path?: string;
  mediaFileCount: number;
  missingFiles: ProjectArchiveMissingFile[];
  snapshot: BackupSnapshot;
}

interface ExportProjectArchiveTauriResult {
  path: string;
  mediaFileCount: number;
  missingFiles: ProjectArchiveMissingFile[];
}

interface ImportProjectArchiveTauriResult {
  snapshotJson: string;
  mediaFileCount: number;
  missingFiles: ProjectArchiveMissingFile[];
}

interface ExportProjectArchiveArgs {
  filename: string;
  snapshotJson: string;
  title: string;
}

interface ImportProjectArchiveArgs {
  title: string;
}

export async function exportProjectArchive(locale: InterfaceLocale = 'zh-TW'): Promise<ProjectArchiveResult | null> {
  if (!isTauri()) {
    throw new Error(t('backup.zipExportDesktopOnly', undefined, locale));
  }

  const snapshot = await exportSnapshot();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const result = await invoke<ExportProjectArchiveTauriResult | null>('export_project_archive_to_picked_file', {
    args: {
      filename: `novel-generator-project-${timestamp}.zip`,
      snapshotJson: JSON.stringify(snapshot, null, 2),
      title: t('backup.zipExportPickerTitle', undefined, locale),
    } satisfies ExportProjectArchiveArgs,
  });
  if (!result) return null;

  return {
    path: result.path,
    mediaFileCount: result.mediaFileCount,
    missingFiles: result.missingFiles,
    snapshot,
  };
}

export async function importProjectArchive(locale: InterfaceLocale = 'zh-TW'): Promise<ProjectArchiveResult | null> {
  if (!isTauri()) {
    throw new Error(t('backup.zipImportDesktopOnly', undefined, locale));
  }

  const result = await invoke<ImportProjectArchiveTauriResult | null>('import_project_archive_from_picked_file', {
    args: {
      title: t('backup.zipImportPickerTitle', undefined, locale),
    } satisfies ImportProjectArchiveArgs,
  });
  if (!result) return null;

  const snapshot = JSON.parse(result.snapshotJson) as BackupSnapshot;
  await importSnapshot(snapshot, 'replace', locale);
  return {
    mediaFileCount: result.mediaFileCount,
    missingFiles: result.missingFiles,
    snapshot,
  };
}
