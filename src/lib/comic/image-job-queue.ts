import type { ComicPanel } from '../../types';

export interface ImageJobOutput {
  assetId: string;
  url: string;
}

export async function runImageJobQueue(input: {
  panels: ComicPanel[];
  generate: (panel: ComicPanel) => Promise<ImageJobOutput>;
  onPanelUpdate: (panel: ComicPanel) => void;
  signal?: AbortSignal;
}): Promise<ComicPanel[]> {
  const results: ComicPanel[] = [];
  for (const panel of input.panels) {
    if (input.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const generating = { ...panel, status: 'generating' as const, errorMessage: undefined };
    input.onPanelUpdate(generating);
    try {
      const output = await input.generate(generating);
      const ready = {
        ...generating,
        status: 'ready' as const,
        assetId: output.assetId,
        updatedAt: Date.now(),
      };
      input.onPanelUpdate(ready);
      results.push(ready);
    } catch (error) {
      const failed = {
        ...generating,
        status: 'failed' as const,
        errorMessage: (error as Error).message,
        updatedAt: Date.now(),
      };
      input.onPanelUpdate(failed);
      results.push(failed);
    }
  }
  return results;
}
