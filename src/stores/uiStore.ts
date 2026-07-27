import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TabName } from '../types';

export type AppView = 'home' | 'editor';

interface UIState {
  view: AppView;
  activeTab: TabName;
  selectedChapterId: string | null;
  focusedAgentRunId: string | null;
  agentFocusVersion: number;
  settingsFocusTab: 'llm' | 'multi-agent';
  settingsFocusVersion: number;
  leftPaneWidth: number;
  setView: (view: AppView) => void;
  setActiveTab: (tab: TabName) => void;
  setSelectedChapterId: (id: string | null) => void;
  openAgentRun: (chapterId: string, runId: string) => void;
  clearFocusedAgentRun: () => void;
  openSettings: (tab?: 'llm' | 'multi-agent') => void;
  setLeftPaneWidth: (w: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      view: 'home',
      activeTab: 'outline',
      selectedChapterId: null,
      focusedAgentRunId: null,
      agentFocusVersion: 0,
      settingsFocusTab: 'llm',
      settingsFocusVersion: 0,
      leftPaneWidth: 340,
      setView: (view) => set({ view }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setSelectedChapterId: (id) => set({ selectedChapterId: id, focusedAgentRunId: null }),
      openAgentRun: (chapterId, runId) => set((state) => ({
        activeTab: 'chapters',
        selectedChapterId: chapterId,
        focusedAgentRunId: runId,
        agentFocusVersion: state.agentFocusVersion + 1,
      })),
      clearFocusedAgentRun: () => set({ focusedAgentRunId: null }),
      openSettings: (tab = 'llm') => set((state) => ({
        settingsFocusTab: tab,
        settingsFocusVersion: state.settingsFocusVersion + 1,
      })),
      setLeftPaneWidth: (w) => set({ leftPaneWidth: Math.min(600, Math.max(240, w)) }),
    }),
    {
      name: 'novel-generator-ui',
      partialize: (state) => ({
        leftPaneWidth: state.leftPaneWidth,
      }),
    }
  )
);
