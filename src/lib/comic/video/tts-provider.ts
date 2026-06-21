import type { MediaAsset } from '../../../types';
import type { GenerateTtsAudioArgs, ProbeAudioDurationArgs } from './desktop-commands';
import { desktopComicVideoCommands } from './desktop-commands';

export interface TTSGenerationRequest {
  projectId: string;
  chapterId: string;
  text: string;
  voice: string;
  outputPath: string;
  edgeTtsBin: string;
  ffprobeBin: string;
}

export interface TTSGenerationResult {
  asset: MediaAsset;
  durationMs: number;
  providerId: string;
  voice: string;
}

export interface TTSProvider {
  id: string;
  label: string;
  generate(request: TTSGenerationRequest): Promise<TTSGenerationResult>;
}

export const edgeTtsProvider: TTSProvider = {
  id: 'edge-tts',
  label: 'Edge-TTS',
  async generate(request) {
    const ttsArgs: GenerateTtsAudioArgs = {
      edgeTtsBin: request.edgeTtsBin,
      text: request.text,
      voice: request.voice,
      outputPath: request.outputPath,
    };
    await desktopComicVideoCommands.generateTtsAudio(ttsArgs);

    const probeArgs: ProbeAudioDurationArgs = {
      ffprobeBin: request.ffprobeBin,
      inputPath: request.outputPath,
    };
    const durationMs = await desktopComicVideoCommands.probeAudioDuration(probeArgs);
    const now = Date.now();

    return {
      asset: {
        id: crypto.randomUUID(),
        projectId: request.projectId,
        chapterId: request.chapterId,
        kind: 'tts_audio',
        path: request.outputPath,
        mimeType: 'audio/mpeg',
        providerId: 'edge-tts',
        generationParamsJson: JSON.stringify({ voice: request.voice }),
        createdAt: now,
      },
      durationMs,
      providerId: 'edge-tts',
      voice: request.voice,
    };
  },
};
