import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LLMConfig } from '../types';

export type InlineEditContextMode = 'window' | 'full';

export interface InlineEditPrefs {
  /** 預設上下文範圍：window = 前後固定字數；full = 全章 */
  contextMode: InlineEditContextMode;
  /** window 模式下，前後各取多少字 */
  contextChars: number;
}

interface SettingsState {
  llmConfig: LLMConfig;
  inlineEdit: InlineEditPrefs;
  setLlmConfig: (config: Partial<LLMConfig>) => void;
  setInlineEdit: (prefs: Partial<InlineEditPrefs>) => void;
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
      setLlmConfig: (config) =>
        set((state) => ({ llmConfig: { ...state.llmConfig, ...config } })),
      setInlineEdit: (prefs) =>
        set((state) => ({ inlineEdit: { ...state.inlineEdit, ...prefs } })),
    }),
    { name: 'novel-generator-settings' }
  )
);
