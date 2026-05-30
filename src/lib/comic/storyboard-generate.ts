import type { Character, Chapter, Project, WikiPage } from '../../types';
import { complete } from '../llm';
import { renderTemplate } from '../prompt-template';
import { useSettingsStore } from '../../stores/settingsStore';
import { normalizeStoryboardDraft } from './storyboard';

export interface StoryboardGenerationInput {
  project: Project;
  chapter: Chapter;
  characters: Character[];
  wikiPages: WikiPage[];
  stylePreset: string;
  targetPanelCount: number;
  previousPanels?: Array<{ order: number; beat: string; visualPrompt: string }>;
}

type CompleteFn = (prompt: string, options?: { maxTokens?: number; temperature?: number }) => Promise<string>;

export function buildStoryboardPrompt(input: StoryboardGenerationInput): string {
  const characterText = input.characters.map((character) => [
    `- ${character.name}`,
    character.appearance && `外貌：${character.appearance}`,
    character.personality && `性格：${character.personality}`,
    character.background && `背景：${character.background}`,
    character.relations && `關係：${character.relations}`,
  ].filter(Boolean).join('；')).join('\n') || '(無)';

  const wikiText = input.wikiPages.slice(0, 12).map((page) =>
    `- ${page.type}/${page.slug}｜${page.title}：${page.description}`,
  ).join('\n') || '(無)';

  const regenerationSection = input.previousPanels?.length
    ? `\n\n## 重新生成要求\n這是重新生成分鏡，不要沿用上一版的格子拆法、beat 或 visualPrompt。請在忠於章節正文的前提下，重新選擇鏡頭、節奏與畫面焦點。\n\n上一版分鏡摘要（避免照抄）：\n${input.previousPanels.map((panel) => `- #${panel.order} ${panel.beat}｜${panel.visualPrompt}`).join('\n')}`
    : '';

  const { aiPrompts } = useSettingsStore.getState();
  return renderTemplate(aiPrompts.comicStoryboardTemplate, {
    projectSection: [
      `書名：${input.project.title}`,
      `類型：${input.project.genre}`,
      `風格：${input.project.style}`,
      `世界觀：${input.project.worldSetting}`,
      `主線：${input.project.mainPlot}`,
    ].join('\n'),
    chapterSection: [
      `標題：${input.chapter.title}`,
      `節拍：${input.chapter.beat}`,
      `要點：${input.chapter.points}`,
      `目標格數：${input.targetPanelCount}`,
      `漫畫風格：${input.stylePreset}`,
    ].join('\n'),
    characterCardsSection: characterText,
    wikiSection: wikiText,
    regenerationSection,
    chapterContent: input.chapter.content,
  });
}

export async function generateStoryboardDraft(
  input: StoryboardGenerationInput,
  completeFn: CompleteFn = complete,
): Promise<ReturnType<typeof normalizeStoryboardDraft>> {
  const prompt = buildStoryboardPrompt(input);
  const raw = await completeFn(prompt, { maxTokens: 4096, temperature: 0.4 });
  return normalizeStoryboardDraft(parseJsonFromLLM(raw));
}

export function parseJsonFromLLM(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return parseLooseJson(fenced[1].trim());

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return parseLooseJson(trimmed.slice(start, end + 1));
  }

  return parseLooseJson(trimmed);
}

function parseLooseJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch (originalError) {
    const repaired = repairCommonLLMJson(json);
    try {
      return JSON.parse(repaired);
    } catch {
      throw originalError;
    }
  }
}

function repairCommonLLMJson(json: string): string {
  return json
    .replace(/("extraGroups"\s*:\s*\[[\s\S]*?})\s*("(?:narration|dialogue|durationSec|visualPrompt|negativePrompt|shotType|cameraAngle|emotion|action|setting|characters|beat|panelNumber)")/g, '$1],$2')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/]\s*("[A-Za-z_][A-Za-z0-9_]*"\s*:)/g, '],$1')
    .replace(/}\s*("[A-Za-z_][A-Za-z0-9_]*"\s*:)/g, '},$1')
    .replace(/}\s*{/g, '},{')
    .replace(/]\s*\[/g, '],[')
    .replace(/"\s+"/g, '","')
    .replace(/(\d)\s+"/g, '$1,"')
    .replace(/"\s+([[{])/g, '",$1');
}
