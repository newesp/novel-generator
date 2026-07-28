import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ImageProviderId, LLMConfig, LLMProfile, MultiAgentPrefs } from '../types';

import {
  DEFAULT_CHAPTER_DRAFTS_TEMPLATE,
  DEFAULT_CHAPTER_CONTINUATION_RULES,
  DEFAULT_CHAPTER_CONTENT_TEMPLATE,
  DEFAULT_CHAPTER_POINTS_TEMPLATE,
  DEFAULT_CHARACTER_DRAFTS_TEMPLATE,
  DEFAULT_INLINE_ADJUST_TEMPLATE,
  DEFAULT_COMIC_STORYBOARD_TEMPLATE,
  DEFAULT_WIKI_INGEST_PLAN_TEMPLATE,
  DEFAULT_WIKI_INGEST_CREATE_TEMPLATE,
  DEFAULT_WIKI_INGEST_UPDATE_TEMPLATE,
  DEFAULT_WIKI_QUERY_ANSWER_TEMPLATE,
  DEFAULT_LINT_UNRECORDED_VERIFY_TEMPLATE,
  DEFAULT_LINT_WIKI_CONTRADICT_TEMPLATE,
  DEFAULT_LINT_WIKI_VS_CHAPTER_TEMPLATE,
  DEFAULT_LINT_FIX_SUGGEST_TEMPLATE,
} from '../lib/prompt-defaults';
import { DEFAULT_LINT_PREFS, type LintPrefs } from '../lib/lint/types';
import {
  detectInitialLocale,
  mapLocaleToDefaultWritingLanguage,
  type GeneralPrefs,
} from '../lib/language-policy';

// 為了相容舊 import 路徑，re-export
export { DEFAULT_CHAPTER_CONTINUATION_RULES };

export type InlineEditContextMode = 'window' | 'full';

export interface InlineEditPrefs {
  contextMode: InlineEditContextMode;
  contextChars: number;
}

import {
  DEFAULT_PROMPT_PAIRS_ZH,
  DEFAULT_PROMPT_PAIRS_EN,
  getDefaultPromptPair,
  type PromptPair,
  type PromptTargetKey,
} from '../lib/language-policy';

export interface AIPromptPrefs {
  /** Target Prompt Pairs (Ticket #19) */
  chapterDrafts?: PromptPair;
  chapterOutline?: PromptPair;
  characterProfile?: PromptPair;
  expandContent?: PromptPair;
  polishContent?: PromptPair;
  summaryGeneration?: PromptPair;
  wikiIngest?: PromptPair;

  /** #1 章節骨架 prompt 模板（含接續模式） */
  chapterDraftsTemplate: string;
  /** 接續硬性規則（被插入 chapterDraftsTemplate 的接續規則區段） */
  chapterContinuationRules: string;
  /** #2 章節正文 prompt 模板 */
  chapterContentTemplate: string;
  /** #3 重新生成章節要點 prompt 模板 */
  chapterPointsTemplate: string;
  /** #3.5 角色生成 prompt 模板 */
  characterDraftsTemplate: string;
  /** #4 局部段落改寫 prompt 模板 */
  inlineAdjustTemplate: string;
  /** #4.5 漫畫分鏡 prompt 模板 */
  comicStoryboardTemplate: string;
  /** #5 Wiki ingest — Plan pass */
  wikiIngestPlanTemplate: string;
  /** #6 Wiki ingest — Apply create */
  wikiIngestCreateTemplate: string;
  /** #7 Wiki ingest — Apply update */
  wikiIngestUpdateTemplate: string;
  /** #8 Wiki query — Answer */
  wikiQueryAnswerTemplate: string;
  /** #9 Lint — 未登錄角色 verify */
  lintUnrecordedVerifyTemplate: string;
  /** #10 Lint — Wiki 內部矛盾 */
  lintWikiContradictTemplate: string;
  /** #11 Lint — Wiki vs 章節 */
  lintWikiVsChapterTemplate: string;
  /** #12 Lint — 修改建議 */
  lintFixSuggestTemplate: string;
}

