import { invoke } from '@tauri-apps/api/core';

export interface GenerateTtsAudioArgs {
  edgeTtsBin: string;
  text: string;
  voice: string;
  outputPath: string;
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

export const desktopComicVideoCommands = {
  generateTtsAudio: (args: GenerateTtsAudioArgs) =>
    invoke<void>('generate_tts_audio', { args }),
  probeAudioDuration: (args: ProbeAudioDurationArgs) =>
    invoke<number>('probe_audio_duration', { args }),
  renderSegment: (args: RenderSegmentArgs) =>
    invoke<void>('render_comic_video_segment', { args }),
  concatVideo: (args: ConcatVideoArgs) =>
    invoke<void>('concat_comic_video', { args }),
  deleteMediaFile: (args: DeleteMediaFileArgs) =>
    invoke<void>('delete_media_file', { args }),
};
