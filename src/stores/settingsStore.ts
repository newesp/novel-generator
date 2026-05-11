import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LLMConfig } from '../types';
import {
  DEFAULT_CHAPTER_DRAFTS_TEMPLATE,
  DEFAULT_CHAPTER_CONTINUATION_RULES,
  DEFAULT_CHAPTER_CONTENT_TEMPLATE,
  DEFAULT_CHAPTER_POINTS_TEMPLATE,
  DEFAULT_INLINE_ADJUST_TEMPLATE,
} from '../lib/prompt-defaults';

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
  /** #4 局部段落改寫 prompt 模板 */
  inlineAdjustTemplate: string;
}

interface SettingsState {
  llmConfig: LLMConfig;
  inlineEdit: InlineEditPrefs;
  aiPrompts: AIPromptPrefs;
  setLlmConfig: (config: Partial<LLMConfig>) => void;
  setInlineEdit: (prefs: Partial<InlineEditPrefs>) => void;
  setAiPrompts: (prefs: Partial<AIPromptPrefs>) => void;
}

const DEFAULT_AI_PROMPTS: AIPromptPrefs = {
  chapterDraftsTemplate: DEFAULT_CHAPTER_DRAFTS_TEMPLATE,
  chapterContinuationRules: DEFAULT_CHAPTER_CONTINUATION_RULES,
  chapterContentTemplate: DEFAULT_CHAPTER_CONTENT_TEMPLATE,
  chapterPointsTemplate: DEFAULT_CHAPTER_POINTS_TEMPLATE,
  inlineAdjustTemplate: DEFAULT_INLINE_ADJUST_TEMPLATE,
};

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
      setLlmConfig: (config) =>
        set((state) => ({ llmConfig: { ...state.llmConfig, ...config } })),
      setInlineEdit: (prefs) =>
        set((state) => ({ inlineEdit: { ...state.inlineEdit, ...prefs } })),
      setAiPrompts: (prefs) =>
        set((state) => ({ aiPrompts: { ...state.aiPrompts, ...prefs } })),
    }),
    {
      name: 'novel-generator-settings',
      // 舊版 persist 可能沒有部分 aiPrompts 欄位，用 merge 補齊預設值
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          aiPrompts: {
            ...DEFAULT_AI_PROMPTS,
            ...(p.aiPrompts ?? {}),
          },
        };
      },
    },
  ),
);
