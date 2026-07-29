import { describe, expect, it, vi, beforeEach } from 'vitest';
import { executeEditorStep } from './editor';
import { executeCriticStep } from './critic';
import { DEFAULT_MULTI_AGENT_PREFS, useSettingsStore } from '../../stores/settingsStore';
import * as llmModule from '../llm';

const runsMap = new Map<string, any>();
const stepsMap = new Map<string, any>();
const checkpointsMap = new Map<string, any>();
const projectsMap = new Map<string, any>();
const chaptersMap = new Map<string, any>();

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
      update: vi.fn(async (id: string, data: any) => {
        const cur = stepsMap.get(id);
        if (cur) stepsMap.set(id, { ...cur, ...data });
      }),
    },
    generationCheckpoints: {
      listByRun: vi.fn(async (runId: string) => Array.from(checkpointsMap.values()).filter((c) => c.runId === runId)),
      add: vi.fn(async (chk: any) => { checkpointsMap.set(chk.id, chk); }),
    },
    projects: {
      get: vi.fn(async (id: string) => projectsMap.get(id)),
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
      add: vi.fn(),
    },
  },
}));

vi.mock('../llm', async (importOriginal) => {
  const actual = await importOriginal<typeof llmModule>();
  return {
    ...actual,
    completeNormalized: vi.fn(),
  };
});

