import type { ComicPanel } from '../../../types';

export interface ComicSubtitleCueInput {
  panel: ComicPanel;
  durationMs: number;
}

export function buildComicSrt(cues: ComicSubtitleCueInput[]): string {
  let cursorMs = 0;
  let cueNumber = 1;
  const blocks: string[] = [];

  for (const cue of cues) {
    const startMs = cursorMs;
    const endMs = cursorMs + Math.max(0, cue.durationMs);
    cursorMs = endMs;

    const lines = cue.panel.narration
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) continue;

    blocks.push([
      String(cueNumber),
      `${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}`,
      ...lines,
    ].join('\n'));
    cueNumber += 1;
  }

  return blocks.length ? `${blocks.join('\n\n')}\n` : '';
}

function formatSrtTime(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1_000);
  const milliseconds = safeMs % 1_000;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)},${pad3(milliseconds)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function pad3(value: number): string {
  return String(value).padStart(3, '0');
}
