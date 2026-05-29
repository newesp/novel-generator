import { describe, expect, it } from 'vitest';
import { runImageJobQueue } from './image-job-queue';
import type { ComicPanel } from '../../types';

const panel = (id: string, order: number): ComicPanel => ({
  id,
  comicId: 'comic',
  order,
  beat: '',
  characters: [],
  location: '',
  shotType: '',
  cameraAngle: '',
  visualPrompt: `prompt ${order}`,
  negativePrompt: '',
  dialogue: '',
  narration: '',
  durationSec: 4,
  status: 'draft',
  createdAt: 1,
  updatedAt: 1,
});

describe('runImageJobQueue', () => {
  it('runs panels sequentially and marks outputs ready', async () => {
    const updates: ComicPanel[] = [];
    const result = await runImageJobQueue({
      panels: [panel('p1', 1), panel('p2', 2)],
      generate: async (p) => ({ assetId: `asset-${p.id}`, url: `data:${p.id}` }),
      onPanelUpdate: (p) => updates.push(p),
    });

    expect(result.map((p) => [p.id, p.status, p.assetId])).toEqual([
      ['p1', 'ready', 'asset-p1'],
      ['p2', 'ready', 'asset-p2'],
    ]);
    expect(updates.map((p) => p.status)).toEqual(['generating', 'ready', 'generating', 'ready']);
  });

  it('marks a failed panel and continues with the next panel', async () => {
    const result = await runImageJobQueue({
      panels: [panel('p1', 1), panel('p2', 2)],
      generate: async (p) => {
        if (p.id === 'p1') throw new Error('boom');
        return { assetId: `asset-${p.id}`, url: `data:${p.id}` };
      },
      onPanelUpdate: () => undefined,
    });

    expect(result.map((p) => [p.id, p.status, p.errorMessage])).toEqual([
      ['p1', 'failed', 'boom'],
      ['p2', 'ready', undefined],
    ]);
  });
});
