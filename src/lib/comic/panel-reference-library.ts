import type { Chapter, ChapterComic, ComicPanel, MediaAsset } from '../../types';
import type { ComicReferenceBinding } from './prompt-composer';

export interface PanelReferenceOption {
  chapter: Chapter;
  panel: ComicPanel;
  asset: MediaAsset;
  label: string;
}

interface BuildPanelReferenceLibraryInput {
  chapters: Chapter[];
  comics: ChapterComic[];
  panels: ComicPanel[];
  assets: MediaAsset[];
  excludePanelId?: string;
}

export function buildPanelReferenceLibrary({
  chapters,
  comics,
  panels,
  assets,
  excludePanelId,
}: BuildPanelReferenceLibraryInput): PanelReferenceOption[] {
  const latestComicByChapter = new Map<string, ChapterComic>();
  for (const comic of comics) {
    const current = latestComicByChapter.get(comic.chapterId);
    if (!current || comic.updatedAt > current.updatedAt) latestComicByChapter.set(comic.chapterId, comic);
  }
  const chapterByComic = new Map(
    Array.from(latestComicByChapter.entries()).map(([chapterId, comic]) => [comic.id, chapters.find((item) => item.id === chapterId)]),
  );
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  return panels
    .flatMap((panel): PanelReferenceOption[] => {
      if (panel.id === excludePanelId || !panel.assetId) return [];
      const chapter = chapterByComic.get(panel.comicId);
      const asset = assetById.get(panel.assetId);
      if (!chapter || !asset || asset.kind !== 'comic_panel_image' || (!asset.url && !asset.path)) return [];
      return [{
        chapter,
        panel,
        asset,
        label: `selected panel reference, chapter ${chapter.order} panel ${panel.order}, continuity`,
      }];
    })
    .sort((left, right) => left.chapter.order - right.chapter.order || left.panel.order - right.panel.order);
}

export function mergeReferenceBindings(...groups: ComicReferenceBinding[][]): ComicReferenceBinding[] {
  const seen = new Set<string>();
  return groups.flat().filter((binding) => {
    if (seen.has(binding.assetId)) return false;
    seen.add(binding.assetId);
    return true;
  });
}