export function getPromptPair(
  prefs: AIPromptPrefs,
  target: PromptTargetKey,
  locale: 'zh-TW' | 'en' = 'zh-TW',
): PromptPair {
  const customPair = prefs[target];
  const zhDefault = DEFAULT_PROMPT_PAIRS_ZH[target];
  const enDefault = DEFAULT_PROMPT_PAIRS_EN[target];

  if (!customPair) {
    return getDefaultPromptPair(target, locale);
  }

  // 若使用者未自訂（仍為全域預設的繁中模版），當請求語系為 en 時自動切換成 en 預設模版
  if (
    locale === 'en' &&
    customPair.systemPrompt === zhDefault.systemPrompt &&
    customPair.userPromptTemplate === zhDefault.userPromptTemplate
  ) {
    return enDefault;
  }

  return customPair;
}

export interface WikiPrefs {
  /** Wiki 區塊佔 context window 的比例（spec §5.3） */
  budgetRatio: number;
  /** 連續超預算警告閾值，到達後 UI 強烈建議 pick-pages */
  overflowWarnThreshold: number;
  /** 優先使用 pick-pages 選頁策略 */
  enablePickPages: boolean;
}

export interface ImageGenerationPrefs {
  providerId: ImageProviderId;
  width: number;
  height: number;
  stylePreset: string;
  targetPanelCount: number;
  comfyui: {
    baseUrl: string;
    workflowJson: string;
    promptNodeId: string;
    negativePromptNodeId: string;
    seedNodeId: string;
    widthNodeId: string;
    heightNodeId: string;
    outputNodeId: string;
    referenceImageNodeIds: string[];
  };
  openaiCompatible: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  deepinfraFlux: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  googleGeminiImage: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
}

const DEFAULT_WIKI_PREFS: WikiPrefs = {
  budgetRatio: 0.25,
  overflowWarnThreshold: 3,
  enablePickPages: false,
};

const DEFAULT_IMAGE_GENERATION_PREFS: ImageGenerationPrefs = {
  providerId: 'comfyui',
  width: 1024,
  height: 1024,
  stylePreset: 'cinematic black and white manga, consistent character designs',
  targetPanelCount: 8,
  comfyui: {
    baseUrl: 'http://127.0.0.1:8188',
    workflowJson: '',
    promptNodeId: '',
    negativePromptNodeId: '',
    seedNodeId: '',
    widthNodeId: '',
    heightNodeId: '',
    outputNodeId: '',
    referenceImageNodeIds: [],
  },
  openaiCompatible: {
    baseUrl: '',
    apiKey: '',
    model: 'gpt-image-1',
  },
  deepinfraFlux: {
    baseUrl: 'https://api.deepinfra.com/v1',
    apiKey: '',
    model: 'black-forest-labs/FLUX-2-pro',
  },
  googleGeminiImage: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
    apiKey: '',
    model: 'gemini-3.1-flash-image',
  },
};

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export const DEFAULT_MULTI_AGENT_PREFS: MultiAgentPrefs = {
  agents: {
    planner: {
      profileId: null,
      roleGuidance: '根據章節節拍、要點、上下文與知識資料產生章節細綱。',
    },
    writer: {
      profileId: null,
      roleGuidance: '依核准的生成細綱與上下文寫作章節正文。',
    },
    critic: {
      profileId: null,
      roleGuidance: '依標準評分維度評估草稿品質，指出重大缺陷並給出修訂建議。',
    },
    editor: {
      profileId: null,
      roleGuidance: '依 Critic 審核建議修訂章節正文。',
    },
  },
  maxRevisions: 3,
  criticThresholds: {
    humanReviewFloor: 80,
    passScore: 85,
  },
  criticRubricWeights: {
    instructionAndBeat: 20,
    plotLogic: 20,
    characterConsistency: 20,
    contextAndWorld: 15,
    styleAndQuality: 15,
    pacingAndStructure: 10,
  },
  costEstimate: {
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    currency: 'USD',
    showTokenAndCost: true,
  },
};

export function validateCriticThresholds(floor: number, pass: number): { valid: boolean; message?: string } {
  if (floor < 0 || floor > 100) return { valid: false, message: '人工審核門檻 (humanReviewFloor) 必須介於 0–100' };
  if (pass < 0 || pass > 100) return { valid: false, message: '自動通過門檻 (passScore) 必須介於 0–100' };
  if (floor >= pass) return { valid: false, message: '人工審核門檻必須小於自動通過門檻 (humanReviewFloor < passScore)' };
  return { valid: true };
}

