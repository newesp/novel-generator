import type { GoogleGeminiImageProviderConfig, ImageProviderConfig, MediaAsset } from '../../types';
import type { ImageGenerationProvider, ImageGenerationRequest, ImageGenerationResult } from './providers';

interface NormalizedImage {
  url: string;
  mimeType: string;
}

type GeminiPart = Record<string, unknown>;

export function normalizeGoogleGeminiImageResponse(data: unknown): NormalizedImage {
  const candidates = Array.isArray((data as { candidates?: unknown[] }).candidates)
    ? (data as { candidates: unknown[] }).candidates
    : [];
  for (const candidate of candidates) {
    const parts = (candidate as { content?: { parts?: unknown[] } }).content?.parts ?? [];
    for (const part of parts) {
      const record = part as GeminiPart;
      const inlineData = (record.inlineData ?? record.inline_data) as Record<string, unknown> | undefined;
      const imageData = typeof inlineData?.data === 'string' ? inlineData.data : '';
      if (!imageData) continue;
      const mimeType = stringValue(inlineData?.mimeType) || stringValue(inlineData?.mime_type) || 'image/png';
      return { url: `data:${mimeType};base64,${imageData}`, mimeType };
    }
  }
  throw new Error('Google Gemini image response did not include inline image data');
}

export const googleGeminiImageProvider: ImageGenerationProvider = {
  id: 'google-gemini-image',
  label: 'Google Gemini Image',
  kind: 'online',
  capabilities: {
    negativePrompt: true,
    seed: false,
    referenceImages: true,
    referenceMode: 'multi-reference',
    maxReferenceImages: 14,
    batch: false,
    polling: false,
    outputFormats: ['png', 'jpg', 'webp'],
    freeformSize: false,
  },
  async validateConfig(config: ImageProviderConfig) {
    if (config.providerId !== 'google-gemini-image') return { ok: false, message: 'Provider 設定類型不符' };
    if (!config.baseUrl.trim()) return { ok: false, message: '缺少 Base URL' };
    if (!config.apiKey.trim()) return { ok: false, message: '缺少 API Key' };
    if (!config.model.trim()) return { ok: false, message: '缺少 Model' };
    return { ok: true, message: '設定可用' };
  },
  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const config = request.providerConfig;
    if (config.providerId !== 'google-gemini-image') throw new Error('Provider 設定類型不符');
    const endpoint = googleGeminiEndpoint(config);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body: JSON.stringify(buildGoogleGeminiImagePayload(request)),
    });
    if (!response.ok) throw new Error(`Google Gemini image API error ${response.status}: ${await response.text()}`);
    const normalized = normalizeGoogleGeminiImageResponse(await response.json());
    return {
      ...normalized,
      providerId: this.id,
      generationParamsJson: JSON.stringify({
        model: config.model,
        width: request.width,
        height: request.height,
        seed: request.seed,
        referenceImageCount: request.referenceImages?.length ?? 0,
      }),
    };
  },
};

export function googleGeminiEndpoint(config: GoogleGeminiImageProviderConfig): string {
  return `${config.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(config.model)}:generateContent`;
}

export function buildGoogleGeminiImagePayload(request: ImageGenerationRequest): Record<string, unknown> {
  const parts = [
    { text: googleGeminiPromptText(request) },
    ...((request.referenceImages ?? []).slice(0, 14).map(mediaAssetToGeminiPart).filter((part): part is GeminiPart => Boolean(part))),
  ];
  return {
    contents: [{ parts }],
  };
}

function googleGeminiPromptText(request: ImageGenerationRequest): string {
  return [
    request.prompt,
    request.negativePrompt?.trim() ? `Negative prompt: ${request.negativePrompt.trim()}` : '',
    request.referenceImageLabels?.length ? ['Reference image bindings:', ...request.referenceImageLabels].join('\n') : '',
  ].filter(Boolean).join('\n\n');
}

function mediaAssetToGeminiPart(asset: MediaAsset): GeminiPart | null {
  if (asset.url?.startsWith('data:image/')) {
    const comma = asset.url.indexOf(',');
    if (comma < 0) return null;
    return {
      inline_data: {
        mime_type: asset.mimeType || mimeFromDataUri(asset.url),
        data: asset.url.slice(comma + 1),
      },
    };
  }
  if (asset.url?.startsWith('http://') || asset.url?.startsWith('https://')) {
    return {
      file_data: {
        mime_type: asset.mimeType || 'image/png',
        file_uri: asset.url,
      },
    };
  }
  return null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function mimeFromDataUri(url: string): string {
  const match = /^data:([^;,]+)/.exec(url);
  return match?.[1] ?? 'image/png';
}
