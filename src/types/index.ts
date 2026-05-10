export interface Project {
  id: string;
  title: string;
  genre: string;
  style: string;
  worldSetting: string;
  mainPlot: string;
  chapterOutline: string;
  createdAt: number;
  updatedAt: number;
}

export interface Chapter {
  id: string;
  projectId: string;
  order: number;
  title: string;
  targetWords: number | null;
  beat: string;
  points: string;
  content: string;
  wikiSyncedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChapterVersion {
  id: string;
  chapterId: string;
  content: string;
  prompt: string;
  isPinned: boolean;
  label: string;
  /**
   * 描述觸發此快照的編輯類型：
   * - 'full'   ：完整重新生成 / 手動存入版本
   * - 'inline' ：選取段落調整（局部 inline-edit）
   */
  kind: 'full' | 'inline';
  createdAt: number;
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  gender: string;
  age: string;
  race: string;
  personality: string;
  background: string;
  appearance: string;
  abilities: string;
  relations: string;
  createdAt: number;
}

export interface LLMConfig {
  id: string;
  provider: 'custom';
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export type StoryBeat =
  | '引入 (Inciting Incident)'
  | '衝突升級 (Rising Action)'
  | '中點轉折 (Midpoint Twist)'
  | '高潮 (Climax)'
  | '結局 (Resolution)'
  | '鋪墊/過渡'
  | '自定義';

export type TabName = 'outline' | 'characters' | 'chapters' | 'wiki';
