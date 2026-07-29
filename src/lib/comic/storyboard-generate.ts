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

type CompleteFn = (prompt: string, options?: { maxTokens?: number; temperature?: number; responseFormat?: 'json_object'; writingLanguage?: string }) => Promise<string>;

const STORYBOARD_JSON_KEY_PATTERN = /^(?:chapterTitle|storyboardStyle|visualContinuityBible|panels|qualityChecks|notes|panelNumber|beat|characters|setting|location|action|emotion|shotType|cameraAngle|visualPrompt|negativePrompt|extraGroups|label|count|role|prompt|visualPriority|narration|dialogue|character|text|durationSec)$/;

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
  const rendered = renderTemplate(aiPrompts.comicStoryboardTemplate, {
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
  const exactNames = input.characters.map((character) => character.name.trim()).filter(Boolean);
  return [
    rendered,
    '',
    '## Character selection rules',
    `panels[].characters must use these exact names only: ${exactNames.length ? exactNames.join(', ') : '(none)'}.`,
    'Every named project character mentioned in a panel visualPrompt, action, dialogue, or narration must also appear in that panel characters array.',
    'Do not translate, romanize, abbreviate, or rename character names in panels[].characters.',
  ].join('\n');
}

export async function generateStoryboardDraft(
  input: StoryboardGenerationInput,
  completeFn: CompleteFn = complete,
): Promise<ReturnType<typeof normalizeStoryboardDraft>> {
  const prompt = buildStoryboardPrompt(input);
  const raw = await completeFn(prompt, { maxTokens: 8192, temperature: 0.2, responseFormat: 'json_object', writingLanguage: input.project.writingLanguage });
  return normalizeStoryboardDraft(parseJsonFromLLM(raw));
}

export function parseJsonFromLLM(raw: string): unknown {
  const trimmed = raw.replace(/^\uFEFF/, '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return parseLooseJson(extractJsonObject(fenced[1].trim()));

  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return parseLooseJson(extractJsonObject(unfenced.slice(start, end + 1)));
  }

  return parseLooseJson(extractJsonObject(unfenced));
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
  const repairedArrays = json
    .replace(/("extraGroups"\s*:\s*\[[\s\S]*?})\s*("(?:narration|dialogue|durationSec|visualPrompt|negativePrompt|shotType|cameraAngle|emotion|action|setting|characters|beat|panelNumber)")/g, '$1],$2')
    .replace(/,\s*([}\]])/g, '$1');

  return insertMissingCommasBetweenAdjacentTokens(repairRawNewlinesInStrings(repairedArrays))
    .replace(/,\s*([}\]])/g, '$1');
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  if (start < 0) return text.trim();

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1).trim();
    }
  }

  return text.slice(start).trim();
}

function insertMissingCommasBetweenAdjacentTokens(json: string): string {
  let output = '';
  let pendingWhitespace = '';
  let previousSignificant = '';
  let inString = false;
  let escaped = false;

  for (const char of json) {
    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
        previousSignificant = char;
      }
      continue;
    }

    if (/\s/.test(char)) {
      pendingWhitespace += char;
      continue;
    }

    if (shouldInsertMissingComma(previousSignificant, char)) {
      output += ',';
    }

    output += pendingWhitespace;
    pendingWhitespace = '';
    output += char;

    if (char === '"') {
      inString = true;
    } else {
      previousSignificant = char;
    }
  }

  return output + pendingWhitespace;
}

function repairRawNewlinesInStrings(json: string): string {
  let output = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i += 1) {
    const char = json[i];
    if (!inString) {
      output += char;
      if (char === '"') inString = true;
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      output += char;
      inString = false;
      continue;
    }

    if (char === '\n' || char === '\r') {
      const newline = char === '\r' && json[i + 1] === '\n' ? '\r\n' : char;
      if (newline.length === 2) i += 1;

      if (nextLineStartsProperty(json, i + 1)) {
        output += '"';
        output += newline;
        inString = false;
      } else {
        output += '\\n';
      }
      continue;
    }

    output += char;
  }

  if (inString) output += '"';
  return output;
}

function nextLineStartsProperty(json: string, index: number): boolean {
  const rest = json.slice(index);
  const match = rest.match(/^\s*"([^"]+)"\s*:/);
  return Boolean(match?.[1] && STORYBOARD_JSON_KEY_PATTERN.test(match[1]));
}

function shouldInsertMissingComma(previous: string, next: string): boolean {
  return endsJsonValue(previous) && startsJsonValueOrProperty(next);
}

function endsJsonValue(char: string): boolean {
  return char === '"' || char === ']' || char === '}' || /[0-9el]/.test(char);
}

function startsJsonValueOrProperty(char: string): boolean {
  return char === '"' || char === '{' || char === '[' || char === '-' || /[0-9tfn]/.test(char);
}
