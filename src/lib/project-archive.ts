import { invoke } from '@tauri-apps/api/core';
import { describeSnapshot, exportSnapshot, importSnapshot, type BackupSnapshot } from './backup';
import { isTauri } from './platform';

export interface ProjectArchiveMissingFile {
  assetId: string;
  originalPath: string;
  reason: string;
}

export interface ProjectArchiveResult {
  path?: string;
  mediaFileCount: number;
  missingFiles: ProjectArchiveMissingFile[];
  snapshotDescription: string;
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

export async function exportProjectArchive(): Promise<ProjectArchiveResult | null> {
  if (!isTauri()) {
    throw new Error('完整專案 ZIP 匯出目前只支援 Tauri 桌面版');
  }

  const snapshot = await exportSnapshot();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const result = await invoke<ExportProjectArchiveTauriResult | null>('export_project_archive_to_picked_file', {
    args: {
      filename: `novel-generator-project-${timestamp}.zip`,
      snapshotJson: JSON.stringify(snapshot, null, 2),
      title: '選擇完整專案 ZIP 匯出位置',
    } satisfies ExportProjectArchiveArgs,
  });
  if (!result) return null;

  return {
    path: result.path,
    mediaFileCount: result.mediaFileCount,
    missingFiles: result.missingFiles,
    snapshotDescription: describeSnapshot(snapshot),
  };
}

export async function importProjectArchive(): Promise<ProjectArchiveResult | null> {
  if (!isTauri()) {
    throw new Error('完整專案 ZIP 匯入目前只支援 Tauri 桌面版');
  }

  const result = await invoke<ImportProjectArchiveTauriResult | null>('import_project_archive_from_picked_file', {
    args: {
      title: '選擇完整專案 ZIP',
    } satisfies ImportProjectArchiveArgs,
  });
  if (!result) return null;

  const snapshot = JSON.parse(result.snapshotJson) as BackupSnapshot;
  await importSnapshot(snapshot, 'replace');
  return {
    mediaFileCount: result.mediaFileCount,
    missingFiles: result.missingFiles,
    snapshotDescription: describeSnapshot(snapshot),
  };
}
