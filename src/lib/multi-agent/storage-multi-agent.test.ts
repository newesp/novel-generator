import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  generationRunToRow,
  rowToGenerationRun,
  generationStepToRow,
  rowToGenerationStep,
  generationCheckpointToRow,
  rowToGenerationCheckpoint,
} from '../storage/sqlite-helpers';
import type { GenerationRun, GenerationStep, GenerationCheckpoint } from '../../types';
import type { GenerationRunStore, GenerationStepStore, GenerationCheckpointStore } from '../storage/types';
import {
  calculatePreflightEstimate,
  createGenerationRun,
  cancelGenerationRun,
  isChapterLockedByRun,
  isLLMProfileReferencedByActiveRun,
} from './run-manager';
import { DEFAULT_MULTI_AGENT_PREFS } from '../../stores/settingsStore';
import { storage } from '../storage';

// Memory implementation for testing contract requirements
function createInMemoryMultiAgentStores() {
  const runsMap = new Map<string, GenerationRun>();
  const stepsMap = new Map<string, GenerationStep>();
  const checkpointsMap = new Map<string, GenerationCheckpoint>();

  const generationRuns: GenerationRunStore = {
    listAll: async () => Array.from(runsMap.values()),
    listByBook: async (bookId) => Array.from(runsMap.values()).filter((r) => r.bookId === bookId),
    listByChapter: async (chapterId) => Array.from(runsMap.values()).filter((r) => r.chapterId === chapterId),
    get: async (id) => runsMap.get(id),
    getUnfinishedByChapter: async (chapterId) =>
      Array.from(runsMap.values()).find(
        (r) => r.chapterId === chapterId && ['pending', 'running', 'awaiting_input'].includes(r.status),
      ),
    add: async (run) => { runsMap.set(run.id, run); },
    update: async (id, data) => {
      const current = runsMap.get(id);
      if (current) runsMap.set(id, { ...current, ...data });
    },
    delete: async (id) => {
      runsMap.delete(id);
      for (const [stepId, s] of stepsMap) { if (s.runId === id) stepsMap.delete(stepId); }
      for (const [chkId, c] of checkpointsMap) { if (c.runId === id) checkpointsMap.delete(chkId); }
    },
    deleteByBook: async (bookId) => {
      for (const [id, r] of runsMap) {
        if (r.bookId === bookId) runsMap.delete(id);
      }
    },
  };

  const generationSteps: GenerationStepStore = {
    listAll: async () => Array.from(stepsMap.values()),
    listByRun: async (runId) => Array.from(stepsMap.values()).filter((s) => s.runId === runId),
    get: async (id) => stepsMap.get(id),
    add: async (step) => { stepsMap.set(step.id, step); },
    update: async (id, data) => {
      const current = stepsMap.get(id);
      if (current) stepsMap.set(id, { ...current, ...data });
    },
    delete: async (id) => { stepsMap.delete(id); },
    deleteByRun: async (runId) => {
      for (const [id, s] of stepsMap) {
        if (s.runId === runId) stepsMap.delete(id);
      }
    },
  };

  const generationCheckpoints: GenerationCheckpointStore = {
    listAll: async () => Array.from(checkpointsMap.values()),
    listByRun: async (runId) => Array.from(checkpointsMap.values()).filter((c) => c.runId === runId),
    get: async (id) => checkpointsMap.get(id),
    getLatestByRun: async (runId) => {
      const list = Array.from(checkpointsMap.values())
        .filter((c) => c.runId === runId)
        .sort((a, b) => a.createdAt - b.createdAt);
      return list[list.length - 1];
    },
    add: async (chk) => { checkpointsMap.set(chk.id, chk); },
    update: async (id, data) => {
      const current = checkpointsMap.get(id);
      if (current) checkpointsMap.set(id, { ...current, ...data });
    },
    delete: async (id) => { checkpointsMap.delete(id); },
    deleteByRun: async (runId) => {
      for (const [id, c] of checkpointsMap) {
        if (c.runId === runId) checkpointsMap.delete(id);
      }
    },
  };

  return { generationRuns, generationSteps, generationCheckpoints };
}