export function validateCriticWeights(weights: MultiAgentPrefs['criticRubricWeights']): { valid: boolean; total: number; message?: string } {
  const values = Object.values(weights);
  const hasNegative = values.some((v) => typeof v !== 'number' || v < 0);
  const total = values.reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
  if (hasNegative) return { valid: false, total, message: '所有維度權重必須為非負數' };
  if (total !== 100) return { valid: false, total, message: `六維度配分總和必須為 100（目前為 ${total}）` };
  return { valid: true, total };
}

export function clampMaxRevisions(val: number): number {
  if (typeof val !== 'number' || Number.isNaN(val)) return 3;
  return Math.max(1, Math.min(5, Math.floor(val)));
}

const DEFAULT_LLM_PROFILE: LLMProfile = {
  id: 'default',
  name: 'My API',
  provider: 'custom',
  baseUrl: '',
  apiKey: '',
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 4096,
  timeoutSec: 120,
};

interface SettingsState {
  generalPrefs: GeneralPrefs;
  llmProfiles: LLMProfile[];
  activeProfileId: string;
  llmConfig: LLMConfig;
  inlineEdit: InlineEditPrefs;
  aiPrompts: AIPromptPrefs;
  wikiPrefs: WikiPrefs;
  imageGenerationPrefs: ImageGenerationPrefs;
  lintPrefs: LintPrefs;
  multiAgentPrefs: MultiAgentPrefs;
  setGeneralPrefs: (prefs: Partial<GeneralPrefs>) => void;
  setLlmProfiles: (profiles: LLMProfile[], activeId?: string) => void;
  setActiveProfileId: (id: string) => void;
  upsertLlmProfile: (profile: LLMProfile) => void;
  deleteLlmProfile: (id: string) => void;
  setLlmConfig: (config: Partial<LLMConfig>) => void;
  setInlineEdit: (prefs: Partial<InlineEditPrefs>) => void;
  setAiPrompts: (prefs: Partial<AIPromptPrefs>) => void;
  setWikiPrefs: (prefs: Partial<WikiPrefs>) => void;
  setImageGenerationPrefs: (prefs: DeepPartial<ImageGenerationPrefs>) => void;
  setLintPrefs: (prefs: DeepPartial<LintPrefs>) => void;
  setMultiAgentPrefs: (prefs: DeepPartial<MultiAgentPrefs>) => void;
}

const DEFAULT_AI_PROMPTS: AIPromptPrefs = {
  chapterDrafts: DEFAULT_PROMPT_PAIRS_ZH.chapterDrafts,
  chapterOutline: DEFAULT_PROMPT_PAIRS_ZH.chapterOutline,
  characterProfile: DEFAULT_PROMPT_PAIRS_ZH.characterProfile,
  expandContent: DEFAULT_PROMPT_PAIRS_ZH.expandContent,
  polishContent: DEFAULT_PROMPT_PAIRS_ZH.polishContent,
  summaryGeneration: DEFAULT_PROMPT_PAIRS_ZH.summaryGeneration,
  wikiIngest: DEFAULT_PROMPT_PAIRS_ZH.wikiIngest,

  chapterDraftsTemplate: DEFAULT_CHAPTER_DRAFTS_TEMPLATE,
  chapterContinuationRules: DEFAULT_CHAPTER_CONTINUATION_RULES,
  chapterContentTemplate: DEFAULT_CHAPTER_CONTENT_TEMPLATE,
  chapterPointsTemplate: DEFAULT_CHAPTER_POINTS_TEMPLATE,
  characterDraftsTemplate: DEFAULT_CHARACTER_DRAFTS_TEMPLATE,
  inlineAdjustTemplate: DEFAULT_INLINE_ADJUST_TEMPLATE,
  comicStoryboardTemplate: DEFAULT_COMIC_STORYBOARD_TEMPLATE,
  wikiIngestPlanTemplate: DEFAULT_WIKI_INGEST_PLAN_TEMPLATE,
  wikiIngestCreateTemplate: DEFAULT_WIKI_INGEST_CREATE_TEMPLATE,
  wikiIngestUpdateTemplate: DEFAULT_WIKI_INGEST_UPDATE_TEMPLATE,
  wikiQueryAnswerTemplate: DEFAULT_WIKI_QUERY_ANSWER_TEMPLATE,
  lintUnrecordedVerifyTemplate: DEFAULT_LINT_UNRECORDED_VERIFY_TEMPLATE,
  lintWikiContradictTemplate: DEFAULT_LINT_WIKI_CONTRADICT_TEMPLATE,
  lintWikiVsChapterTemplate: DEFAULT_LINT_WIKI_VS_CHAPTER_TEMPLATE,
  lintFixSuggestTemplate: DEFAULT_LINT_FIX_SUGGEST_TEMPLATE,
};

