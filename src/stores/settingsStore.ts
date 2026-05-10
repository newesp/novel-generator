import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LLMConfig } from '../types';

interface SettingsState {
  llmConfig: LLMConfig;
  setLlmConfig: (config: Partial<LLMConfig>) => void;
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
      setLlmConfig: (config) =>
        set((state) => ({ llmConfig: { ...state.llmConfig, ...config } })),
    }),
    { name: 'novel-generator-settings' }
  )
);
