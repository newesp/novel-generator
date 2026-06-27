import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './platform';

export interface SaveTextFileResult {
  status: 'saved' | 'downloaded' | 'cancelled';
  path?: string;
}

export type SaveFileResult = SaveTextFileResult;

interface SaveJsonFileOptions {
  filename: string;
  content: string;
  pickerTitle: string;
}

interface SaveBlobFileOptions {
  filename: string;
  blob: Blob;
  pickerTitle: string;
  description: string;
  accept: Record<string, string[]>;
  defaultExtension: string;
}

interface TauriExportJsonFileArgs {
  filename: string;
  content: string;
  title: string;
}

interface TauriExportBinaryFileArgs {
  filename: string;
  bytes: number[];
  title: string;
  filter: string;
  defaultExtension: string;
}

type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: string | Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

export async function saveJsonFile(options: SaveJsonFileOptions): Promise<SaveTextFileResult> {
  if (isTauri()) {
    const path = await invoke<string | null>('export_json_file_to_picked_directory', {
      args: {
        filename: options.filename,
        content: options.content,
        title: options.pickerTitle,
      } satisfies TauriExportJsonFileArgs,
    });
    return path ? { status: 'saved', path } : { status: 'cancelled' };
  }

  const savePicker = (globalThis as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (savePicker) {
    try {
      const fileHandle = await savePicker({
        suggestedName: options.filename,
        types: [{
          description: 'JSON',
          accept: { 'application/json': ['.json'] },
        }],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(options.content);
      await writable.close();
      return { status: 'saved' };
    } catch (err) {
      if ((err as Error).name === 'AbortError') return { status: 'cancelled' };
      throw err;
    }
  }

  downloadTextFile(options.content, options.filename, 'application/json');
  return { status: 'downloaded' };
}

export async function saveBlobFile(options: SaveBlobFileOptions): Promise<SaveFileResult> {
  if (isTauri()) {
    const bytes = Array.from(new Uint8Array(await options.blob.arrayBuffer()));
    const extensions = Object.values(options.accept).flat();
    const filterExtensions = extensions.length ? extensions.join(';') : `.${options.defaultExtension}`;
    const path = await invoke<string | null>('export_binary_file_to_picked_file', {
      args: {
        filename: options.filename,
        bytes,
        title: options.pickerTitle,
        filter: `${options.description} (${filterExtensions})|${filterExtensions}`,
        defaultExtension: options.defaultExtension,
      } satisfies TauriExportBinaryFileArgs,
    });
    return path ? { status: 'saved', path } : { status: 'cancelled' };
  }

  const savePicker = (globalThis as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (savePicker) {
    try {
      const fileHandle = await savePicker({
        suggestedName: options.filename,
        types: [{
          description: options.description,
          accept: options.accept,
        }],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(options.blob);
      await writable.close();
      return { status: 'saved' };
    } catch (err) {
      if ((err as Error).name === 'AbortError') return { status: 'cancelled' };
      throw err;
    }
  }

  downloadBlobFile(options.blob, options.filename);
  return { status: 'downloaded' };
}

export function downloadTextFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  downloadBlobFile(blob, filename);
}

function downloadBlobFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
