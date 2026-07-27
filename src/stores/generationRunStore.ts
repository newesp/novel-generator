import { create } from 'zustand';
import { storage } from '../lib/storage';
import type { GenerationRun } from '../types';

interface GenerationRunState {
  runs: GenerationRun[];
  initialized: boolean;
  replaceAll: (runs: GenerationRun[]) => void;
  upsert: (run: GenerationRun) => void;
  remove: (runId: string) => void;
  refreshAll: () => Promise<void>;
  refreshRun: (runId: string) => Promise<void>;
}

function sortRuns(runs: GenerationRun[]): GenerationRun[] {
  return [...runs].sort((a, b) => b.createdAt - a.createdAt);
}

export const useGenerationRunStore = create<GenerationRunState>((set) => ({
  runs: [],
  initialized: false,
  replaceAll: (runs) => set({ runs: sortRuns(runs), initialized: true }),
  upsert: (run) => set((state) => ({
    runs: sortRuns([run, ...state.runs.filter((item) => item.id !== run.id)]),
  })),
  remove: (runId) => set((state) => ({
    runs: state.runs.filter((item) => item.id !== runId),
  })),
  refreshAll: async () => {
    const runs = await storage.generationRuns.listAll();
    set({ runs: sortRuns(runs), initialized: true });
  },
  refreshRun: async (runId) => {
    const run = await storage.generationRuns.get(runId);
    if (!run) {
      set((state) => ({ runs: state.runs.filter((item) => item.id !== runId) }));
      return;
    }
    set((state) => ({
      runs: sortRuns([run, ...state.runs.filter((item) => item.id !== runId)]),
    }));
  },
}));

export async function syncGenerationRun(runId: string): Promise<void> {
  await useGenerationRunStore.getState().refreshRun(runId);
}
