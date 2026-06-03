import type { ComfyUIImageProviderConfig, ImageProviderConfig, MediaAsset } from '../../types';
import type { ImageGenerationProvider, ImageGenerationRequest, ImageGenerationResult } from './providers';

type Workflow = Record<string, { inputs?: Record<string, unknown> }>;

interface ComfyBuildRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  referenceImages?: MediaAsset[];
}

export function buildComfyWorkflow(
  workflow: Workflow,
  config: Pick<ComfyUIImageProviderConfig,
    'promptNodeId' | 'negativePromptNodeId' | 'seedNodeId' | 'widthNodeId' | 'heightNodeId' | 'outputNodeId' | 'referenceImageNodeIds'>,
  request: ComfyBuildRequest,
): Workflow {
  const next = structuredClone(workflow);
  setInput(next, config.promptNodeId, 'text', request.prompt);
  if (config.negativePromptNodeId) setInput(next, config.negativePromptNodeId, 'text', request.negativePrompt ?? '');
  if (config.seedNodeId && request.seed !== undefined) setInput(next, config.seedNodeId, 'seed', request.seed);
  if (config.widthNodeId) setInput(next, config.widthNodeId, 'width', request.width);
  if (config.heightNodeId) setInput(next, config.heightNodeId, 'height', request.height);
  (config.referenceImageNodeIds ?? []).forEach((nodeId, index) => {
    const image = request.referenceImages?.[index];
    if (nodeId && image?.url) setInput(next, nodeId, 'image', image.url);
  });
  return next;
}

export function extractComfyOutputImages(history: unknown, baseUrl: string): string[] {
  const outputs = (history as { outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }> }).outputs ?? {};
  return Object.values(outputs)
    .flatMap((output) => output.images ?? [])
    .map((image) => {
      const params = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder ?? '',
        type: image.type ?? 'output',
      });
      return `${baseUrl.replace(/\/$/, '')}/view?${params.toString()}`;
    });
}

export const comfyUIProvider: ImageGenerationProvider = {
  id: 'comfyui',
  label: 'ComfyUI',
  kind: 'local',
  capabilities: {
    negativePrompt: true,
    seed: true,
    referenceImages: true,
    referenceMode: 'multi-reference',
    maxReferenceImages: 8,
    batch: false,
    polling: true,
    outputFormats: ['png', 'jpg', 'webp'],
    freeformSize: true,
  },
  async validateConfig(config: ImageProviderConfig) {
    if (config.providerId !== 'comfyui') return { ok: false, message: 'Provider 設定類型不符' };
    if (!config.baseUrl.trim()) return { ok: false, message: '缺少 ComfyUI Base URL' };
    if (!config.workflowJson.trim()) return { ok: false, message: '缺少 workflow JSON' };
    try {
      JSON.parse(config.workflowJson);
    } catch {
      return { ok: false, message: 'workflow JSON 格式錯誤' };
    }
    return { ok: true, message: '設定可用' };
  },
  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const config = request.providerConfig;
    if (config.providerId !== 'comfyui') throw new Error('Provider 設定類型不符');
    const base = config.baseUrl.replace(/\/$/, '');
    const workflow = buildComfyWorkflow(JSON.parse(config.workflowJson), config, request);
    const submit = await fetch(`${base}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
    });
    if (!submit.ok) throw new Error(`ComfyUI submit error ${submit.status}: ${await submit.text()}`);
    const promptId = (await submit.json()).prompt_id;
    if (!promptId) throw new Error('ComfyUI 未回傳 prompt_id');
    const history = await pollHistory(base, promptId);
    const images = extractComfyOutputImages(history[promptId] ?? history, base);
    if (!images[0]) throw new Error('ComfyUI history 找不到 output image');
    return {
      url: images[0],
      mimeType: 'image/png',
      providerId: this.id,
      generationParamsJson: JSON.stringify({ width: request.width, height: request.height, seed: request.seed }),
    };
  },
};

function setInput(workflow: Workflow, nodeId: string, key: string, value: unknown): void {
  const node = workflow[nodeId];
  if (!node) throw new Error(`ComfyUI workflow 缺少 node ${nodeId}`);
  node.inputs = { ...(node.inputs ?? {}), [key]: value };
}

async function pollHistory(baseUrl: string, promptId: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 60; i++) {
    const response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`);
    if (!response.ok) throw new Error(`ComfyUI history error ${response.status}: ${await response.text()}`);
    const data = await response.json();
    if (data[promptId] || data.outputs) return data;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('ComfyUI 產圖逾時');
}
