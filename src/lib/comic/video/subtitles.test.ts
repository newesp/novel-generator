import { describe, expect, it } from 'vitest';
import type { ComicPanel } from '../../../types';
import { buildComicSrt } from './subtitles';

const panel = (patch: Partial<ComicPanel>): ComicPanel => ({
  id: 'panel-1',
  comicId: 'comic',
  order: 1,
  beat: 'Opening',
  characters: [],
  location: '',
  shotType: '',
  cameraAngle: '',
  visualPrompt: '',
  negativePrompt: '',
  dialogue: '',
  narration: '第一格旁白。',
  durationSec: 0,
  assetId: 'image-1',
  status: 'ready',
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

describe('buildComicSrt', () => {
  it('builds YouTube-compatible SRT cues from panel narration and durations', () => {
    expect(buildComicSrt([
      { panel: panel({ order: 1, narration: '第一格旁白。' }), durationMs: 2400 },
      { panel: panel({ id: 'panel-2', order: 2, narration: '第二格旁白。\n換行。' }), durationMs: 1600 },
    ])).toBe([
      '1',
      '00:00:00,000 --> 00:00:02,400',
      '第一格旁白。',
      '',
      '2',
      '00:00:02,400 --> 00:00:04,000',
      '第二格旁白。',
      '換行。',
      '',
    ].join('\n'));
  });

  it('skips panels with empty narration and keeps following cue timing aligned', () => {
    expect(buildComicSrt([
      { panel: panel({ order: 1, narration: '第一格旁白。' }), durationMs: 1000 },
      { panel: panel({ id: 'panel-2', order: 2, narration: '   ' }), durationMs: 500 },
      { panel: panel({ id: 'panel-3', order: 3, narration: '第三格旁白。' }), durationMs: 1000 },
    ])).toBe([
      '1',
      '00:00:00,000 --> 00:00:01,000',
      '第一格旁白。',
      '',
      '2',
      '00:00:01,500 --> 00:00:02,500',
      '第三格旁白。',
      '',
    ].join('\n'));
  });
});
