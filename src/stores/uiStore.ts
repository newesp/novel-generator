import { create } from 'zustand';
import type { TabName } from '../types';

export type AppView = 'home' | 'editor';

interface UIState {
  view: AppView;
  activeTab: TabName;
  selectedChapterId: string | null;
  leftPaneWidth: number;
  setView: (view: AppView) => void;
  setActiveTab: (tab: TabName) => void;
  setSelectedChapterId: (id: string | null) => void;
  setLeftPaneWidth: (w: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  view: 'home',
  activeTab: 'outline',
  selectedChapterId: null,
  leftPaneWidth: 340,
  setView: (view) => set({ view }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedChapterId: (id) => set({ selectedChapterId: id }),
  setLeftPaneWidth: (w) => set({ leftPaneWidth: Math.min(500, Math.max(280, w)) }),
}));
