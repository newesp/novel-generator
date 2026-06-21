import { describe, expect, it } from 'vitest';
import {
  comicPanelToRow,
  comicPanelImageVariantToRow,
  chapterComicToRow,
  mediaAssetToRow,
  rowToComicPanel,
  rowToComicPanelImageVariant,
  rowToChapterComic,
  rowToMediaAsset,
  rowToSceneVisual,
  sceneVisualToRow,
} from '../storage/sqlite-helpers';
import type { ChapterComic, ComicPanel, ComicPanelImageVariant, MediaAsset, SceneVisual } from '../../types';

describe('comic sqlite row helpers', () => {
  it('round trips comic metadata rows', () => {
    const comic: ChapterComic = {
      id: 'comic',
      projectId: 'book',
      chapterId: 'ch1',
      title: '第 1 章漫畫',
      status: 'storyboard_ready',
      stylePreset: 'manga',
      providerId: 'comfyui',
      visualContinuityBibleJson: '{}',
      videoStatus: 'ready',
      videoAssetId: 'video-asset',
      videoProviderId: 'ffmpeg',
      videoSettingsJson: '{"panelPauseMs":400}',
      videoErrorMessage: 'video warning',
      createdAt: 1,
      updatedAt: 2,
    };
    const panel: ComicPanel = {
      id: 'panel',
      comicId: 'comic',
      order: 1,
      beat: '開場',
      characters: ['阿飛'],
      location: '霧潮街口',
      shotType: 'wide',
      cameraAngle: 'eye-level',
      visualPrompt: 'manga panel',
      negativePrompt: 'bad hands',
      dialogue: '',
      narration: '',
      durationSec: 0,
      status: 'draft',
      ttsStatus: 'ready',
      ttsAssetId: 'tts-asset',
      ttsDurationMs: 3200,
      ttsProviderId: 'edge-tts',
      ttsVoice: 'zh-TW-HsiaoChenNeural',
      ttsErrorMessage: 'tts warning',
      segmentAssetId: 'segment-asset',
      createdAt: 1,
      updatedAt: 2,
    };
    const asset: MediaAsset = {
      id: 'asset',
      projectId: 'book',
      chapterId: 'ch1',
      kind: 'comic_panel_image',
      url: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      providerId: 'comfyui',
      createdAt: 3,
    };
    const scene: SceneVisual = {
      id: 'scene',
      projectId: 'book',
      slug: 'workshop',
      title: 'Workshop',
      prompt: 'wooden room, warm lamp',
      negativePrompt: 'modern lab',
      referenceAssetIds: ['asset'],
      createdAt: 1,
      updatedAt: 2,
    };
    const variant: ComicPanelImageVariant = {
      id: 'variant',
      projectId: 'book',
      chapterId: 'ch1',
      comicId: 'comic',
      panelId: 'panel',
      assetId: 'asset',
      status: 'ready',
      providerId: 'comfyui',
      promptSnapshot: 'manga panel',
      negativePromptSnapshot: 'bad hands',
      referenceAssetIds: ['ref-1'],
      referenceImageLabels: ['image 1 = character'],
      seed: 123,
      generationParamsJson: '{"width":1024}',
      createdAt: 4,
    };

    expect(rowToChapterComic(chapterComicToRow(comic))).toEqual(comic);
    expect(rowToComicPanel(comicPanelToRow(panel))).toEqual(panel);
    expect(rowToComicPanelImageVariant(comicPanelImageVariantToRow(variant))).toEqual(variant);
    expect(rowToMediaAsset(mediaAssetToRow(asset))).toEqual(asset);
    expect(rowToSceneVisual(sceneVisualToRow(scene))).toEqual(scene);
  });
});
