import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ImageProviderId, LLMConfig } from '../types';
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

// 為了相容舊 import 路徑，re-export
export { DEFAULT_CHAPTER_CONTINUATION_RULES };

export type InlineEditContextMode = 'window' | 'full';

export interface InlineEditPrefs {
  contextMode: InlineEditContextMode;
  contextChars: number;
}

export interface AIPromptPrefs {
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
  /** #8 Wiki query — Answer（Phase 2.5 預留） */
  wikiQueryAnswerTemplate: string;
  /** #9 Lint — 未登錄角色 verify（Phase 2.5） */
  lintUnrecordedVerifyTemplate: string;
  /** #10 Lint — Wiki 內部矛盾（Phase 2.5） */
  lintWikiContradictTemplate: string;
  /** #11 Lint — Wiki vs 章節（Phase 2.5） */
  lintWikiVsChapterTemplate: string;
  /** #12 Lint — 修改建議（Phase 2.5） */
  lintFixSuggestTemplate: string;
}

export interface WikiPrefs {
  /** Wiki 區塊佔 context window 的比例（spec §5.3） */
  budgetRatio: number;
  /** 連續超預算警告閾值，到達後 UI 強烈建議 pick-pages（Phase 2.5） */
  overflowWarnThreshold: number;
  /** Phase 2.5 後可用；目前永遠 false */
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
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

interface SettingsState {
  llmConfig: LLMConfig;
  inlineEdit: InlineEditPrefs;
  aiPrompts: AIPromptPrefs;
  wikiPrefs: WikiPrefs;
  imageGenerationPrefs: ImageGenerationPrefs;
  lintPrefs: LintPrefs;
  setLlmConfig: (config: Partial<LLMConfig>) => void;
  setInlineEdit: (prefs: Partial<InlineEditPrefs>) => void;
  setAiPrompts: (prefs: Partial<AIPromptPrefs>) => void;
  setWikiPrefs: (prefs: Partial<WikiPrefs>) => void;
  setImageGenerationPrefs: (prefs: DeepPartial<ImageGenerationPrefs>) => void;
  setLintPrefs: (prefs: DeepPartial<LintPrefs>) => void;
}

const DEFAULT_AI_PROMPTS: AIPromptPrefs = {
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

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      llmConfig: {
        id: 'default',
        provider: 'custom',
        name: 'My API',
        baseUrl: '',
        apiKey: '',
        model: 'gpt-4o',
      },
      inlineEdit: {
        contextMode: 'window',
        contextChars: 500,
      },
      aiPrompts: { ...DEFAULT_AI_PROMPTS },
      wikiPrefs: { ...DEFAULT_WIKI_PREFS },
      imageGenerationPrefs: { ...DEFAULT_IMAGE_GENERATION_PREFS },
      lintPrefs: { ...DEFAULT_LINT_PREFS },
      setLlmConfig: (config) =>
        set((state) => ({ llmConfig: { ...state.llmConfig, ...config } })),
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
            comfyui: { ...state.imageGenerationPrefs.comfyui, ...(patch.comfyui ?? {}) },
            openaiCompatible: { ...state.imageGenerationPrefs.openaiCompatible, ...(patch.openaiCompatible ?? {}) },
            deepinfraFlux: { ...state.imageGenerationPrefs.deepinfraFlux, ...(patch.deepinfraFlux ?? {}) },
          },
        })),
      setLintPrefs: (patch) =>
        set((state) => ({ lintPrefs: deepMergeLintPrefs(state.lintPrefs, patch) })),
    }),
    {
      name: 'novel-generator-settings',
      // 舊版 persist 可能沒有部分 aiPrompts 欄位，用 merge 補齊預設值
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
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
