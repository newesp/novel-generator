import type { ImageProviderConfig } from '../../types';
import { comfyUIProvider } from './comfyui-provider';
import { openAICompatibleImageProvider } from './openai-image-provider';

export interface ImageProviderCapabilities {
  negativePrompt: boolean;
  seed: boolean;
  referenceImages: boolean;
  batch: boolean;
  polling: boolean;
  outputFormats: Array<'png' | 'jpg' | 'webp'>;
  freeformSize: boolean;
  maxPromptChars?: number;
}

export interface ProviderHealth {
  ok: boolean;
  message: string;
}

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  panelId: string;
  providerConfig: ImageProviderConfig;
}

export interface ImageGenerationResult {
  url: string;
  mimeType: string;
  providerId: string;
  generationParamsJson: string;
}

export interface ImageGenerationProvider {
  id: ImageProviderConfig['providerId'];
  label: string;
  kind: 'local' | 'online';
  capabilities: ImageProviderCapabilities;
  validateConfig(config: ImageProviderConfig): Promise<ProviderHealth>;
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

const PROVIDERS: ImageGenerationProvider[] = [
  comfyUIProvider,
  openAICompatibleImageProvider,
];

export function listImageProviders(): ImageGenerationProvider[] {
  return [...PROVIDERS];
}

export function getImageProvider(id: string): ImageGenerationProvider | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}
