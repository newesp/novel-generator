import type { ComicPanel } from '../../../types';

export interface ComicSubtitleCueInput {
  panel: ComicPanel;
  durationMs: number;
}

export interface SubtitleCue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface OffsetSubtitleCueGroup {
  offsetMs: number;
  cues: SubtitleCue[];
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

export function parseSrt(srt: string): SubtitleCue[] {
  return srt
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => parseSrtBlock(block))
    .filter((cue): cue is SubtitleCue => Boolean(cue));
}

export function buildOffsetSrt(groups: OffsetSubtitleCueGroup[]): string {
  let cueNumber = 1;
  const blocks: string[] = [];

  for (const group of groups) {
    for (const cue of group.cues) {
      const text = normalizeSubtitleText(cue.text);
      if (!text) continue;
      blocks.push([
        String(cueNumber),
        `${formatSrtTime(group.offsetMs + cue.startMs)} --> ${formatSrtTime(group.offsetMs + cue.endMs)}`,
        text,
      ].join('\n'));
      cueNumber += 1;
    }
  }

  return blocks.length ? `${blocks.join('\n\n')}\n` : '';
}

function parseSrtBlock(block: string): SubtitleCue | null {
  const lines = block.split('\n').map((line) => line.trim());
  const timingIndex = lines.findIndex((line) => line.includes('-->'));
  if (timingIndex < 0) return null;
  const match = lines[timingIndex].match(/^(.+?)\s*-->\s*(.+?)(?:\s|$)/);
  if (!match) return null;
  const startMs = parseSrtTime(match[1]);
  const endMs = parseSrtTime(match[2]);
  if (startMs === null || endMs === null || endMs <= startMs) return null;
  const text = normalizeSubtitleText(lines.slice(timingIndex + 1).join(' '));
  if (!text) return null;
  return { startMs, endMs, text };
}

function parseSrtTime(value: string): number | null {
  const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) return null;
  const [, hours, minutes, seconds, milliseconds] = match;
  return Number(hours) * 3_600_000
    + Number(minutes) * 60_000
    + Number(seconds) * 1_000
    + Number(milliseconds);
}

function normalizeSubtitleText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
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