function deepMergeLintPrefs(base: LintPrefs, patch: DeepPartial<LintPrefs>): LintPrefs {
  return {
    checks: { ...base.checks, ...(patch.checks ?? {}) },
    maxPagesPerTypeContradict: patch.maxPagesPerTypeContradict ?? base.maxPagesPerTypeContradict,
    maxCharactersVsChapter: patch.maxCharactersVsChapter ?? base.maxCharactersVsChapter,
    maxChapterExcerptsPerChar: patch.maxChapterExcerptsPerChar ?? base.maxChapterExcerptsPerChar,
    maxUnrecordedCandidates: patch.maxUnrecordedCandidates ?? base.maxUnrecordedCandidates,
  };
}

function deepMergeMultiAgentPrefs(base: MultiAgentPrefs, patch?: DeepPartial<MultiAgentPrefs>): MultiAgentPrefs {
  if (!patch) return { ...base };
  const rawMaxRev = patch.maxRevisions ?? base.maxRevisions;
  const maxRevisions = clampMaxRevisions(rawMaxRev);

  return {
    agents: {
      planner: { ...base.agents.planner, ...(patch.agents?.planner ?? {}) },
      writer: { ...base.agents.writer, ...(patch.agents?.writer ?? {}) },
      critic: { ...base.agents.critic, ...(patch.agents?.critic ?? {}) },
      editor: { ...base.agents.editor, ...(patch.agents?.editor ?? {}) },
    },
    maxRevisions,
    criticThresholds: {
      humanReviewFloor: patch.criticThresholds?.humanReviewFloor ?? base.criticThresholds.humanReviewFloor,
      passScore: patch.criticThresholds?.passScore ?? base.criticThresholds.passScore,
    },
    criticRubricWeights: {
      instructionAndBeat: patch.criticRubricWeights?.instructionAndBeat ?? base.criticRubricWeights.instructionAndBeat,
      plotLogic: patch.criticRubricWeights?.plotLogic ?? base.criticRubricWeights.plotLogic,
      characterConsistency: patch.criticRubricWeights?.characterConsistency ?? base.criticRubricWeights.characterConsistency,
      contextAndWorld: patch.criticRubricWeights?.contextAndWorld ?? base.criticRubricWeights.contextAndWorld,
      styleAndQuality: patch.criticRubricWeights?.styleAndQuality ?? base.criticRubricWeights.styleAndQuality,
      pacingAndStructure: patch.criticRubricWeights?.pacingAndStructure ?? base.criticRubricWeights.pacingAndStructure,
    },
    costEstimate: {
      inputCostPerMillion: patch.costEstimate?.inputCostPerMillion ?? base.costEstimate.inputCostPerMillion,
      outputCostPerMillion: patch.costEstimate?.outputCostPerMillion ?? base.costEstimate.outputCostPerMillion,
      currency: patch.costEstimate?.currency ?? base.costEstimate.currency,
      showTokenAndCost: patch.costEstimate?.showTokenAndCost ?? base.costEstimate.showTokenAndCost,
    },
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      generalPrefs: {
        interfaceLocale: 'zh-TW',
        defaultWritingLanguage: 'zh-Hant',
      },
      llmProfiles: [DEFAULT_LLM_PROFILE],
      activeProfileId: 'default',
      llmConfig: DEFAULT_LLM_PROFILE,
      inlineEdit: {
        contextMode: 'window',
        contextChars: 500,
      },
      aiPrompts: { ...DEFAULT_AI_PROMPTS },
      wikiPrefs: { ...DEFAULT_WIKI_PREFS },
      imageGenerationPrefs: { ...DEFAULT_IMAGE_GENERATION_PREFS },
      lintPrefs: { ...DEFAULT_LINT_PREFS },
      multiAgentPrefs: { ...DEFAULT_MULTI_AGENT_PREFS },
      setGeneralPrefs: (prefs) =>
        set((state) => ({ generalPrefs: { ...state.generalPrefs, ...prefs } })),
      setLlmProfiles: (profiles, activeId) =>
        set((state) => {
          const validProfiles = profiles.length > 0 ? profiles : [DEFAULT_LLM_PROFILE];
          const nextActiveId = activeId && validProfiles.some((p) => p.id === activeId)
            ? activeId
            : validProfiles.some((p) => p.id === state.activeProfileId)
            ? state.activeProfileId
            : validProfiles[0].id;
          const activeProfile = validProfiles.find((p) => p.id === nextActiveId) || validProfiles[0];
          return {
            llmProfiles: validProfiles,
            activeProfileId: nextActiveId,
            llmConfig: activeProfile,
          };
        }),
      setActiveProfileId: (id) =>
        set((state) => {
          const found = state.llmProfiles.find((p) => p.id === id);
          if (!found) return state;
          return {
            activeProfileId: id,
            llmConfig: found,
          };
        }),
      upsertLlmProfile: (profile) =>
        set((state) => {
          const exists = state.llmProfiles.some((p) => p.id === profile.id);
          const nextProfiles = exists
            ? state.llmProfiles.map((p) => (p.id === profile.id ? profile : p))
            : [...state.llmProfiles, profile];
          const isActive = profile.id === state.activeProfileId;
          const activeProfile = nextProfiles.find((p) => p.id === state.activeProfileId) || nextProfiles[0];
          return {
            llmProfiles: nextProfiles,
            llmConfig: isActive ? profile : activeProfile,
          };
        }),
      deleteLlmProfile: (id) =>
        set((state) => {
          if (state.llmProfiles.length <= 1) return state;
          const nextProfiles = state.llmProfiles.filter((p) => p.id !== id);
          const nextActiveId = state.activeProfileId === id ? nextProfiles[0].id : state.activeProfileId;
          const activeProfile = nextProfiles.find((p) => p.id === nextActiveId) || nextProfiles[0];
          return {
            llmProfiles: nextProfiles,
            activeProfileId: nextActiveId,
            llmConfig: activeProfile,
          };
        }),
      setLlmConfig: (config) =>
        set((state) => {
          const updatedActive = { ...state.llmConfig, ...config };
          const nextProfiles = state.llmProfiles.map((p) =>
            p.id === state.activeProfileId ? updatedActive : p,
          );
          return {
            llmProfiles: nextProfiles,
            llmConfig: updatedActive,
          };
        }),
      setInlineEdit: (prefs) =>
        set((state) => ({ inlineEdit: { ...state.inlineEdit, ...prefs } })),
      setAiPrompts: (prefs) =>
        set((state) => ({ aiPrompts: { ...state.aiPrompts, ...prefs } })),
      setWikiPrefs: (prefs) =>
        set((state) => ({ wikiPrefs: { ...state.wikiPrefs, ...prefs } })),
      setImageGenerationPrefs: (patch) =>
        set((state) => ({
          imageGenerationPrefs: {
            ...state.imageGenerationPrefs,
            ...patch,
            comfyui: {
              ...state.imageGenerationPrefs.comfyui,
              ...(patch.comfyui ?? {}),
              referenceImageNodeIds: (patch.comfyui?.referenceImageNodeIds ?? state.imageGenerationPrefs.comfyui.referenceImageNodeIds).filter((id): id is string => typeof id === 'string'),
            },
            openaiCompatible: { ...state.imageGenerationPrefs.openaiCompatible, ...(patch.openaiCompatible ?? {}) },
            deepinfraFlux: { ...state.imageGenerationPrefs.deepinfraFlux, ...(patch.deepinfraFlux ?? {}) },
            googleGeminiImage: { ...state.imageGenerationPrefs.googleGeminiImage, ...(patch.googleGeminiImage ?? {}) },
          },
        })),
      setLintPrefs: (patch) =>
        set((state) => ({ lintPrefs: deepMergeLintPrefs(state.lintPrefs, patch) })),
      setMultiAgentPrefs: (patch) =>
        set((state) => ({ multiAgentPrefs: deepMergeMultiAgentPrefs(state.multiAgentPrefs, patch) })),
    }),
    {
      name: 'novel-generator-settings',
      // 舊版 persist 可能沒有部分 aiPrompts 欄位，用 merge 補齊預設值
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;

        const hasPersistedData = Boolean(
          p.llmProfiles || p.llmConfig || p.aiPrompts || p.wikiPrefs || p.imageGenerationPrefs,
        );

        let generalPrefs: GeneralPrefs;
        if (p.generalPrefs && p.generalPrefs.interfaceLocale) {
          generalPrefs = {
            interfaceLocale: p.generalPrefs.interfaceLocale,
            defaultWritingLanguage:
              p.generalPrefs.defaultWritingLanguage ||
              mapLocaleToDefaultWritingLanguage(p.generalPrefs.interfaceLocale),
          };
        } else if (hasPersistedData) {
          // 既有舊版安裝：缺少語系欄位一律修復補為繁中 zh-TW / zh-Hant，不重新依系統語系判斷
          generalPrefs = {
            interfaceLocale: 'zh-TW',
            defaultWritingLanguage: 'zh-Hant',
          };
        } else {
          // 全新安裝第一次啟動：依系統語系初始化
          const initialLoc = detectInitialLocale();
          generalPrefs = {
            interfaceLocale: initialLoc,
            defaultWritingLanguage: mapLocaleToDefaultWritingLanguage(initialLoc),
          };
        }

        // LLM Profiles & Single Config Migration
        let profiles: LLMProfile[] = Array.isArray(p.llmProfiles) && p.llmProfiles.length > 0
          ? p.llmProfiles.map((prof) => ({
              ...DEFAULT_LLM_PROFILE,
              ...prof,
              temperature: prof.temperature ?? 0.7,
              maxTokens: prof.maxTokens ?? 4096,
              timeoutSec: prof.timeoutSec ?? 120,
            }))
          : [];

        if (profiles.length === 0 && p.llmConfig) {
          profiles = [{
            ...DEFAULT_LLM_PROFILE,
            ...p.llmConfig,
            temperature: (p.llmConfig as LLMProfile).temperature ?? 0.7,
            maxTokens: (p.llmConfig as LLMProfile).maxTokens ?? 4096,
            timeoutSec: (p.llmConfig as LLMProfile).timeoutSec ?? 120,
          }];
        }

        if (profiles.length === 0) {
          profiles = [DEFAULT_LLM_PROFILE];
        }

        const activeId = p.activeProfileId && profiles.some((item) => item.id === p.activeProfileId)
          ? p.activeProfileId
          : profiles[0].id;
        const activeProf = profiles.find((item) => item.id === activeId) || profiles[0];

        return {
          ...current,
          ...p,
          generalPrefs,
          llmProfiles: profiles,
          activeProfileId: activeId,
          llmConfig: activeProf,
          multiAgentPrefs: deepMergeMultiAgentPrefs(DEFAULT_MULTI_AGENT_PREFS, p.multiAgentPrefs),
          wikiPrefs: { ...DEFAULT_WIKI_PREFS, ...(p.wikiPrefs ?? {}) },
          imageGenerationPrefs: {
            ...DEFAULT_IMAGE_GENERATION_PREFS,
            ...(p.imageGenerationPrefs ?? {}),
            comfyui: {
              ...DEFAULT_IMAGE_GENERATION_PREFS.comfyui,
              ...(p.imageGenerationPrefs?.comfyui ?? {}),
            },
            openaiCompatible: {
              ...DEFAULT_IMAGE_GENERATION_PREFS.openaiCompatible,
              ...(p.imageGenerationPrefs?.openaiCompatible ?? {}),
            },
            deepinfraFlux: {
              ...DEFAULT_IMAGE_GENERATION_PREFS.deepinfraFlux,
              ...(p.imageGenerationPrefs?.deepinfraFlux ?? {}),
            },
            googleGeminiImage: {
              ...DEFAULT_IMAGE_GENERATION_PREFS.googleGeminiImage,
              ...(p.imageGenerationPrefs?.googleGeminiImage ?? {}),
            },
          },
          lintPrefs: deepMergeLintPrefs(DEFAULT_LINT_PREFS, p.lintPrefs ?? {}),
          aiPrompts: {
            ...DEFAULT_AI_PROMPTS,
            ...(p.aiPrompts ?? {}),
          },
        };
      },
    },
  ),
);
