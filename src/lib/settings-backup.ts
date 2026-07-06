import type { LLMConfig } from '../types';
import { useSettingsStore, type AIPromptPrefs, type ImageGenerationPrefs, type InlineEditPrefs, type WikiPrefs } from '../stores/settingsStore';
import type { LintPrefs } from './lint/types';

export const SETTINGS_BACKUP_SCHEMA_VERSION = 1 as const;

export interface SettingsBackupData {
  llmConfig: Omit<LLMConfig, 'apiKey'> & { apiKey?: string };
  inlineEdit: InlineEditPrefs;
  aiPrompts: AIPromptPrefs;
  wikiPrefs: WikiPrefs;
  imageGenerationPrefs: Omit<ImageGenerationPrefs, 'openaiCompatible' | 'deepinfraFlux' | 'googleGeminiImage'> & {
    openaiCompatible: Omit<ImageGenerationPrefs['openaiCompatible'], 'apiKey'> & { apiKey?: string };
    deepinfraFlux: Omit<ImageGenerationPrefs['deepinfraFlux'], 'apiKey'> & { apiKey?: string };
    googleGeminiImage: Omit<ImageGenerationPrefs['googleGeminiImage'], 'apiKey'> & { apiKey?: string };
  };
  lintPrefs: LintPrefs;
}

export interface SettingsBackupSnapshot {
  app: 'novel-generator';
  kind: 'settings';
  schema: typeof SETTINGS_BACKUP_SCHEMA_VERSION;
  exportedAt: number;
  includesApiKeys: boolean;
  settings: SettingsBackupData;
}

export function exportSettingsSnapshot(includeApiKeys: boolean): SettingsBackupSnapshot {
  const { llmConfig, inlineEdit, aiPrompts, wikiPrefs, imageGenerationPrefs, lintPrefs } = useSettingsStore.getState();
  return {
    app: 'novel-generator',
    kind: 'settings',
    schema: SETTINGS_BACKUP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    includesApiKeys: includeApiKeys,
    settings: {
      llmConfig: includeApiKeys ? { ...llmConfig } : omitApiKey(llmConfig),
      inlineEdit: { ...inlineEdit },
      aiPrompts: { ...aiPrompts },
      wikiPrefs: { ...wikiPrefs },
      imageGenerationPrefs: {
        ...imageGenerationPrefs,
        comfyui: { ...imageGenerationPrefs.comfyui },
        openaiCompatible: includeApiKeys
          ? { ...imageGenerationPrefs.openaiCompatible }
          : omitApiKey(imageGenerationPrefs.openaiCompatible),
        deepinfraFlux: includeApiKeys
          ? { ...imageGenerationPrefs.deepinfraFlux }
          : omitApiKey(imageGenerationPrefs.deepinfraFlux),
        googleGeminiImage: includeApiKeys
          ? { ...imageGenerationPrefs.googleGeminiImage }
          : omitApiKey(imageGenerationPrefs.googleGeminiImage),
      },
      lintPrefs: {
        ...lintPrefs,
        checks: { ...lintPrefs.checks },
      },
    },
  };
}

export function importSettingsSnapshot(snapshot: SettingsBackupSnapshot): void {
  if (snapshot?.app !== 'novel-generator' || snapshot.kind !== 'settings') {
    throw new Error('檔案格式不是 novel-generator 偏好設定備份');
  }
  if (snapshot.schema !== SETTINGS_BACKUP_SCHEMA_VERSION) {
    throw new Error(`不支援的偏好設定備份版本：${snapshot.schema}`);
  }

  const settings = snapshot.settings;
  const store = useSettingsStore.getState();
  store.setLlmConfig(mergeApiKeyAware(store.llmConfig, settings.llmConfig));
  store.setInlineEdit(settings.inlineEdit);
  store.setAiPrompts(settings.aiPrompts);
  store.setWikiPrefs(settings.wikiPrefs);
  store.setImageGenerationPrefs({
    ...settings.imageGenerationPrefs,
    openaiCompatible: mergeApiKeyAware(
      store.imageGenerationPrefs.openaiCompatible,
      settings.imageGenerationPrefs.openaiCompatible,
    ),
    deepinfraFlux: mergeApiKeyAware(
      store.imageGenerationPrefs.deepinfraFlux,
      settings.imageGenerationPrefs.deepinfraFlux,
    ),
    googleGeminiImage: mergeApiKeyAware(
      store.imageGenerationPrefs.googleGeminiImage,
      settings.imageGenerationPrefs.googleGeminiImage,
    ),
  });
  store.setLintPrefs(settings.lintPrefs);
}

export async function readSettingsSnapshotFromFile(file: File): Promise<SettingsBackupSnapshot> {
  const text = await file.text();
  try {
    return JSON.parse(text) as SettingsBackupSnapshot;
  } catch {
    throw new Error('JSON 解析失敗，請確認檔案格式');
  }
}

export function describeSettingsSnapshot(snapshot: SettingsBackupSnapshot): string {
  const t = new Date(snapshot.exportedAt).toLocaleString();
  return `偏好設定 · ${snapshot.includesApiKeys ? '含 API Key' : '不含 API Key'} · 匯出於 ${t}`;
}

function omitApiKey<T extends { apiKey: string }>(value: T): Omit<T, 'apiKey'> {
  const rest: Partial<T> = { ...value };
  delete rest.apiKey;
  return rest as Omit<T, 'apiKey'>;
}

function mergeApiKeyAware<T extends { apiKey: string }>(
  current: T,
  incoming: Omit<T, 'apiKey'> & { apiKey?: string },
): T {
  return {
    ...current,
    ...incoming,
    apiKey: incoming.apiKey ?? current.apiKey,
  };
}