describe('Multi-Agent Storage & Run Manager', () => {
  const mockRun: GenerationRun = {
    id: 'run_test_1',
    bookId: 'book_1',
    chapterId: 'chapter_1',
    status: 'pending',
    createdAt: 1000,
    updatedAt: 1000,
    snapshot: {
      storyTitle: '測試小說',
      chapterNumber: 1,
      chapterTitle: '第一章 始動',
      targetWordCount: 3000,
      rolesConfig: DEFAULT_MULTI_AGENT_PREFS.agents,
      criticRubricWeights: DEFAULT_MULTI_AGENT_PREFS.criticRubricWeights,
      criticThresholds: DEFAULT_MULTI_AGENT_PREFS.criticThresholds,
      maxRevisions: 3,
      profilesSnapshot: {
        default: {
          id: 'default',
          name: 'OpenAI GPT-4o',
          provider: 'custom',
          baseUrl: '',
          model: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 4096,
          timeoutSec: 120,
        },
      },
      createdAt: 1000,
    },
  };

  const mockStep: GenerationStep = {
    id: 'step_1',
    runId: 'run_test_1',
    bookId: 'book_1',
    chapterId: 'chapter_1',
    role: 'planner',
    status: 'completed',
    attempt: 1,
    prompt: 'Plan chapter 1',
    response: 'Chapter 1 outline',
    usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
    createdAt: 1050,
    completedAt: 1100,
  };

  const mockCheckpoint: GenerationCheckpoint = {
    id: 'chk_1',
    runId: 'run_test_1',
    bookId: 'book_1',
    chapterId: 'chapter_1',
    stepId: 'step_1',
    stateName: 'outline_generated',
    data: '{"outline": "Chapter 1 outline"}',
    createdAt: 1100,
  };

  describe('SQLite row helpers', () => {
    it('round trips generation runs, steps, and checkpoints', () => {
      expect(rowToGenerationRun(generationRunToRow(mockRun))).toEqual(mockRun);
      expect(rowToGenerationStep(generationStepToRow(mockStep))).toEqual(mockStep);
      expect(rowToGenerationCheckpoint(generationCheckpointToRow(mockCheckpoint))).toEqual(mockCheckpoint);
    });
  });

  describe('Storage contract tests for Multi-Agent stores', () => {
    it('supports add, get, list, update, and delete invariants', async () => {
      const stores = createInMemoryMultiAgentStores();

      await stores.generationRuns.add(mockRun);
      await stores.generationSteps.add(mockStep);
      await stores.generationCheckpoints.add(mockCheckpoint);

      const run = await stores.generationRuns.get(mockRun.id);
      expect(run).toEqual(mockRun);

      const steps = await stores.generationSteps.listByRun(mockRun.id);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toEqual(mockStep);

      const latestChk = await stores.generationCheckpoints.getLatestByRun(mockRun.id);
      expect(latestChk).toEqual(mockCheckpoint);

      const unfinished = await stores.generationRuns.getUnfinishedByChapter('chapter_1');
      expect(unfinished?.id).toBe(mockRun.id);

      await stores.generationRuns.update(mockRun.id, { status: 'completed' });
      const updatedRun = await stores.generationRuns.get(mockRun.id);
      expect(updatedRun?.status).toBe('completed');

      const unfinishedAfterComplete = await stores.generationRuns.getUnfinishedByChapter('chapter_1');
      expect(unfinishedAfterComplete).toBeUndefined();

      await stores.generationRuns.delete(mockRun.id);
      expect(await stores.generationRuns.get(mockRun.id)).toBeUndefined();
      expect(await stores.generationSteps.listByRun(mockRun.id)).toHaveLength(0);
      expect(await stores.generationCheckpoints.listByRun(mockRun.id)).toHaveLength(0);
    });
  });

  describe('Preflight estimation logic', () => {
    it('calculates max steps and cost estimate', () => {
      const estimate = calculatePreflightEstimate(
        3000,
        {
          ...DEFAULT_MULTI_AGENT_PREFS,
          maxRevisions: 3,
          costEstimate: {
            inputCostPerMillion: 2.5,
            outputCostPerMillion: 10,
            currency: 'USD',
            showTokenAndCost: true,
          },
        },
        [
          {
            id: 'default',
            name: 'OpenAI GPT-4o',
            provider: 'custom',
            baseUrl: '',
            apiKey: 'key',
            model: 'gpt-4o',
            temperature: 0.7,
            maxTokens: 4096,
            timeoutSec: 120,
          },
        ],
      );

      expect(estimate.maxStepsCount).toBe(9);
      expect(estimate.rolesCount).toBe(4);
      expect(estimate.rolesSummary).toHaveLength(4);
      expect(estimate.estimatedCost).toBeGreaterThan(0);
    });
  });

  describe('Run Manager helpers', () => {
    beforeEach(() => {
      const memoryStores = createInMemoryMultiAgentStores();
      vi.spyOn(storage.generationRuns, 'getUnfinishedByChapter').mockImplementation(memoryStores.generationRuns.getUnfinishedByChapter);
      vi.spyOn(storage.generationRuns, 'add').mockImplementation(memoryStores.generationRuns.add);
      vi.spyOn(storage.generationRuns, 'get').mockImplementation(memoryStores.generationRuns.get);
      vi.spyOn(storage.generationRuns, 'update').mockImplementation(memoryStores.generationRuns.update);
      vi.spyOn(storage.generationRuns, 'listAll').mockImplementation(memoryStores.generationRuns.listAll);
    });

    it('creates, locks chapter, and cancels run correctly', async () => {
      const run = await createGenerationRun('book_mgr_test', 'ch_mgr_1', '第一章', 1, 2000, '魔幻冒險');
      expect(run.status).toBe('pending');
      expect(run.snapshot.chapterTitle).toBe('第一章');

      await expect(
        createGenerationRun('book_mgr_test', 'ch_mgr_1', '第一章', 1, 2000, '魔幻冒險'),
      ).rejects.toThrow('已有未完成的高品質生成執行');

      const locked = await isChapterLockedByRun('ch_mgr_1');
      expect(locked).toBe(true);

      const profileLocked = await isLLMProfileReferencedByActiveRun('default');
      expect(profileLocked).toBe(true);

      await cancelGenerationRun(run.id);

      const runAfterCancel = await storage.generationRuns.get(run.id);
      expect(runAfterCancel?.status).toBe('cancelled');

      const lockedAfterCancel = await isChapterLockedByRun('ch_mgr_1');
      expect(lockedAfterCancel).toBe(false);
    });
  });
});
