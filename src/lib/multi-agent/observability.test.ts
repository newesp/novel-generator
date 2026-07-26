import { describe, expect, it, vi, beforeEach } from 'vitest';
import { pruneOldRunTraces, deleteGenerationRunRecord } from './observability';

const runsMap = new Map<string, any>();
const stepsMap = new Map<string, any>();
const checkpointsMap = new Map<string, any>();

vi.mock('../storage', () => ({
  storage: {
    generationRuns: {
      listByChapter: vi.fn(async (chapterId: string) => Array.from(runsMap.values()).filter((r) => r.chapterId === chapterId)),
      get: vi.fn(async (id: string) => runsMap.get(id)),
      delete: vi.fn(async (id: string) => { runsMap.delete(id); }),
    },
    generationSteps: {
      listByRun: vi.fn(async (runId: string) => Array.from(stepsMap.values()).filter((s) => s.runId === runId)),
      update: vi.fn(async (id: string, data: any) => {
        const cur = stepsMap.get(id);
        if (cur) stepsMap.set(id, { ...cur, ...data });
      }),
      deleteByRun: vi.fn(async (runId: string) => {
        for (const [id, s] of stepsMap) { if (s.runId === runId) stepsMap.delete(id); }
      }),
    },
    generationCheckpoints: {
      deleteByRun: vi.fn(async (runId: string) => {
        for (const [id, c] of checkpointsMap) { if (c.runId === runId) checkpointsMap.delete(id); }
      }),
    },
  },
}));

describe('Multi-Agent Observability & Lifecycle', () => {
  beforeEach(() => {
    runsMap.clear();
    stepsMap.clear();
    checkpointsMap.clear();
  });

  it('prunes heavy prompt/response payload only for finished runs beyond latest 3', async () => {
    // Add 5 completed runs for chapter_1
    for (let i = 1; i <= 5; i++) {
      const runId = `run_${i}`;
      runsMap.set(runId, { id: runId, chapterId: 'c1', status: 'completed', completedAt: 1000 * i });
      stepsMap.set(`s_${i}`, { id: `s_${i}`, runId, prompt: '大型 Prompt 內容', response: '大型 Response 內容' });
    }

    await pruneOldRunTraces('c1');

    // Runs 5, 4, 3 (latest 3) should retain full prompt
    expect(stepsMap.get('s_5').prompt).toBe('大型 Prompt 內容');
    expect(stepsMap.get('s_4').prompt).toBe('大型 Prompt 內容');
    expect(stepsMap.get('s_3').prompt).toBe('大型 Prompt 內容');

    // Older runs 2, 1 should be pruned
    expect(stepsMap.get('s_2').prompt).toBe('[過期軌跡大內容已清理]');
    expect(stepsMap.get('s_1').prompt).toBe('[過期軌跡大內容已清理]');
  });

  it('blocks deletion of unfinished runs and allows deleting finished runs', async () => {
    runsMap.set('run_running', { id: 'run_running', status: 'running' });
    runsMap.set('run_done', { id: 'run_done', status: 'completed' });
    stepsMap.set('s1', { id: 's1', runId: 'run_done' });
    checkpointsMap.set('c1', { id: 'c1', runId: 'run_done' });

    await expect(deleteGenerationRunRecord('run_running')).rejects.toThrow('未結束之生成執行不可直接刪除');

    await deleteGenerationRunRecord('run_done');
    expect(runsMap.has('run_done')).toBe(false);
    expect(stepsMap.has('s1')).toBe(false);
    expect(checkpointsMap.has('c1')).toBe(false);
  });
});
