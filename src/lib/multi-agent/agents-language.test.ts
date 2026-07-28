import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executePlannerStep } from './planner';
import { executeCriticStep } from './critic';
import { executeEditorStep } from './editor';
import { storage } from '../storage';
import { completeNormalized } from '../llm';
import { useSettingsStore } from '../../stores/settingsStore';

vi.mock('../llm', () => ({
  completeNormalized: vi.fn(),
  complete: vi.fn(),
}));

const mockBook = {
  id: 'b-en',
  title: 'Cyberpunk Chronicles',
  genre: 'scifi',
  style: 'dark',
  worldSetting: 'Neo-Tokyo 2099',
  mainPlot: 'Infiltrate Arasaka Tower',
  chapterOutline: '',
  writingLanguage: 'en' as const,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockChapter = {
  id: 'c-en',
  projectId: 'b-en',
  order: 0,
  title: 'The Cyber-Deck Infiltration',
  targetWords: 2000,
  beat: 'inciting_incident',
  points: 'Jack jacks into the mainframe',
  content: 'Prose here...',
  referenceChapterId: null,
  wikiSyncedAt: null,
  wikiSyncedHash: null,
  wikiSyncStatus: 'unsynced' as const,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockRun = {
  id: 'run-en',
  bookId: 'b-en',
  chapterId: 'c-en',
  status: 'running' as const,
  snapshot: {
    storyTitle: 'Cyberpunk Chronicles',
    chapterTitle: 'The Cyber-Deck Infiltration',
    chapterNumber: 1,
    targetWordCount: 2000,
    rolesConfig: {
      planner: { profileId: 'prof-test' },
      writer: { profileId: 'prof-test' },
      critic: { profileId: 'prof-test' },
      editor: { profileId: 'prof-test' },
    },
    profilesSnapshot: {
      'prof-test': { id: 'prof-test', name: 'Test', provider: 'openai', apiKey: 'key', model: 'gpt-4o' },
    },
    criticThresholds: { humanReviewFloor: 70, passScore: 85 },
    criticRubricWeights: { instructionAndBeat: 20, plotLogic: 20, characterConsistency: 20, contextAndWorld: 20, styleAndQuality: 10, pacingAndStructure: 10 },
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockCheckpoints = [
  {
    id: 'chk-writer',
    runId: 'run-en',
    bookId: 'b-en',
    chapterId: 'c-en',
    stepId: 'step-writer',
    stateName: 'writer_done',
    data: JSON.stringify({ candidateDraft: 'Draft text in English', draftVersion: 1 }),
    createdAt: Date.now(),
  },
  {
    id: 'chk-critic',
    runId: 'run-en',
    bookId: 'b-en',
    chapterId: 'c-en',
    stepId: 'step-critic',
    stateName: 'critic_done',
    data: JSON.stringify({
      draftVersion: 1,
      scores: { instructionAndBeat: 80, plotLogic: 80, characterConsistency: 80, contextAndWorld: 80, styleAndQuality: 80, pacingAndStructure: 80 },
      totalScore: 80,
      hasMajorFlaw: false,
      summary: 'Good draft',
      requiredChanges: ['Polish sensory details'],
    }),
    createdAt: Date.now() + 10,
  },
];

vi.mock('../storage', () => ({
  storage: {
    generationRuns: {
      get: vi.fn(async () => mockRun),
      update: vi.fn(async () => {}),
    },
    generationCheckpoints: {
      listByRun: vi.fn(async () => mockCheckpoints),
      add: vi.fn(async () => {}),
    },
    generationSteps: {
      add: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
      listByRun: vi.fn(async () => []),
    },
    projects: {
      get: vi.fn(async () => mockBook),
    },
    chapters: {
      get: vi.fn(async () => mockChapter),
      update: vi.fn(async () => {}),
    },
    versions: {
      listByChapterDesc: vi.fn(async () => []),
      add: vi.fn(async () => {}),
    },
    wikiPages: { listAll: vi.fn(async () => []) },
    characters: { listByProject: vi.fn(async () => []) },
  },
}));

describe('Multi-Agent Language Boundary (Ticket #23)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      activeProfileId: 'prof-test',
      llmProfiles: [
        { id: 'prof-test', name: 'Test', provider: 'openai', apiKey: 'test-key', model: 'gpt-4o' },
      ],
    });
  });

  it('uses English System Prompt and resolves beat in English for Planner', async () => {
    vi.mocked(completeNormalized).mockResolvedValue({
      text: JSON.stringify({ beat: 'Inciting Incident', points: 'Hack Arasaka mainframe', sceneOutlines: [] }),
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      finishReason: 'stop',
    });

    await executePlannerStep('run-en');

    const options = vi.mocked(completeNormalized).mock.calls[0][1];
    expect(options.systemPrompt).toContain('You are a professional novel planner');
  });

  it('uses English System Prompt for Critic on English books', async () => {
    vi.mocked(completeNormalized).mockResolvedValue({
      text: JSON.stringify({
        draftVersion: 1,
        scores: { instructionAndBeat: 90, plotLogic: 90, characterConsistency: 90, contextAndWorld: 90, styleAndQuality: 90, pacingAndStructure: 90 },
        totalScore: 90,
        hasMajorFlaw: false,
        summary: 'Good draft',
        requiredChanges: [],
      }),
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      finishReason: 'stop',
    });

    await executeCriticStep('run-en', 'Draft text in English', 1);

    const options = vi.mocked(completeNormalized).mock.calls[0][1];
    expect(options.systemPrompt).toContain('You are a rigorous fiction editor and literary critic');
  });

  it('uses English System Prompt for Editor on English books', async () => {
    vi.mocked(completeNormalized).mockResolvedValue({
      text: 'Revised English prose content',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      finishReason: 'stop',
    });

    await executeEditorStep('run-en');

    const options = vi.mocked(completeNormalized).mock.calls[0][1];
    expect(options.systemPrompt).toContain('You are a professional fiction editor');
  });
});
