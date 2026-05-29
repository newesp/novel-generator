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
  /** 生成本章時要參考的另一章節 ID（null = 不參考） */
  referenceChapterId: string | null;
  wikiSyncedAt: number | null;
  wikiSyncedHash: string | null;       // sha1(content) at last successful (or partial) ingest
  wikiSyncStatus: WikiSyncStatus;      // 顯式狀態，不從 hash 推導
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
  /** 成長弧線：角色從開頭到結局的內在轉變（與主線劇情相呼應） */
  arc: string;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────
//  Wiki（Phase 2 — 知識層）
// ─────────────────────────────────────────────────────────────

export type WikiPageType = 'concept' | 'entity' | 'summary' | 'compare' | 'synthesis';

export interface WikiPageRelated {
  type: WikiPageType;
  slug: string;
}

export interface WikiPage {
  id: string;
  bookId: string;             // 對應 Project.id
  type: WikiPageType;
  slug: string;               // ASCII kebab-case
  title: string;
  aliases: string[];
  relatedSlugs: WikiPageRelated[];
  description: string;
  contentMd: string;
  createdAt: number;
  updatedAt: number;
}

/** 還原所需的完整頁面快照 — 等同 WikiPage 全欄位 */
export type WikiPageSnapshot = WikiPage;

export type WikiLogKind = 'create' | 'update' | 'delete' | 'undo';
export type WikiLogStatus = 'ok' | 'failed' | 'undone';

export interface WikiLogEntry {
  id: string;
  bookId: string;
  batchId: string;
  appliedAt: number;
  kind: WikiLogKind;
  opStatus: WikiLogStatus;
  pageId: string | null;
  pageType: WikiPageType;
  pageSlug: string;
  pageSnapshotBefore: WikiPageSnapshot | null;
  pageSnapshotAfter: WikiPageSnapshot | null;
  source: string;             // 'ingest:<chapterId>' | 'manual' | 'undo:<batchId>'
  summary: string;
  errorMessage?: string;
}

export type WikiSyncStatus = 'unsynced' | 'synced' | 'stale' | 'partial' | 'partial_stale';

// ─────────────────────────────────────────────────────────────
//  Comic images（Phase 6 — 漫畫圖片 MVP）
// ─────────────────────────────────────────────────────────────

export type ChapterComicStatus = 'draft' | 'storyboard_ready' | 'generating' | 'ready' | 'partial' | 'failed';
export type ComicPanelStatus = 'draft' | 'queued' | 'generating' | 'ready' | 'failed';
export type MediaAssetKind = 'comic_panel_image' | 'tts_audio' | 'video';

export interface ChapterComic {
  id: string;
  projectId: string;
  chapterId: string;
  title: string;
  status: ChapterComicStatus;
  stylePreset: string;
  providerId: string;
  targetPanelCount?: number;
  visualContinuityBibleJson: string;
  createdAt: number;
  updatedAt: number;
}

export interface ComicPanel {
  id: string;
  comicId: string;
  order: number;
  beat: string;
  characters: string[];
  location: string;
  shotType: string;
  cameraAngle: string;
  visualPrompt: string;
  negativePrompt: string;
  dialogue: string;
  narration: string;
  durationSec: number;
  seed?: number;
  assetId?: string;
  status: ComicPanelStatus;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MediaAsset {
  id: string;
  projectId: string;
  chapterId?: string;
  kind: MediaAssetKind;
  path?: string;
  url?: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  providerId?: string;
  generationParamsJson?: string;
  createdAt: number;
}

export type ImageProviderId = 'comfyui' | 'openai-compatible-image';

export interface ComfyUIImageProviderConfig {
  providerId: 'comfyui';
  baseUrl: string;
  workflowJson: string;
  promptNodeId: string;
  negativePromptNodeId: string;
  seedNodeId: string;
  widthNodeId: string;
  heightNodeId: string;
  outputNodeId: string;
}

export interface OpenAICompatibleImageProviderConfig {
  providerId: 'openai-compatible-image';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export type ImageProviderConfig = ComfyUIImageProviderConfig | OpenAICompatibleImageProviderConfig;

export type LLMProvider = 'custom' | 'google' | 'grok';

export interface LLMConfig {
  id: string;
  /** 'custom' = OpenAI-compatible (任意 baseUrl)；'google' = Google Gemini */
  provider: LLMProvider;
  name: string;
  /** 對 'google' 而言可留空，會使用 Gemini 預設端點 */
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
