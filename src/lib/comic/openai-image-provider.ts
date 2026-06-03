import type { ImageProviderConfig } from '../../types';
import type { ImageGenerationProvider, ImageGenerationRequest, ImageGenerationResult } from './providers';

interface NormalizedImage {
  url: string;
  mimeType: string;
}

export function normalizeOpenAIImageResponse(data: unknown): NormalizedImage {
  const first = ((data as { data?: Array<Record<string, unknown>> }).data ?? [])[0];
  if (!first) throw new Error('圖片 API 沒有回傳 image data');
  if (typeof first.b64_json === 'string' && first.b64_json) {
    return { url: `data:image/png;base64,${first.b64_json}`, mimeType: 'image/png' };
  }
  if (typeof first.url === 'string' && first.url) {
    return { url: first.url, mimeType: mimeFromUrl(first.url) };
  }
  throw new Error('圖片 API 回應不含 url 或 b64_json');
}

export const openAICompatibleImageProvider: ImageGenerationProvider = {
  id: 'openai-compatible-image',
  label: 'OpenAI-compatible Image',
  kind: 'online',
  capabilities: {
    negativePrompt: false,
    seed: false,
    referenceImages: false,
    referenceMode: 'none',
    maxReferenceImages: 0,
    batch: false,
    polling: false,
    outputFormats: ['png', 'jpg', 'webp'],
    freeformSize: false,
  },
  async validateConfig(config: ImageProviderConfig) {
    if (config.providerId !== 'openai-compatible-image') return { ok: false, message: 'Provider 設定類型不符' };
    if (!config.baseUrl.trim()) return { ok: false, message: '缺少 Base URL' };
    if (!config.apiKey.trim()) return { ok: false, message: '缺少 API Key' };
    if (!config.model.trim()) return { ok: false, message: '缺少 Model' };
    return { ok: true, message: '設定可用' };
  },
  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const config = request.providerConfig;
    if (config.providerId !== 'openai-compatible-image') throw new Error('Provider 設定類型不符');
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        prompt: request.prompt,
        size: `${request.width}x${request.height}`,
        n: 1,
        response_format: 'b64_json',
      }),
    });
    if (!response.ok) throw new Error(`圖片 API error ${response.status}: ${await response.text()}`);
    const normalized = normalizeOpenAIImageResponse(await response.json());
    return {
      ...normalized,
      providerId: this.id,
      generationParamsJson: JSON.stringify({ model: config.model, width: request.width, height: request.height }),
    };
  },
};

function mimeFromUrl(url: string): string {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/png';
}
