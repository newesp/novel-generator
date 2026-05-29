import type { Character, Chapter, Project, WikiPage } from '../../types';
import { complete } from '../llm';
import { normalizeStoryboardDraft } from './storyboard';

export interface StoryboardGenerationInput {
  project: Project;
  chapter: Chapter;
  characters: Character[];
  wikiPages: WikiPage[];
  stylePreset: string;
  targetPanelCount: number;
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

  return `你是小說轉漫畫分鏡師。請把指定章節拆成連續漫畫圖片分鏡。

## 書籍
書名：${input.project.title}
類型：${input.project.genre}
風格：${input.project.style}
世界觀：${input.project.worldSetting}
主線：${input.project.mainPlot}

## 章節
標題：${input.chapter.title}
節拍：${input.chapter.beat}
要點：${input.chapter.points}
目標格數：${input.targetPanelCount}
漫畫風格：${input.stylePreset}

## 角色卡
${characterText}

## 相關 Wiki
${wikiText}

## 章節正文
${input.chapter.content}

## 輸出規則
- 只輸出 JSON，不要 markdown 說明。
- panels 必須按故事時間順序排列。
- 每格都要有可直接送圖片模型的 visualPrompt。
- visualPrompt 必須包含畫風、角色穩定外觀、場景、動作、構圖、光線。
- one-off background extras 可直接寫在 visualPrompt，例如「周圍站著十幾個居民」。
- 會跨多格出現的群體請放入 extraGroups；不要把群體龍套塞進 characters。
- extraGroups 必須永遠是合法 JSON array；沒有 recurring groups 時請輸出空陣列 []。
- 不要捏造正文沒有支撐的重大事件。

JSON schema:
{
  "chapterTitle": "string",
  "storyboardStyle": "string",
  "visualContinuityBible": {},
  "panels": [
    {
      "panelNumber": 1,
      "beat": "string",
      "characters": ["string"],
      "setting": "string",
      "action": "string",
      "emotion": "string",
      "shotType": "string",
      "cameraAngle": "string",
      "visualPrompt": "string",
      "negativePrompt": "string",
      "extraGroups": [
        {
          "label": "string",
          "count": 12,
          "role": "crowd | guards | civilians | creatures | vehicles | background",
          "prompt": "string",
          "visualPriority": "low | medium"
        }
      ],
      "narration": "string",
      "dialogue": [{"character":"string","text":"string"}],
      "durationSec": 4
    }
  ],
  "qualityChecks": { "notes": [] }
}`;
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
    .replace(/}\s*{/g, '},{')
    .replace(/]\s*\[/g, '],[')
    .replace(/"\s+"/g, '","')
    .replace(/(\d)\s+"/g, '$1,"')
    .replace(/"\s+([[{])/g, '",$1');
}
