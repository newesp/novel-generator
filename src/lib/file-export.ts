import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './platform';

export interface SaveTextFileResult {
  status: 'saved' | 'downloaded' | 'cancelled';
  path?: string;
}

interface SaveJsonFileOptions {
  filename: string;
  content: string;
  pickerTitle: string;
}

interface TauriExportJsonFileArgs {
  filename: string;
  content: string;
  title: string;
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

export function downloadTextFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
