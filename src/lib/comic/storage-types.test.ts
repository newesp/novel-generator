import { describe, expect, it } from 'vitest';
import {
  comicPanelToRow,
  chapterComicToRow,
  mediaAssetToRow,
  rowToComicPanel,
  rowToChapterComic,
  rowToMediaAsset,
  rowToSceneVisual,
  sceneVisualToRow,
} from '../storage/sqlite-helpers';
import type { ChapterComic, ComicPanel, MediaAsset, SceneVisual } from '../../types';

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
      durationSec: 4,
      status: 'draft',
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

    expect(rowToChapterComic(chapterComicToRow(comic))).toEqual(comic);
    expect(rowToComicPanel(comicPanelToRow(panel))).toEqual(panel);
    expect(rowToMediaAsset(mediaAssetToRow(asset))).toEqual(asset);
    expect(rowToSceneVisual(sceneVisualToRow(scene))).toEqual(scene);
  });
});
