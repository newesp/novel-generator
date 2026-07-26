import { describe, expect, it, vi, beforeEach } from 'vitest';
import { executeWriterStep } from './writer';
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
  },
}));

vi.mock('../llm', async (importOriginal) => {
  const actual = await importOriginal<typeof llmModule>();
  return {
    ...actual,
    completeNormalized: vi.fn().mockResolvedValue({
      text: '這是 Writer 生成的第一章草稿內文...',
      usage: { promptTokens: 300, completionTokens: 500, totalTokens: 800 },
      requestId: 'req_writer_test',
      finishReason: 'stop',
    }),
  };
});

import { useSettingsStore } from '../../stores/settingsStore';

describe('Writer Step Execution', () => {
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
          apiKey: 'test-api-key',
          model: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 4000,
          timeoutSec: 120,
        },
      ],
    });
  });

  it('executes Writer step, generates candidate draft v1, and creates writer_done checkpoint without mutating Chapter.content', async () => {
    const run = {
      id: 'run_w1',
      bookId: 'p_w',
      chapterId: 'c_w',
      status: 'running',
      snapshot: {
        storyTitle: 'Writer 測試故事',
        chapterNumber: 1,
        chapterTitle: '第一章',
        targetWordCount: 2000,
        rolesConfig: {
          writer: { profileId: null, roleGuidance: '作答寫作指引' },
        },
        profilesSnapshot: {
          default: { id: 'default', name: 'GPT-4o', model: 'gpt-4o' },
        },
      },
    };
    runsMap.set(run.id, run);
    projectsMap.set('p_w', { id: 'p_w', title: 'Writer 測試故事', worldSetting: '奇幻' });
    chaptersMap.set('c_w', { id: 'c_w', projectId: 'p_w', title: '第一章', order: 0, content: '原始正文' });

    // Approved planner checkpoint
    checkpointsMap.set('chk_p', {
      id: 'chk_p',
      runId: run.id,
      stateName: 'planner_reviewed',
      data: JSON.stringify({ beat: '衝突升級', points: '核准的細綱要點' }),
    });

    const result = await executeWriterStep(run.id);

    expect(result.candidateDraft).toBe('這是 Writer 生成的第一章草稿內文...');
    expect(result.draftVersion).toBe(1);
    expect(result.checkpoint.stateName).toBe('writer_done');

    // Chapter.content must NOT be mutated
    const chapter = chaptersMap.get('c_w');
    expect(chapter.content).toBe('原始正文');

    // Verify checkpoint recorded candidateDraft
    const writerChk = checkpointsMap.get(result.checkpoint.id);
    expect(writerChk).toBeDefined();
    const chkData = JSON.parse(writerChk.data);
    expect(chkData.candidateDraft).toBe('這是 Writer 生成的第一章草稿內文...');
    expect(chkData.draftVersion).toBe(1);
  });
});