describe('Editor Revision Loop & maxRevisions Limit', () => {
  beforeEach(() => {
    runsMap.clear();
    stepsMap.clear();
    checkpointsMap.clear();
    projectsMap.clear();
    chaptersMap.clear();
    useSettingsStore.setState({
      activeProfileId: 'default',
      llmProfiles: [
        {
          id: 'default',
          name: 'GPT-4o',
          provider: 'custom',
          baseUrl: 'http://localhost/v1',
          apiKey: 'key',
          model: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 4000,
          timeoutSec: 120,
        },
      ],
    });
  });

  it('rejects Editor step if Critic feedback version mismatches draftVersion', async () => {
    const run = {
      id: 'run_ed_mismatch',
      bookId: 'b1',
      chapterId: 'c1',
      status: 'running',
      snapshot: {
        rolesConfig: DEFAULT_MULTI_AGENT_PREFS.agents,
        criticRubricWeights: DEFAULT_MULTI_AGENT_PREFS.criticRubricWeights,
        criticThresholds: DEFAULT_MULTI_AGENT_PREFS.criticThresholds,
        maxRevisions: 3,
        profilesSnapshot: { default: { id: 'default', name: 'GPT-4o' } },
      },
    };
    runsMap.set('run_ed_mismatch', run);

    checkpointsMap.set('chk_w', {
      id: 'chk_w',
      runId: 'run_ed_mismatch',
      stateName: 'writer_done',
      data: JSON.stringify({ candidateDraft: '初稿', draftVersion: 1 }),
      createdAt: 1000,
    });

    // Mismatched Critic checkpoint version (v2 instead of v1)
    checkpointsMap.set('chk_c', {
      id: 'chk_c',
      runId: 'run_ed_mismatch',
      stateName: 'critic_done',
      data: JSON.stringify({ draftVersion: 2, scores: { instructionAndBeat: 70 }, requiredChanges: ['改進項'] }),
      createdAt: 1001,
    });

    await expect(executeEditorStep('run_ed_mismatch')).rejects.toThrow('Critic feedback 版本 (v2) 與當前草稿版本 (v1) 不符');
  });

  it('stops automatic revision when maxRevisions limit is reached', async () => {
    const run = {
      id: 'run_max_rev',
      bookId: 'b1',
      chapterId: 'c1',
      status: 'running',
      snapshot: {
        rolesConfig: DEFAULT_MULTI_AGENT_PREFS.agents,
        criticRubricWeights: DEFAULT_MULTI_AGENT_PREFS.criticRubricWeights,
        criticThresholds: DEFAULT_MULTI_AGENT_PREFS.criticThresholds,
        maxRevisions: 2,
        profilesSnapshot: { default: { id: 'default', name: 'GPT-4o' } },
      },
    };
    runsMap.set('run_max_rev', run);

    // Simulate 2 completed Editor steps
    stepsMap.set('s_ed1', { id: 's_ed1', runId: 'run_max_rev', role: 'editor', status: 'completed' });
    stepsMap.set('s_ed2', { id: 's_ed2', runId: 'run_max_rev', role: 'editor', status: 'completed' });

    checkpointsMap.set('chk_w', {
      id: 'chk_w',
      runId: 'run_max_rev',
      stateName: 'editor_done',
      data: JSON.stringify({ candidateDraft: '第二版草稿', draftVersion: 3 }),
      createdAt: 1000,
    });

    checkpointsMap.set('chk_c', {
      id: 'chk_c',
      runId: 'run_max_rev',
      stateName: 'critic_done',
      data: JSON.stringify({ draftVersion: 3, scores: { instructionAndBeat: 70 }, requiredChanges: ['改進項'] }),
      createdAt: 1001,
    });

    await expect(executeEditorStep('run_max_rev')).rejects.toThrow('最高 Editor 修訂上限 (2 次)');
    expect(runsMap.get('run_max_rev').status).toBe('awaiting_input');
  });

  it('executes Editor step, increments draftVersion to 2, and routes to Critic which adopts when high score', async () => {
    const run = {
      id: 'run_ed_success',
      bookId: 'b1',
      chapterId: 'c1',
      status: 'running',
      snapshot: {
        rolesConfig: DEFAULT_MULTI_AGENT_PREFS.agents,
        criticRubricWeights: DEFAULT_MULTI_AGENT_PREFS.criticRubricWeights,
        criticThresholds: { passScore: 85, humanReviewFloor: 80 },
        maxRevisions: 3,
        profilesSnapshot: { default: { id: 'default', name: 'GPT-4o' } },
      },
    };
    runsMap.set('run_ed_success', run);
    chaptersMap.set('c1', { id: 'c1', projectId: 'b1', title: '第一章', content: '舊正文' });

    checkpointsMap.set('chk_w', {
      id: 'chk_w',
      runId: 'run_ed_success',
      stateName: 'writer_done',
      data: JSON.stringify({ candidateDraft: '初稿正文', draftVersion: 1 }),
      createdAt: 1000,
    });

    checkpointsMap.set('chk_c1', {
      id: 'chk_c1',
      runId: 'run_ed_success',
      stateName: 'critic_done',
      data: JSON.stringify({ draftVersion: 1, scores: { instructionAndBeat: 75, plotLogic: 75, characterConsistency: 75, contextAndWorld: 75, styleAndQuality: 75, pacingAndStructure: 75 }, requiredChanges: ['深化心理描寫'] }),
      createdAt: 1001,
    });

    // Mock Editor output
    (llmModule.completeNormalized as any).mockResolvedValueOnce({
      text: '修訂後的第二版精采正文...',
      usage: { promptTokens: 300, completionTokens: 600, totalTokens: 900 },
      requestId: 'req_editor_1',
    });

    // Mock subsequent Critic output for v2 (score 90 >= passScore 85)
    (llmModule.completeNormalized as any).mockResolvedValueOnce({
      text: JSON.stringify({
        draftVersion: 2,
        scores: { instructionAndBeat: 90, plotLogic: 90, characterConsistency: 90, contextAndWorld: 90, styleAndQuality: 90, pacingAndStructure: 90 },
        hasMajorFlaw: false,
      }),
      usage: { promptTokens: 200, completionTokens: 300, totalTokens: 500 },
      requestId: 'req_critic_2',
    });

    const result = await executeEditorStep('run_ed_success');
    expect(result.nextDraftVersion).toBe(2);
    expect(result.revisedDraft).toBe('修訂後的第二版精采正文...');

    await executeCriticStep('run_ed_success');

    // Chapter.content is updated to revised draft v2 upon Critic adoption
    expect(chaptersMap.get('c1').content).toBe('修訂後的第二版精采正文...');
    expect(runsMap.get('run_ed_success').status).toBe('completed');
  });
});
