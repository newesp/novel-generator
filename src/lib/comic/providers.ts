import type { ImageProviderConfig, MediaAsset } from '../../types';
import { comfyUIProvider } from './comfyui-provider';
import { deepInfraFluxProvider } from './deepinfra-flux-provider';
import { googleGeminiImageProvider } from './google-gemini-image-provider';
import { openAICompatibleImageProvider } from './openai-image-provider';
import type { InterfaceLocale } from '../language-policy';

export type ReferenceImageMode = 'none' | 'single-input-image' | 'multi-reference';

export interface ImageProviderCapabilities {
  negativePrompt: boolean;
  seed: boolean;
  referenceImages: boolean;
  referenceMode: ReferenceImageMode;
  maxReferenceImages: number;
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
  referenceImages?: MediaAsset[];
  referenceImageLabels?: string[];
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
  deepInfraFluxProvider,
  googleGeminiImageProvider,
];

export function listImageProviders(): ImageGenerationProvider[] {
  return [...PROVIDERS];
}

export function getImageProvider(id: string): ImageGenerationProvider | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

const ENGLISH_PROVIDER_MESSAGES: Array<[RegExp, string]> = [
  [/Provider 設定類型不符/g, 'Provider configuration type does not match'],
  [/ComfyUI workflow 缺少 node/g, 'ComfyUI workflow is missing node'],
  [/缺少 ([^\n]+)/g, 'Missing $1'],
  [/設定可使用/g, 'Configuration is ready'],
  [/設定可用/g, 'Configuration is ready'],
  [/workflow JSON 格式錯誤/g, 'Invalid workflow JSON'],
  [/圖片 API 沒有回傳 image data/g, 'The image API returned no image data'],
  [/圖片 API 回應不含 url 或 b64_json/g, 'The image API response contains neither url nor b64_json'],
  [/圖片 API error/g, 'Image API error'],
  [/ComfyUI 未回傳 prompt_id/g, 'ComfyUI returned no prompt_id'],
  [/ComfyUI history 找不到 output image/g, 'No output image was found in ComfyUI history'],
  [/ComfyUI 產圖逾時/g, 'ComfyUI image generation timed out'],
];

export function localizeImageProviderMessage(message: string, locale: InterfaceLocale): string {
  if (locale !== 'en') return message;
  return ENGLISH_PROVIDER_MESSAGES.reduce(
    (localized, [pattern, replacement]) => localized.replace(pattern, replacement),
    message,
  );
}
