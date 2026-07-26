import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  recalculateTotalScore,
  parseCriticResponse,
  executeCriticStep,
} from './critic';
import { DEFAULT_MULTI_AGENT_PREFS, useSettingsStore } from '../../stores/settingsStore';
import * as llmModule from '../llm';

const weights = DEFAULT_MULTI_AGENT_PREFS.criticRubricWeights; // 20, 20, 20, 15, 15, 10

const runsMap = new Map<string, any>();
const stepsMap = new Map<string, any>();
const checkpointsMap = new Map<string, any>();
const projectsMap = new Map<string, any>();
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
      listByChapterDesc: vi.fn(async (chapterId: string) => Array.from(versionsMap.values()).filter((v) => v.chapterId === chapterId)),
      add: vi.fn(async (v: any) => { versionsMap.set(v.id, v); }),
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

describe('Critic Module & Adoption', () => {
  beforeEach(() => {
    runsMap.clear();
    stepsMap.clear();
    checkpointsMap.clear();
    projectsMap.clear();
    chaptersMap.clear();
    versionsMap.clear();
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

  describe('recalculateTotalScore', () => {
    it('correctly calculates weighted total score according to rubric weights', () => {
      const scores = {
        instructionAndBeat: 100, // 20
        plotLogic: 90,           // 18
        characterConsistency: 80,// 16
        contextAndWorld: 90,     // 13.5
        styleAndQuality: 80,      // 12
        pacingAndStructure: 70,  // 7
      };
      // Sum = 20 + 18 + 16 + 13.5 + 12 + 7 = 86.5
      const total = recalculateTotalScore(scores, weights);
      expect(total).toBe(86.5);
    });
  });

  describe('parseCriticResponse', () => {
    it('parses valid response and recalculates totalScore', () => {
      const raw = JSON.stringify({
        draftVersion: 1,
        scores: {
          instructionAndBeat: 90,
          plotLogic: 90,
          characterConsistency: 90,
          contextAndWorld: 90,
          styleAndQuality: 90,
          pacingAndStructure: 90,
        },
        hasMajorFlaw: false,
        majorFlawReason: '',
        draftEvidence: '段落引文',
        requiredChanges: [],
      });

      const parsed = parseCriticResponse(raw, 1, weights);
      expect(parsed.draftVersion).toBe(1);
      expect(parsed.totalScore).toBe(90);
      expect(parsed.hasMajorFlaw).toBe(false);
    });

    it('rejects response if draftVersion mismatches', () => {
      const raw = JSON.stringify({
        draftVersion: 2,
        scores: { instructionAndBeat: 90 },
      });
      expect(() => parseCriticResponse(raw, 1, weights)).toThrow('與期待評審的版本 (v1) 不符');
    });
  });

  describe('executeCriticStep & Automatic Adoption', () => {
    it('automatically adopts high score draft (score >= 85 & no major flaw)', async () => {
      const run = {
        id: 'run_critic_1',
        bookId: 'b1',
        chapterId: 'c1',
        status: 'running',
        snapshot: {
          rolesConfig: DEFAULT_MULTI_AGENT_PREFS.agents,
          criticRubricWeights: DEFAULT_MULTI_AGENT_PREFS.criticRubricWeights,
          criticThresholds: { passScore: 85, humanReviewFloor: 80 },
          profilesSnapshot: { default: { id: 'default', name: 'GPT-4o' } },
        },
      };
      runsMap.set('run_critic_1', run);
      chaptersMap.set('c1', { id: 'c1', projectId: 'b1', title: '第一章', content: '舊正文' });

      // Writer draft checkpoint
      checkpointsMap.set('chk_w', {
        id: 'chk_w',
        runId: 'run_critic_1',
        stateName: 'writer_done',
        data: JSON.stringify({ candidateDraft: '高品質新章節草稿正文', draftVersion: 1 }),
        createdAt: 1000,
      });

      // Mock LLM returning 90 score
      (llmModule.completeNormalized as any).mockResolvedValueOnce({
        text: JSON.stringify({
          draftVersion: 1,
          scores: { instructionAndBeat: 90, plotLogic: 90, characterConsistency: 90, contextAndWorld: 90, styleAndQuality: 90, pacingAndStructure: 90 },
          hasMajorFlaw: false,
        }),
        usage: { promptTokens: 200, completionTokens: 300, totalTokens: 500 },
        requestId: 'req_critic_1',
      });

      const res = await executeCriticStep('run_critic_1');
      expect(res.adopted).toBe(true);
      expect(res.feedback.totalScore).toBe(90);

      // Verify Chapter.content is updated and old content is backed up to ChapterVersion
      const chapter = chaptersMap.get('c1');
      expect(chapter.content).toBe('高品質新章節草稿正文');

      const versions = Array.from(versionsMap.values());
      expect(versions).toHaveLength(1);
      expect(versions[0].content).toBe('舊正文');

      // Verify run status is completed
      const updatedRun = runsMap.get('run_critic_1');
      expect(updatedRun.status).toBe('completed');
    });

    it('blocks adoption if major flaw exists even if totalScore >= 85', async () => {
      const run = {
        id: 'run_critic_flaw',
        bookId: 'b1',
        chapterId: 'c1',
        status: 'running',
        snapshot: {
          rolesConfig: DEFAULT_MULTI_AGENT_PREFS.agents,
          criticRubricWeights: DEFAULT_MULTI_AGENT_PREFS.criticRubricWeights,
          criticThresholds: { passScore: 85, humanReviewFloor: 80 },
          profilesSnapshot: { default: { id: 'default', name: 'GPT-4o' } },
        },
      };
      runsMap.set('run_critic_flaw', run);
      chaptersMap.set('c1', { id: 'c1', projectId: 'b1', title: '第一章', content: '舊正文' });

      checkpointsMap.set('chk_w', {
        id: 'chk_w',
        runId: 'run_critic_flaw',
        stateName: 'writer_done',
        data: JSON.stringify({ candidateDraft: '矛盾正文', draftVersion: 1 }),
        createdAt: 1000,
      });

      (llmModule.completeNormalized as any).mockResolvedValueOnce({
        text: JSON.stringify({
          draftVersion: 1,
          scores: { instructionAndBeat: 95, plotLogic: 95, characterConsistency: 95, contextAndWorld: 95, styleAndQuality: 95, pacingAndStructure: 95 },
          hasMajorFlaw: true,
          majorFlawReason: '與 Wiki 設定核心矛盾',
        }),
        usage: { promptTokens: 200, completionTokens: 300, totalTokens: 500 },
      });

      const res = await executeCriticStep('run_critic_flaw');
      expect(res.adopted).toBe(false);
      expect(res.feedback.hasMajorFlaw).toBe(true);

      // Chapter.content must NOT be updated
      const chapter = chaptersMap.get('c1');
      expect(chapter.content).toBe('舊正文');
    });
  });
});
