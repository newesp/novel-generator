import type { DeepInfraFluxProviderConfig, ImageProviderConfig, MediaAsset } from '../../types';
import type { ImageGenerationProvider, ImageGenerationRequest, ImageGenerationResult } from './providers';

interface DeepInfraFluxPayload {
  prompt: string;
  width: number;
  height: number;
  num_images: number;
  negative_prompt?: string;
  input_image?: string;
  [key: `input_image_${number}`]: string | number | undefined;
}

interface NormalizedDeepInfraImage {
  url: string;
  mimeType: string;
}

export function buildDeepInfraFluxPayload(request: ImageGenerationRequest): DeepInfraFluxPayload {
  const payload: DeepInfraFluxPayload = {
    prompt: request.prompt,
    width: request.width,
    height: request.height,
    num_images: 1,
  };
  if (request.negativePrompt?.trim()) payload.negative_prompt = request.negativePrompt.trim();
  const usesNumberedFirstInput = isFluxKleinModel(request.providerConfig);
  (request.referenceImages ?? []).slice(0, 8).forEach((asset, index) => {
    const image = mediaAssetToInputImage(asset);
    if (!image) return;
    if (index === 0 && !usesNumberedFirstInput) payload.input_image = image;
    else payload[`input_image_${index + 1}`] = image;
  });
  return payload;
}

export function deepInfraFluxEndpoint(config: DeepInfraFluxProviderConfig): string {
  const base = config.baseUrl.trim().replace(/\/$/, '');
  if (!base) return '';
  if (base.includes('/inference/') || base.includes('/models/')) return base;
  return `${base}/inference/${config.model.replace(/^\/+/, '')}`;
}

export function normalizeDeepInfraFluxResponse(data: unknown): NormalizedDeepInfraImage {
  const record = data as Record<string, unknown>;
  const imageCandidates = [
    firstString(record.images),
    firstString(record.output),
    firstString(record.data),
    stringValue(record.image_url),
    stringValue(record.url),
    stringValue(record.b64_json),
  ].filter(Boolean);
  const first = imageCandidates[0];
  if (!first) throw new Error('DeepInfra FLUX response did not include an image');
  if (first.startsWith('http')) return { url: first, mimeType: mimeFromUrl(first) };
  if (first.startsWith('data:image/')) return { url: first, mimeType: mimeFromDataUri(first) };
  return { url: `data:image/png;base64,${first}`, mimeType: 'image/png' };
}

export const deepInfraFluxProvider: ImageGenerationProvider = {
  id: 'deepinfra-flux',
  label: 'DeepInfra FLUX-2',
  kind: 'online',
  capabilities: {
    negativePrompt: true,
    seed: false,
    referenceImages: true,
    referenceMode: 'multi-reference',
    maxReferenceImages: 8,
    batch: false,
    polling: false,
    outputFormats: ['png', 'jpg', 'webp'],
    freeformSize: true,
  },
  async validateConfig(config: ImageProviderConfig) {
    if (config.providerId !== 'deepinfra-flux') return { ok: false, message: 'Provider 設定類型不符' };
    if (!config.baseUrl.trim()) return { ok: false, message: '缺少 DeepInfra Base URL' };
    if (!config.apiKey.trim()) return { ok: false, message: '缺少 DeepInfra API Key' };
    if (!config.model.trim()) return { ok: false, message: '缺少 DeepInfra model' };
    return { ok: true, message: '設定可使用' };
  },
  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const config = request.providerConfig;
    if (config.providerId !== 'deepinfra-flux') throw new Error('Provider 設定類型不符');
    const endpoint = deepInfraFluxEndpoint(config);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(buildDeepInfraFluxPayload(request)),
    });
    if (!response.ok) throw new Error(`DeepInfra FLUX error ${response.status}: ${await response.text()}`);
    const normalized = normalizeDeepInfraFluxResponse(await response.json());
    return {
      ...normalized,
      providerId: this.id,
      generationParamsJson: JSON.stringify({
        model: config.model,
        width: request.width,
        height: request.height,
        referenceImageCount: request.referenceImages?.length ?? 0,
        referenceImageLabels: request.referenceImageLabels ?? [],
      }),
    };
  },
};

function mediaAssetToInputImage(asset: MediaAsset): string | undefined {
  if (!asset.url) return undefined;
  const comma = asset.url.indexOf(',');
  if (asset.url.startsWith('data:image/') && comma >= 0) return asset.url.slice(comma + 1);
  return asset.url;
}

function isFluxKleinModel(config: ImageProviderConfig): boolean {
  return config.providerId === 'deepinfra-flux'
    && config.model.toLocaleLowerCase().includes('flux-2-klein');
}

function firstString(value: unknown): string {
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') {
      const record = first as Record<string, unknown>;
      return stringValue(record.url) || stringValue(record.b64_json) || stringValue(record.image_url);
    }
  }
  return '';
}

function stringValue(value: unknown): string {
  return typeof value === 'string' && value ? value : '';
}

function mimeFromUrl(url: string): string {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/png';
}

function mimeFromDataUri(dataUri: string): string {
  const match = /^data:([^;]+);/.exec(dataUri);
  return match?.[1] ?? 'image/png';
}
