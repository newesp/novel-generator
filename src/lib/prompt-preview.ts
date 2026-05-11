/**
 * 為偏好設定中「AI 提示詞」的預覽，從當前專案抓真實變數值。
 * 每個 template 對應一個 builder；任何缺漏的欄位由 caller 用 SAMPLES 補。
 */
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { formatCharacters } from './context-budget';
import type { AIPromptPrefs } from '../stores/settingsStore';

type PromptKey = keyof AIPromptPrefs;

/** 取目前選中的章節；沒有的話 fallback 到第一章 */
function getCurrentChapter() {
  const { chapters } = useProjectStore.getState();
  if (chapters.length === 0) return undefined;
  const { selectedChapterId } = useUIStore.getState();
  return chapters.find((c) => c.id === selectedChapterId) ?? chapters[0];
}

/**
 * 對指定 prompt key 組真實變數 dict。
 * 任何沒辦法取得真實值的欄位「不放入回傳物件」（caller 用 SAMPLES 補）。
 */
export function buildLivePromptVars(
  key: PromptKey,
  draftRules: string,
): Record<string, string> | null {
  const { project, chapters, characters } = useProjectStore.getState();
  if (!project) return null;

  const charactersFormatted = formatCharacters(characters);

  switch (key) {
    case 'chapterDraftsTemplate': {
      const isContinuation = chapters.length > 0;
      const count = 3; // 預覽用，固定值

      const contextChapters = isContinuation ? chapters.slice(-8) : [];

      const existingChaptersSection = isContinuation
        ? `\n\n## 現有章節（共 ${chapters.length} 章，以下列出最後 ${contextChapters.length} 章供參考；新章節必須延續這些章節的情節與伏筆）\n` +
          contextChapters.map((c, idx) => {
            const realIdx = chapters.length - contextChapters.length + idx + 1;
            const lines = [`第 ${realIdx} 章：${c.title}`, `節拍：${c.beat || '(未指定)'}`];
            if (c.points) lines.push(`要點：${c.points}`);
            return lines.join('\n');
          }).join('\n\n')
        : '';

      const charactersSection = charactersFormatted
        ? `\n\n## 已建立的角色（**章節要點中只能使用以下角色名字，不可自行創造新名字**；若需提到的角色不在此列，請改用「咖啡館老闆」「她的同事」等職稱或關係代稱）\n${charactersFormatted}`
        : '';

      const beatList = isContinuation
        ? '衝突升級 (Rising Action) / 中點轉折 (Midpoint Twist) / 高潮 (Climax) / 結局 (Resolution) / 鋪墊/過渡'
        : '引入 (Inciting Incident) / 衝突升級 (Rising Action) / 中點轉折 (Midpoint Twist) / 高潮 (Climax) / 結局 (Resolution) / 鋪墊/過渡';

      const taskIntro = isContinuation
        ? `你正在**為一本已開始的小說規劃後續章節**。現在故事已經寫到第 ${chapters.length} 章，請接續規劃第 ${chapters.length + 1} 章到第 ${chapters.length + count} 章（共 ${count} 章新章節）。`
        : `根據以下世界觀與主線劇情，為一本中文小說規劃開頭 ${count} 個章節。`;

      const rulesText = draftRules.trim();
      const continuationRulesSection = isContinuation && rulesText
        ? `\n\n# 接續規劃的硬性規則（必須遵守）\n\n${rulesText}`
        : '';

      return {
        taskIntro,
        worldSetting: project.worldSetting || '(未指定)',
        mainPlot: project.mainPlot || '(未指定)',
        charactersSection,
        existingChaptersSection,
        continuationRulesSection,
        count: String(count),
        beatList,
        pointsExtraHint: isContinuation ? '；只能使用已建立的角色名字' : '',
      };
    }

    case 'chapterContentTemplate': {
      const ch = getCurrentChapter();
      if (!ch) return null;

      const refChapter = ch.referenceChapterId
        ? chapters.find((c) => c.id === ch.referenceChapterId)
        : undefined;

      return {
        worldSetting: project.worldSetting || '(未設定)',
        mainPlotSection: project.mainPlot ? `\n\n### 主線劇情\n${project.mainPlot}` : '',
        charactersSection: charactersFormatted ? `\n\n### 主要角色\n${charactersFormatted}` : '',
        chapterTitle: ch.title || '(未命名)',
        beat: ch.beat || '自定義',
        points: ch.points || '無',
        targetWords: ch.targetWords?.toString() ?? '由你自行決定',
        referenceSection: refChapter && refChapter.content
          ? `\n\n## 前文（參考章節：${refChapter.title || '前一章'}）\n${refChapter.content}`
          : '',
        olderSummarySection: '',
        adjustInstructionSection: '',
        adjustInstructionRule: '',
      };
    }

    case 'chapterPointsTemplate': {
      const ch = getCurrentChapter();
      if (!ch) return null;

      const refChapter = ch.referenceChapterId
        ? chapters.find((c) => c.id === ch.referenceChapterId)
        : undefined;

      const refContent = refChapter?.content ?? '';
      const refTail = refContent.length > 1500 ? `（前略...）\n${refContent.slice(-1500)}` : refContent;
      const referenceSection = refChapter && refContent.trim()
        ? `\n\n## 參考章節（${refChapter.title}）\n${refTail}`
        : refChapter
          ? `\n\n## 參考章節\n${refChapter.title}（無正文，僅供參考標題）`
          : '';

      return {
        worldSetting: project.worldSetting || '(未指定)',
        mainPlot: project.mainPlot || '(未指定)',
        charactersSection: charactersFormatted
          ? `\n\n## 已建立的角色（章節要點只能使用以下角色名字，不可自編新人物）\n${charactersFormatted}`
          : '',
        chapterTitle: ch.title || '(尚未命名)',
        beat: ch.beat || '(未指定)',
        referenceSection,
        currentPointsSection: ch.points
          ? `\n\n## 目前的要點（僅供參考，請寫出更貼合節拍/參考章節的新版本）\n${ch.points}`
          : '',
      };
    }

    case 'inlineAdjustTemplate': {
      const ch = getCurrentChapter();
      if (!ch) return null;

      // 沒有真實的「選取段落」，盡量從章節正文取一小段示意
      const content = ch.content;
      if (!content) {
        // 章節沒正文 → 只給標題/節拍/要點是真實的，selectedText 等用 sample 補
        return {
          chapterTitle: ch.title || '(未命名)',
          beat: ch.beat || '自定義',
          points: ch.points || '無',
        };
      }
      // 取中段一句當「選取段落」示意；前後各 200 字當上下文
      const mid = Math.floor(content.length / 2);
      const selStart = Math.max(0, mid - 30);
      const selEnd = Math.min(content.length, mid + 30);
      const beforeContext = content.substring(Math.max(0, selStart - 200), selStart);
      const selectedText = content.substring(selStart, selEnd);
      const afterContext = content.substring(selEnd, Math.min(content.length, selEnd + 200));

      return {
        chapterTitle: ch.title || '(未命名)',
        beat: ch.beat || '自定義',
        points: ch.points || '無',
        beforeContext: beforeContext || '(無)',
        selectedText: selectedText || '(章節中段示意)',
        afterContext: afterContext || '(無)',
        // adjustInstruction 沒辦法從專案抓 → 留給 SAMPLES 補
      };
    }

    case 'chapterContinuationRules':
    default:
      // 純文字，沒有變數
      return {};
  }
}
