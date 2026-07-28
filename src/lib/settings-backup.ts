import type { LLMConfig, LLMProfile, MultiAgentPrefs } from '../types';
import { useSettingsStore, type AIPromptPrefs, type ImageGenerationPrefs, type InlineEditPrefs, type WikiPrefs } from '../stores/settingsStore';
import type { LintPrefs } from './lint/types';
import { createLLMProfile } from './llm-provider-defaults';
import type { GeneralPrefs } from './language-policy';

export const SETTINGS_BACKUP_SCHEMA_VERSION = 1 as const;

export interface SettingsBackupData {
  generalPrefs?: GeneralPrefs;
  llmConfig: Omit<LLMConfig, 'apiKey'> & { apiKey?: string };
  llmProfiles?: (Omit<LLMProfile, 'apiKey'> & { apiKey?: string })[];
  activeProfileId?: string;
  inlineEdit: InlineEditPrefs;
  aiPrompts: AIPromptPrefs;
  wikiPrefs: WikiPrefs;
  imageGenerationPrefs: Omit<ImageGenerationPrefs, 'openaiCompatible' | 'deepinfraFlux' | 'googleGeminiImage'> & {
    openaiCompatible: Omit<ImageGenerationPrefs['openaiCompatible'], 'apiKey'> & { apiKey?: string };
    deepinfraFlux: Omit<ImageGenerationPrefs['deepinfraFlux'], 'apiKey'> & { apiKey?: string };
    googleGeminiImage: Omit<ImageGenerationPrefs['googleGeminiImage'], 'apiKey'> & { apiKey?: string };
  };
  lintPrefs: LintPrefs;
  multiAgentPrefs?: MultiAgentPrefs;
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
  const { generalPrefs, llmConfig, llmProfiles, activeProfileId, inlineEdit, aiPrompts, wikiPrefs, imageGenerationPrefs, lintPrefs, multiAgentPrefs } = useSettingsStore.getState();
  const profilesToExport = (llmProfiles && llmProfiles.length > 0 ? llmProfiles : [llmConfig]).map((p) =>
    includeApiKeys ? { ...p } : omitApiKey(p),
  );
  return {
    app: 'novel-generator',
    kind: 'settings',
    schema: SETTINGS_BACKUP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    includesApiKeys: includeApiKeys,
    settings: {
      generalPrefs: { ...generalPrefs },
      llmConfig: includeApiKeys ? { ...llmConfig } : omitApiKey(llmConfig),
      llmProfiles: profilesToExport,
      activeProfileId: activeProfileId || llmConfig.id,
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
      multiAgentPrefs: { ...multiAgentPrefs },
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

  if (settings.generalPrefs) {
    store.setGeneralPrefs(settings.generalPrefs);
  }

  let importedProfiles: LLMProfile[] = [];
  if (settings.llmProfiles && settings.llmProfiles.length > 0) {
    importedProfiles = settings.llmProfiles.map((inc) => {
      const existing = (store.llmProfiles || []).find((p) => p.id === inc.id);
      const base = existing || createLLMProfile(inc.provider || 'custom', { id: inc.id });
      return mergeApiKeyAware(base, inc);
    });
  } else if (settings.llmConfig) {
    const existing = store.llmConfig;
    importedProfiles = [mergeApiKeyAware(existing, settings.llmConfig)];
  }

  const activeId = settings.activeProfileId && importedProfiles.some((p) => p.id === settings.activeProfileId)
    ? settings.activeProfileId
    : importedProfiles[0]?.id || 'default';

  store.setLlmProfiles(importedProfiles, activeId);
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
  if (settings.multiAgentPrefs) {
    store.setMultiAgentPrefs(settings.multiAgentPrefs);
  }
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
