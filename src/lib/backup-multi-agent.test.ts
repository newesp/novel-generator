import { describe, expect, it, vi, beforeEach } from 'vitest';
import { exportSnapshot, importSnapshot } from './backup';

const runsMap = new Map<string, any>();
const stepsMap = new Map<string, any>();
const checkpointsMap = new Map<string, any>();

vi.mock('./storage', () => ({
  storage: {
    projects: { list: vi.fn(async () => []) },
    chapters: { list: vi.fn(async () => []) },
    versions: { list: vi.fn(async () => []) },
    characters: { list: vi.fn(async () => []) },
    wikiPages: { listAll: vi.fn(async () => []) },
    wikiLog: { listAll: vi.fn(async () => []) },
    comics: { listAll: vi.fn(async () => []) },
    comicPanels: { listAll: vi.fn(async () => []) },
    comicPanelImageVariants: { listAll: vi.fn(async () => []) },
    mediaAssets: { listAll: vi.fn(async () => []) },
    sceneVisuals: { listAll: vi.fn(async () => []) },
    generationRuns: { listAll: vi.fn(async () => Array.from(runsMap.values())) },
    generationSteps: { listAll: vi.fn(async () => Array.from(stepsMap.values())) },
    generationCheckpoints: { listAll: vi.fn(async () => Array.from(checkpointsMap.values())) },
    replaceAll: vi.fn(async (bundle: any) => {
      runsMap.clear();
      stepsMap.clear();
      checkpointsMap.clear();
      for (const r of bundle.generationRuns ?? []) runsMap.set(r.id, r);
      for (const s of bundle.generationSteps ?? []) stepsMap.set(s.id, s);
      for (const c of bundle.generationCheckpoints ?? []) checkpointsMap.set(c.id, c);
    }),
  },
}));

describe('Multi-Agent JSON Backup & Restore', () => {
  beforeEach(() => {
    runsMap.clear();
    stepsMap.clear();
    checkpointsMap.clear();
  });

  it('exports snapshot stripping API keys and includes full agent trace by default', async () => {
    runsMap.set('r1', {
      id: 'r1',
      bookId: 'b1',
      chapterId: 'c1',
      status: 'completed',
      snapshot: {
        profilesSnapshot: {
          default: { id: 'default', name: 'Profile', apiKey: 'SECRET_API_KEY_123', baseUrl: 'http://api' },
        },
      },
    });

    stepsMap.set('s1', { id: 's1', runId: 'r1', prompt: '詳細 Prompt 內容', response: '詳細 Response 內容' });

    const snapshot = await exportSnapshot({ includeFullAgentTrace: true });

    // Verify API Key is completely stripped
    const exportedProfile = snapshot.generationRuns?.[0]?.snapshot?.profilesSnapshot?.default as any;
    expect(exportedProfile.apiKey).toBeUndefined();
    expect(exportedProfile.name).toBe('Profile');

    // Verify full trace is retained
    expect(snapshot.generationSteps?.[0]?.prompt).toBe('詳細 Prompt 內容');
  });

  it('excludes large trace payload when includeFullAgentTrace is false', async () => {
    runsMap.set('r1', { id: 'r1', bookId: 'b1', chapterId: 'c1', status: 'completed' });
    stepsMap.set('s1', { id: 's1', runId: 'r1', prompt: '大型 Prompt', response: '大型 Response' });

    const snapshot = await exportSnapshot({ includeFullAgentTrace: false });

    expect(snapshot.generationSteps?.[0]?.prompt).toBe('[備份匯出已排除軌跡內容]');
    expect(snapshot.generationSteps?.[0]?.response).toBe('[備份匯出已排除軌跡內容]');
  });

  it('restores snapshot safely and normalizes running runs to awaiting_input without firing paid LLM calls', async () => {
    const legacySnapshot: any = {
      schema: 2,
      exportedAt: 1000,
      app: 'novel-generator',
      projects: [],
      chapters: [],
      versions: [],
      characters: [],
      generationRuns: [
        { id: 'r_running', bookId: 'b1', chapterId: 'c1', status: 'running' },
      ],
      generationSteps: [],
      generationCheckpoints: [],
    };

    await importSnapshot(legacySnapshot);

    const restoredRun = runsMap.get('r_running');
    expect(restoredRun).toBeDefined();
    expect(restoredRun.status).toBe('awaiting_input');
  });
});
