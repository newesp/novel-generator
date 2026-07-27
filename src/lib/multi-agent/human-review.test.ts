import { describe, expect, it, vi, beforeEach } from 'vitest';
import { humanAdoptDraft, prepareHumanEditorRevision, humanEditDraft } from './human-review';
import { useSettingsStore } from '../../stores/settingsStore';

const runsMap = new Map<string, any>();
const stepsMap = new Map<string, any>();
const checkpointsMap = new Map<string, any>();
const chaptersMap = new Map<string, any>();
const versionsMap = new Map<string, any>();

vi.mock('../storage', () => ({
  storage: {
    generationRuns: {
      get: vi.fn(async (id: string) => runsMap.get(id)),
      update: vi.fn(async (id: string, data: any) => {
        const cur = runsMap.get(id);
        if (cur) runsMap.set(id, { ...cur, ...data });
      }),
    },
    generationSteps: {
      listByRun: vi.fn(async (runId: string) => Array.from(stepsMap.values()).filter((s) => s.runId === runId)),
      add: vi.fn(async (step: any) => { stepsMap.set(step.id, step); }),
    },
    generationCheckpoints: {
      listByRun: vi.fn(async (runId: string) => Array.from(checkpointsMap.values()).filter((c) => c.runId === runId)),
      add: vi.fn(async (chk: any) => { checkpointsMap.set(chk.id, chk); }),
    },
    chapters: {
      get: vi.fn(async (id: string) => chaptersMap.get(id)),
      update: vi.fn(async (id: string, data: any) => {
        const cur = chaptersMap.get(id);
        if (cur) chaptersMap.set(id, { ...cur, ...data });
      }),
    },
    versions: {
      listByChapterDesc: vi.fn(async () => []),
      add: vi.fn(async (v: any) => { versionsMap.set(v.id, v); }),
    },
  },
}));

describe('Human Review & Branching', () => {
  beforeEach(() => {
    runsMap.clear();
    stepsMap.clear();
    checkpointsMap.clear();
    chaptersMap.clear();
    versionsMap.clear();
    useSettingsStore.setState({
      activeProfileId: 'default',
      llmProfiles: [{ id: 'default', name: 'GPT-4o', provider: 'custom', baseUrl: 'http://localhost/v1', apiKey: 'key', model: 'gpt-4o', temperature: 0.7, maxTokens: 4000, timeoutSec: 120 }],
    });
  });

  it('allows human direct adoption of candidate draft (human_pass)', async () => {
    const run = { id: 'run_h1', bookId: 'b1', chapterId: 'c1', status: 'awaiting_input' };
    runsMap.set('run_h1', run);
    chaptersMap.set('c1', { id: 'c1', projectId: 'b1', title: '第一章', content: '舊正文' });

    checkpointsMap.set('chk_w', {
      id: 'chk_w',
      runId: 'run_h1',
      stateName: 'writer_done',
      data: JSON.stringify({ candidateDraft: '人工認可之草稿', draftVersion: 1 }),
      createdAt: 1000,
    });

    await humanAdoptDraft('run_h1');

    expect(chaptersMap.get('c1').content).toBe('人工認可之草稿');
    const updatedRun = runsMap.get('run_h1');
    expect(updatedRun.status).toBe('completed');
    expect(updatedRun.summary.finalDecision).toBe('human_pass');
  });

  it('allows human manual edit of candidate draft, producing draftVersion 2 and human_edited checkpoint', async () => {
    const run = { id: 'run_h2', bookId: 'b1', chapterId: 'c1', status: 'awaiting_input' };
    runsMap.set('run_h2', run);

    checkpointsMap.set('chk_w', {
      id: 'chk_w',
      runId: 'run_h2',
      stateName: 'writer_done',
      data: JSON.stringify({ candidateDraft: '舊草稿', draftVersion: 1 }),
      createdAt: 1000,
    });

    const res = await humanEditDraft('run_h2', '人工修改後的新完美正文');
    expect(res.draftVersion).toBe(2);
    expect(res.checkpoint.stateName).toBe('human_edited');

    const chkData = JSON.parse(res.checkpoint.data);
    expect(chkData.candidateDraft).toBe('人工修改後的新完美正文');
    expect(chkData.draftVersion).toBe(2);
  });

  it('allows sending to Editor with custom direction and authorized extra revision', async () => {
    const run = {
      id: 'run_h3',
      bookId: 'b1',
      chapterId: 'c1',
      status: 'awaiting_input',
      snapshot: { maxRevisions: 3 },
    };
    runsMap.set('run_h3', run);

    await prepareHumanEditorRevision('run_h3', '請重點描寫對話張力', true);

    expect(runsMap.get('run_h3').snapshot.maxRevisions).toBe(4); // 3 + 1
  });
});
