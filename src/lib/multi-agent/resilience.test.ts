import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  registerRunAbortController,
  getRunAbortController,
  cancelRun,
  sanitizeStartupRuns,
} from './resilience';

const runsMap = new Map<string, any>();
const stepsMap = new Map<string, any>();

vi.mock('../storage', () => ({
  storage: {
    generationRuns: {
      listAll: vi.fn(async () => Array.from(runsMap.values())),
      get: vi.fn(async (id: string) => runsMap.get(id)),
      update: vi.fn(async (id: string, data: any) => {
        const cur = runsMap.get(id);
        if (cur) runsMap.set(id, { ...cur, ...data });
      }),
    },
    generationSteps: {
      listByRun: vi.fn(async (runId: string) => (
        Array.from(stepsMap.values()).filter((step) => step.runId === runId)
      )),
      update: vi.fn(async (id: string, data: any) => {
        const cur = stepsMap.get(id);
        if (cur) stepsMap.set(id, { ...cur, ...data });
      }),
    },
  },
}));

vi.mock('../../stores/generationRunStore', () => ({
  syncGenerationRun: vi.fn(async () => undefined),
}));

describe('Multi-Agent Resilience & Recovery', () => {
  beforeEach(() => {
    runsMap.clear();
    stepsMap.clear();
  });

  describe('AbortSignal & Cancellation', () => {
    it('registers AbortController, triggers abort signal on cancel, and updates status to cancelled', async () => {
      runsMap.set('run_c1', { id: 'run_c1', status: 'running' });

      const controller = registerRunAbortController('run_c1');
      expect(getRunAbortController('run_c1')).toBe(controller);
      expect(controller.signal.aborted).toBe(false);

      await cancelRun('run_c1');

      expect(controller.signal.aborted).toBe(true);
      const updated = runsMap.get('run_c1');
      expect(updated.status).toBe('cancelled');
      expect(updated.cancelledAt).toBeDefined();
    });
  });

  describe('Startup Recovery Safety', () => {
    it('normalizes running/pending runs to awaiting_input on startup without sending paid requests', async () => {
      runsMap.set('run_1', { id: 'run_1', status: 'running' });
      runsMap.set('run_2', { id: 'run_2', status: 'pending' });
      runsMap.set('run_3', { id: 'run_3', status: 'completed' });
      runsMap.set('run_4', { id: 'run_4', status: 'cancelled' });

      await sanitizeStartupRuns();

      expect(runsMap.get('run_1').status).toBe('awaiting_input');
      expect(runsMap.get('run_2').status).toBe('awaiting_input');
      expect(runsMap.get('run_3').status).toBe('completed');
      expect(runsMap.get('run_4').status).toBe('cancelled');
    });
  });
});
