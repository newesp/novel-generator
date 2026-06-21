import type { ComicPanel } from '../../../types';

export type ComicVideoValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateComicVideoInputs(panels: ComicPanel[]): ComicVideoValidationResult {
  const orderedPanels = [...panels].sort((a, b) => a.order - b.order);
  const missingImages = orderedPanels.filter((panel) => !panel.assetId);
  if (missingImages.length) {
    return {
      ok: false,
      message: `無法整章輸出 MP4：${panelList(missingImages)} 尚未建立圖片。請先產生圖片或刪除不需要的分鏡。`,
    };
  }

  const missingNarration = orderedPanels.filter((panel) => !panel.narration.trim());
  if (missingNarration.length) {
    return {
      ok: false,
      message: `無法整章輸出 MP4：${panelList(missingNarration)} 尚未填寫旁白。`,
    };
  }

  return { ok: true };
}

function panelList(panels: ComicPanel[]): string {
  return `分鏡 ${panels.map((panel) => `#${panel.order}`).join('、')}`;
}
