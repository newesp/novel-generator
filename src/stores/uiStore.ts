import { create } from 'zustand';
import type { TabName } from '../types';

interface UIState {
  activeTab: TabName;
  selectedChapterId: string | null;
  leftPaneWidth: number;
  setActiveTab: (tab: TabName) => void;
  setSelectedChapterId: (id: string | null) => void;
  setLeftPaneWidth: (w: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'outline',
  selectedChapterId: null,
  leftPaneWidth: 340,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedChapterId: (id) => set({ selectedChapterId: id }),
  setLeftPaneWidth: (w) => set({ leftPaneWidth: Math.min(500, Math.max(280, w)) }),
}));
