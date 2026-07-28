import type { WritingLanguage } from '../lib/language-policy';

export interface Project {
  id: string;
  title: string;
  genre: string;
  style: string;
  worldSetting: string;
  mainPlot: string;
  chapterOutline: string;
  writingLanguage: WritingLanguage;
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
  /** 漫畫/插圖生成用的角色專屬 negative prompt。 */
  visualNegativePrompt?: string;
  /** Project-level media asset ids for uploaded/generated character reference images. */
  referenceAssetIds?: string[];
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
export type ComicPanelImageVariantStatus = 'ready' | 'failed';
export type ComicPanelTtsStatus = 'idle' | 'queued' | 'generating' | 'ready' | 'failed';
export type ChapterComicVideoStatus = 'idle' | 'generating_audio' | 'rendering_segments' | 'concatenating' | 'ready' | 'failed';
export type MediaAssetKind = 'comic_panel_image' | 'character_reference_image' | 'scene_reference_image' | 'tts_audio' | 'video' | 'subtitle';
export type ComicPanelVideoClipAudioMode = 'mute' | 'keep';
export type ComicPanelVideoClipLoopMode = 'freeze' | 'loop';
export type ComicPanelMotionEffect =
  | 'none'
  | 'slow_zoom_in'
  | 'slow_zoom_out'
  | 'pan_left'
  | 'pan_right'
  | 'pan_up'
  | 'pan_down'
  | 'ken_burns_in_left'
  | 'ken_burns_in_right'
  | 'ken_burns_in_top'
  | 'ken_burns_in_bottom'
  | 'pulse_zoom'
  | 'crash_zoom_in'
  | 'subtle_shake'
  | 'fade_in'
  | 'fade_out';
export type ComicPanelExtraRole = 'crowd' | 'guards' | 'civilians' | 'creatures' | 'vehicles' | 'background';
export type ComicPanelExtraPriority = 'low' | 'medium';

export interface ComicPanelExtraGroup {
  label: string;
  count?: number;
  role: ComicPanelExtraRole;
  prompt: string;
  visualPriority: ComicPanelExtraPriority;
}

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
  videoStatus?: ChapterComicVideoStatus;
  videoAssetId?: string;
  subtitleAssetId?: string;
  videoProviderId?: string;
  videoSettingsJson?: string;
  videoErrorMessage?: string;
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
  sceneSlug?: string;
  shotType: string;
  cameraAngle: string;
  visualPrompt: string;
  negativePrompt: string;
  extraGroupsJson?: string;
  finalPromptSnapshot?: string;
  finalNegativePromptSnapshot?: string;
  /** Explicitly selected generated panel images to send to reference-capable providers. */
  referenceAssetIds?: string[];
  useContinuityReference?: boolean;
  dialogue: string;
  narration: string;
  durationSec: number;
  motionEffect?: ComicPanelMotionEffect;
  /** Uploaded MP4 clips used as this panel's visual source for TTS video segments. */
  videoClipAssetIds?: string[];
  videoClipAudioMode?: ComicPanelVideoClipAudioMode;
  videoClipAudioVolume?: number;
  videoClipLoopMode?: ComicPanelVideoClipLoopMode;
  seed?: number;
  assetId?: string;
  status: ComicPanelStatus;
  ttsStatus?: ComicPanelTtsStatus;
  ttsAssetId?: string;
  ttsDurationMs?: number;
  ttsProviderId?: string;
  ttsVoice?: string;
  ttsErrorMessage?: string;
  segmentAssetId?: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ComicPanelImageVariant {
  id: string;
  projectId: string;
  chapterId: string;
  comicId: string;
  panelId: string;
  assetId?: string;
  status: ComicPanelImageVariantStatus;
  providerId: string;
  promptSnapshot: string;
  negativePromptSnapshot?: string;
  referenceAssetIds: string[];
  referenceImageLabels: string[];
  seed?: number;
  generationParamsJson?: string;
  errorMessage?: string;
  createdAt: number;
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

export interface SceneVisual {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  prompt: string;
  negativePrompt: string;
  referenceAssetIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type ImageProviderId = 'comfyui' | 'openai-compatible-image' | 'deepinfra-flux' | 'google-gemini-image';

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
  referenceImageNodeIds?: string[];
}

export interface OpenAICompatibleImageProviderConfig {
  providerId: 'openai-compatible-image';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface DeepInfraFluxProviderConfig {
  providerId: 'deepinfra-flux';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface GoogleGeminiImageProviderConfig {
  providerId: 'google-gemini-image';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export type ImageProviderConfig =
  | ComfyUIImageProviderConfig
  | OpenAICompatibleImageProviderConfig
  | DeepInfraFluxProviderConfig
  | GoogleGeminiImageProviderConfig;

export type LLMProvider = 'custom' | 'google' | 'grok' | 'anthropic';

export interface LLMProfile {
  id: string;
  name: string;
  /** 'custom' = OpenAI-compatible；'google' = Google Gemini；'grok' = Grok (xAI)；'anthropic' = Anthropic Claude */
  provider: LLMProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutSec: number;
}

export type LLMConfig = LLMProfile;

export interface LLMCompletionUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface LLMCompletionResponse {
  text: string;
  usage: LLMCompletionUsage;
  requestId: string | null;
  finishReason: string | null;
}

export type MultiAgentRole = 'planner' | 'writer' | 'critic' | 'editor';

export interface AgentRoleConfig {
  profileId: string | null;
  modelOverride?: string;
  temperatureOverride?: number;
  maxTokensOverride?: number;
  roleGuidance: string;
}

export interface CriticRubricWeights {
  instructionAndBeat: number;
  plotLogic: number;
  characterConsistency: number;
  contextAndWorld: number;
  styleAndQuality: number;
  pacingAndStructure: number;
}

export interface CriticThresholds {
  humanReviewFloor: number;
  passScore: number;
}

export interface CostEstimatePrefs {
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  currency: string;
  showTokenAndCost: boolean;
}

export interface MultiAgentPrefs {
  agents: Record<MultiAgentRole, AgentRoleConfig>;
  maxRevisions: number;
  criticThresholds: CriticThresholds;
  criticRubricWeights: CriticRubricWeights;
  costEstimate: CostEstimatePrefs;
}

export type GenerationRunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_input'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type GenerationRunPhase =
  | 'preparing'
  | 'queued'
  | 'planning'
  | 'writing'
  | 'criticizing'
  | 'editing'
  | 'saving'
  | 'awaiting_input'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type GenerationRunPauseReason =
  | 'planner_review'
  | 'human_review'
  | 'interrupted'
  | 'configuration_blocked'
  | 'format_repair_failed'
  | 'revision_limit';

export interface GenerationRunActivity {
  phase: GenerationRunPhase;
  currentRole?: GenerationStepRole;
  currentStepId?: string;
  queuePosition?: number;
  pauseReason?: GenerationRunPauseReason;
  startedAt?: number;
  message?: string;
  errorMessage?: string;
}

export interface GenerationContextSnapshot {
  storyTitle?: string;
  chapterNumber?: number;
  chapterTitle?: string;
  targetWordCount?: number;
  rolesConfig: MultiAgentPrefs['agents'];
  criticRubricWeights: MultiAgentPrefs['criticRubricWeights'];
  criticThresholds: MultiAgentPrefs['criticThresholds'];
  maxRevisions: number;
  profilesSnapshot: Record<string, Omit<LLMProfile, 'apiKey'>>;
  createdAt: number;
}

export interface GenerationRunSummary {
  totalSteps: number;
  totalTokens: LLMCompletionUsage;
  estimatedCost?: number;
  currency?: string;
  finalScore?: number;
  finalDecision?: 'auto_pass' | 'human_pass' | 'cancelled' | 'failed';
  revisionsUsed: number;
  completedAt?: number;
}

export interface GenerationRun {
  id: string;
  bookId: string;
  chapterId: string;
  status: GenerationRunStatus;
  activity: GenerationRunActivity;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  cancelledAt?: number;
  snapshot: GenerationContextSnapshot;
  summary?: GenerationRunSummary;
}

export type GenerationStepRole = 'planner' | 'writer' | 'critic' | 'editor';

export type GenerationStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface GenerationStep {
  id: string;
  runId: string;
  bookId: string;
  chapterId: string;
  role: GenerationStepRole;
  status: GenerationStepStatus;
  attempt: number;
  inputCheckpointId?: string;
  prompt?: string;
  response?: string;
  usage?: LLMCompletionUsage;
  requestId?: string | null;
  finishReason?: string | null;
  errorText?: string;
  createdAt: number;
  completedAt?: number;
}

export interface GenerationCheckpoint {
  id: string;
  runId: string;
  bookId: string;
  chapterId: string;
  stepId?: string;
  stateName: string;
  data: string;
  createdAt: number;
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
