import { invoke } from '@tauri-apps/api/core';

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
}

export interface ConcatVideoArgs {
  ffmpegBin: string;
  concatListPath: string;
  outputPath: string;
}

export interface DeleteMediaFileArgs {
  path: string;
}

export interface MediaFileExistsArgs {
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
  renderSegment: (args: RenderSegmentArgs) =>
    invoke<void>('render_comic_video_segment', { args }),
  concatVideo: (args: ConcatVideoArgs) =>
    invoke<void>('concat_comic_video', { args }),
  deleteMediaFile: (args: DeleteMediaFileArgs) =>
    invoke<void>('delete_media_file', { args }),
  mediaFileExists: (args: MediaFileExistsArgs) =>
    invoke<boolean>('media_file_exists', { args }),
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
