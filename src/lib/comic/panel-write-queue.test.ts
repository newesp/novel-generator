import { describe, expect, it } from 'vitest';
import { createPanelWriteQueue } from './panel-write-queue';

describe('createPanelWriteQueue', () => {
  it('persists rapid edits for the same panel in order', async () => {
    const calls: string[] = [];
    let releaseFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const queue = createPanelWriteQueue(async (_panelId, patch) => {
      calls.push(String(patch.visualPrompt));
      if (calls.length === 1) await firstWrite;
    });

    const first = queue.enqueue('panel-1', { visualPrompt: 'a' });
    const second = queue.enqueue('panel-1', { visualPrompt: 'ab' });

    await Promise.resolve();
    expect(calls).toEqual(['a']);

    releaseFirst();
    await Promise.all([first, second]);
    expect(calls).toEqual(['a', 'ab']);
  });

  it('does not block writes for different panels', async () => {
    const calls: string[] = [];
    let releaseFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const queue = createPanelWriteQueue(async (panelId) => {
      calls.push(panelId);
      if (panelId === 'panel-1') await firstWrite;
    });

    const first = queue.enqueue('panel-1', { visualPrompt: 'a' });
    const second = queue.enqueue('panel-2', { visualPrompt: 'b' });

    await Promise.resolve();
    expect(calls).toEqual(['panel-1', 'panel-2']);

    releaseFirst();
    await Promise.all([first, second]);
  });
});
