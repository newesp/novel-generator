import type { InterfaceLocale, WritingLanguage } from './types';

export interface PromptPair {
  systemPrompt: string;
  userPromptTemplate: string;
}

export type PromptTargetKey =
  | 'chapterDrafts'
  | 'chapterOutline'
  | 'characterProfile'
  | 'expandContent'
  | 'polishContent'
  | 'summaryGeneration'
  | 'wikiIngest';

export const DEFAULT_PROMPT_PAIRS_ZH: Record<PromptTargetKey, PromptPair> = {
  chapterDrafts: {
    systemPrompt: `你是一位資深小說架構師與策劃專家，擅長根據故事主題、大綱與角色資料，構思極具吸引力與張力的章節骨架與細綱。`,
    userPromptTemplate: `請為《{{storyTitle}}》構思章節骨架與重點草稿。\n題材：{{genre}}\n風格：{{style}}\n世界觀：{{worldSetting}}\n主線：{{mainPlot}}\n當前進度：第 {{currentChapterCount}} 章\n目標：構思後續章節大綱。`,
  },
  chapterOutline: {
    systemPrompt: `你是一位專業小說主編，專精於設計引人入勝的章節大綱與三幕結構節拍。`,
    userPromptTemplate: `請根據故事世界觀與主線大綱，生成章節《{{chapterTitle}}》的細部節拍與寫作要點。\n目標字數：{{targetWords}} 字\n語氣節拍：{{beat}}\n重要角色：{{characters}}`,
  },
  characterProfile: {
    systemPrompt: `你是一位小說角色設定專家，善於打造立體、生動且具備強烈動機與性格矛盾的角色。`,
    userPromptTemplate: `請根據以下資訊，生成詳細角色人設卡：\n角色名稱：{{characterName}}\n角色定位：{{role}}\n作品名稱：《{{storyTitle}}》\n簡介背景：{{background}}`,
  },
  expandContent: {
    systemPrompt: `你是一位小說精修作家，擅長豐富場景描寫、感官細節與心理刻畫，將簡略段落擴充為引人入勝的正文。`,
    userPromptTemplate: `請將以下段落進行擴充，增添細節描寫與心理刻畫：\n上下文背景：\n{{context}}\n待擴充段落：\n{{targetText}}`,
  },
  polishContent: {
    systemPrompt: `你是一位資深文字編輯，擅長潤飾文筆、流暢語感與提升文學質感，同時保持原作者語氣與劇情走向。`,
    userPromptTemplate: `請潤飾以下小說段落，提升語句流暢度與文采：\n{{targetText}}`,
  },
  summaryGeneration: {
    systemPrompt: `你是一位小說摘要與情報整理專家，能精準提煉章節核心進展、伏筆與關鍵事件。`,
    userPromptTemplate: `請提煉以下章節正文的精簡摘要與關鍵情報：\n章節：{{chapterTitle}}\n正文內容：\n{{content}}`,
  },
  wikiIngest: {
    systemPrompt: `你是一位小說世界觀與知識庫管理員，負責從新章節中抽取人名、勢力、物品與世界規則，並更新至 Wiki。`,
    userPromptTemplate: `請分析以下章節內容，抽取需新增或更新的 Wiki 實體（角色、地點、勢力、物品、設定）：\n{{content}}`,
  },
};

export const DEFAULT_PROMPT_PAIRS_EN: Record<PromptTargetKey, PromptPair> = {
  chapterDrafts: {
    systemPrompt: `You are a senior web novel architect and plotting expert, specializing in designing engaging chapter outlines and beats based on world setting and character profiles.`,
    userPromptTemplate: `Please draft chapter outlines and core plot beats for "{{storyTitle}}".\nGenre: {{genre}}\nStyle: {{style}}\nWorld Setting: {{worldSetting}}\nMain Plot: {{mainPlot}}\nCurrent Chapters: {{currentChapterCount}}\nGoal: Outline upcoming chapters.`,
  },
  chapterOutline: {
    systemPrompt: `You are a professional web novel editor specialized in crafting three-act chapter structures and dramatic escalation.`,
    userPromptTemplate: `Generate chapter beats and key writing points for chapter "{{chapterTitle}}".\nTarget Words: {{targetWords}}\nBeat / Tone: {{beat}}\nKey Characters: {{characters}}`,
  },
  characterProfile: {
    systemPrompt: `You are a character design expert skilled in creating multi-dimensional, memorable characters with clear internal conflicts and strong motivation.`,
    userPromptTemplate: `Create a detailed character profile based on the following input:\nCharacter Name: {{characterName}}\nRole: {{role}}\nStory Title: "{{storyTitle}}"\nBackground: {{background}}`,
  },
  expandContent: {
    systemPrompt: `You are a creative fiction writer who excels at expanding brief chapter summaries into rich prose with detailed sensory descriptions and internal monologue.`,
    userPromptTemplate: `Expand the following passage with rich sensory details and vivid narrative pace:\nContext:\n{{context}}\nPassage to Expand:\n{{targetText}}`,
  },
  polishContent: {
    systemPrompt: `You are a veteran prose editor focused on enhancing sentence flow, emotional impact, and narrative texture without altering plot progression.`,
    userPromptTemplate: `Polish the following text to improve readability, rhythm, and literary flair:\n{{targetText}}`,
  },
  summaryGeneration: {
    systemPrompt: `You are a plot summary specialist tasked with distilling chapter events into precise plot progress, foreshadowing notes, and key entity updates.`,
    userPromptTemplate: `Summarize key events, character developments, and major plot reveals in the following chapter:\nChapter: {{chapterTitle}}\nContent:\n{{content}}`,
  },
  wikiIngest: {
    systemPrompt: `You are a novel worldbuilding archivist responsible for extracting characters, factions, artifacts, and world rules from newly written chapters.`,
    userPromptTemplate: `Analyze the chapter text below and extract new or updated Wiki entities (characters, locations, factions, items, lore):\n{{content}}`,
  },
};

export function getDefaultPromptPair(
  targetKey: PromptTargetKey,
  locale: InterfaceLocale | WritingLanguage = 'zh-TW',
): PromptPair {
  const dictionary = locale === 'en' ? DEFAULT_PROMPT_PAIRS_EN : DEFAULT_PROMPT_PAIRS_ZH;
  return dictionary[targetKey] || DEFAULT_PROMPT_PAIRS_ZH[targetKey];
}
