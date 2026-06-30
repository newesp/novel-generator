import { invoke } from '@tauri-apps/api/core';
import type { ComicPanelMotionEffect } from '../../../types';

export interface GenerateTtsAudioArgs {
  edgeTtsBin: string;
  text: string;
  voice: string;
  outputPath: string;
  subtitlePath?: string;
}

export interface GenerateTtsAudioResult {
  subtitleText?: string;
}

export interface ProbeAudioDurationArgs {
  ffprobeBin: string;
  inputPath: string;
}

export interface ProbeVideoDurationArgs {
  ffprobeBin: string;
  inputPath: string;
}

export interface ProbeVideoHasAudioArgs {
  ffprobeBin: string;
  inputPath: string;
}

export interface RenderSegmentArgs {
  ffmpegBin: string;
  imagePath: string;
  audioPath: string;
  outputPath: string;
  durationMs: number;
  trailingSilenceMs: number;
  width: number;
  height: number;
  fps: number;
  motionEffect: ComicPanelMotionEffect;
}

export interface RenderVideoClipSegmentArgs {
  ffmpegBin: string;
  videoClipPaths: string[];
  audioPath: string;
  outputPath: string;
  durationMs: number;
  trailingSilenceMs: number;
  visualDurationMs: number;
  preserveClipAudio: boolean;
  clipAudioVolume: number;
  loopVideo: boolean;
  width: number;
  height: number;
  fps: number;
}

export interface ConcatVideoArgs {
  ffmpegBin: string;
  concatListPath: string;
  segmentPaths: string[];
  outputPath: string;
  width: number;
  height: number;
  fps: number;
}

export interface DeleteMediaFileArgs {
  path: string;
}

export interface MediaFileExistsArgs {
  path: string;
}

export interface ReadMediaFileBytesArgs {
  path: string;
}

export interface OpenMediaFileArgs {
  path: string;
}

export interface RevealMediaFileArgs {
  path: string;
}

export interface WriteTextFileArgs {
  path: string;
  content: string;
}

export interface WriteBinaryFileArgs {
  path: string;
  bytes: number[];
}

export interface ResolveMediaRootArgs {
  projectId: string;
  chapterId: string;
}

export const desktopComicVideoCommands = {
  generateTtsAudio: (args: GenerateTtsAudioArgs) =>
    invoke<GenerateTtsAudioResult>('generate_tts_audio', { args }),
  probeAudioDuration: (args: ProbeAudioDurationArgs) =>
    invoke<number>('probe_audio_duration', { args }),
  probeVideoDuration: (args: ProbeVideoDurationArgs) =>
    invoke<number>('probe_video_duration', { args }),
  probeVideoHasAudio: (args: ProbeVideoHasAudioArgs) =>
    invoke<boolean>('probe_video_has_audio', { args }),
  renderSegment: (args: RenderSegmentArgs) =>
    invoke<void>('render_comic_video_segment', { args }),
  renderVideoClipSegment: (args: RenderVideoClipSegmentArgs) =>
    invoke<void>('render_comic_video_clip_segment', { args }),
  concatVideo: (args: ConcatVideoArgs) =>
    invoke<void>('concat_comic_video', { args }),
  deleteMediaFile: (args: DeleteMediaFileArgs) =>
    invoke<void>('delete_media_file', { args }),
  mediaFileExists: (args: MediaFileExistsArgs) =>
    invoke<boolean>('media_file_exists', { args }),
  readMediaFileBytes: (args: ReadMediaFileBytesArgs) =>
    invoke<number[]>('read_media_file_bytes', { args }),
  openMediaFile: (args: OpenMediaFileArgs) =>
    invoke<void>('open_media_file', { args }),
  revealMediaFile: (args: RevealMediaFileArgs) =>
    invoke<void>('reveal_media_file', { args }),
  writeTextFile: (args: WriteTextFileArgs) =>
    invoke<void>('write_text_file', { args }),
  writeBinaryFile: (args: WriteBinaryFileArgs) =>
    invoke<void>('write_binary_file', { args }),
  resolveMediaRoot: (args: ResolveMediaRootArgs) =>
    invoke<string>('resolve_media_root', { args }),
};
