import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import type { Chapter, ChapterComic, Character, ComicPanel, ComicPanelImageVariant, ImageProviderConfig, MediaAsset, Project, SceneVisual } from '../../types';
import { storage } from '../../lib/storage';
import { generateStoryboardDraft } from '../../lib/comic/storyboard-generate';
import { getImageProvider } from '../../lib/comic/providers';
import { runImageJobQueue } from '../../lib/comic/image-job-queue';
import { persistableImageOutput } from '../../lib/comic/persistable-image-output';
import { canonicalizePanelCharacterTokens, composeComicImagePrompt, resolveCharacterToken } from '../../lib/comic/prompt-composer';
import type { ComicReferenceBinding } from '../../lib/comic/prompt-composer';
import { mapPanelAssets } from '../../lib/comic/media-assets';
import { resolveReferenceAssets } from '../../lib/comic/reference-assets';
import { loadComicCharacterSnapshot } from '../../lib/comic/comic-character-snapshot';
import { createPanelWriteQueue } from '../../lib/comic/panel-write-queue';
import { buildPanelReferenceLibrary, mergeReferenceBindings } from '../../lib/comic/panel-reference-library';
import type { PanelReferenceOption } from '../../lib/comic/panel-reference-library';
import { firstReferenceAssetId, mapReferenceThumbnails } from '../../lib/comic/visual-reference-thumbnails';
import {
  buildLegacyCurrentImageVariant,
  buildReadyImageVariant,
  canDeleteImageVariant,
  currentVariantDeleteBlockedMessage,
} from '../../lib/comic/image-variants';
import { movePanelById, removePanelById, reindexPanels } from '../../lib/comic/panel-order';
import { desktopComicVideoCommands } from '../../lib/comic/video/desktop-commands';
import { cleanupPanelVideoArtifacts } from '../../lib/comic/video/panel-cleanup';
import { edgeTtsProvider } from '../../lib/comic/video/tts-provider';
import { buildComicVideoLibrary, type ComicVideoLibraryItem } from '../../lib/comic/video/video-library';
import { validateComicVideoInputs } from '../../lib/comic/video/video-validation';
import { renderComicPanelSegment, renderComicVideo } from '../../lib/comic/video/video-renderer';
import { comicWorkspaceStateKey, resolveComicWorkspaceState, type ComicWorkspaceState } from '../../lib/comic/comic-workspace-state';
import { createDefaultSceneVisual, filterSceneVisuals, findPanelsUsingScene, removeSceneReferenceAssetId } from '../../lib/scene-visuals';
import { errorMessage } from '../../lib/error-message';
import { useSettingsStore } from '../../stores/settingsStore';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

interface ComicModalProps {
  open: boolean;
  onClose: () => void;
  project: Project;
  chapter: Chapter;
  chapters?: Chapter[];
  onChapterChange?: (chapterId: string) => void;
  characters: Character[];
}

export function ComicModal({ open, onClose, project, chapter, chapters = [chapter], onChapterChange, characters }: ComicModalProps) {
  const { imageGenerationPrefs, setImageGenerationPrefs } = useSettingsStore();
  const [comic, setComic] = useState<ChapterComic | null>(null);
  const [panels, setPanels] = useState<ComicPanel[]>([]);
  const [scenes, setScenes] = useState<SceneVisual[]>([]);
  const [availableCharacters, setAvailableCharacters] = useState<Character[]>(characters);
  const [panelAssets, setPanelAssets] = useState<Record<string, MediaAsset>>({});
  const [panelVariants, setPanelVariants] = useState<Record<string, ComicPanelImageVariant[]>>({});
  const [variantAssets, setVariantAssets] = useState<Record<string, MediaAsset>>({});
  const [panelReferenceOptions, setPanelReferenceOptions] = useState<PanelReferenceOption[]>([]);
  const [referenceLibraryRevision, setReferenceLibraryRevision] = useState(0);
  const [visualReferenceThumbnails, setVisualReferenceThumbnails] = useState<Record<string, string>>({});
  const [sceneReferenceAssets, setSceneReferenceAssets] = useState<Record<string, MediaAsset>>({});
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [expandedPrompt, setExpandedPrompt] = useState<{
    title: string;
    value: string;
    readOnly?: boolean;
    onApply?: (value: string) => void;
  } | null>(null);
  const [expandedPromptDraft, setExpandedPromptDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [panelVariantNotice, setPanelVariantNotice] = useState<Record<string, string>>({});
  const [selectorSearch, setSelectorSearch] = useState('');
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [pendingWorkspaceState, setPendingWorkspaceState] = useState<ComicWorkspaceState | null>(null);
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null);
  const [dragTargetPanelId, setDragTargetPanelId] = useState<string | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<{ key: string; label: string } | null>(null);
  const [videoVoice, setVideoVoice] = useState('zh-TW-HsiaoChenNeural');
  const [panelPauseMs, setPanelPauseMs] = useState(400);
  const [videoMessage, setVideoMessage] = useState('');
  const [panelVideoMessage, setPanelVideoMessage] = useState('');
  const [videoAsset, setVideoAsset] = useState<MediaAsset | null>(null);
  const [panelVideoAsset, setPanelVideoAsset] = useState<MediaAsset | null>(null);
  const [chapterVideoSettingsOpen, setChapterVideoSettingsOpen] = useState(false);
  const [videoLibraryOpen, setVideoLibraryOpen] = useState(false);
  const [videoLibraryMessage, setVideoLibraryMessage] = useState('');
  const [videoLibraryAssets, setVideoLibraryAssets] = useState<Record<string, MediaAsset>>({});
  const [videoLibraryRevision, setVideoLibraryRevision] = useState(0);
  const [edgeTtsBin, setEdgeTtsBin] = useState('edge-tts');
  const [ffmpegBin, setFfmpegBin] = useState('ffmpeg');
  const [ffprobeBin, setFfprobeBin] = useState('ffprobe');
  const [panelDurationDraft, setPanelDurationDraft] = useState<Record<string, string>>({});
  const restoredWorkspaceProjectRef = useRef<string | null>(null);
  const referencePickerMenuRef = useRef<HTMLDivElement | null>(null);
  const activeReferenceChapterRef = useRef<HTMLElement | null>(null);

  const provider = useMemo(() => getImageProvider(imageGenerationPrefs.providerId), [imageGenerationPrefs.providerId]);
  const panelWriteQueue = useMemo(
    () => createPanelWriteQueue((panelId, patch) => storage.comicPanels.update(panelId, patch)),
    [],
  );
  const providerLabel = imageGenerationPrefs.providerId === 'comfyui'
    ? 'ComfyUI HTTP API'
    : imageGenerationPrefs.providerId === 'deepinfra-flux'
    ? 'DeepInfra FLUX-2'
    : imageGenerationPrefs.providerId === 'google-gemini-image'
    ? 'Google Gemini Image'
    : 'OpenAI-compatible Image';

  const providerConfig = (): ImageProviderConfig => (
    imageGenerationPrefs.providerId === 'openai-compatible-image'
      ? { providerId: 'openai-compatible-image', ...imageGenerationPrefs.openaiCompatible }
      : imageGenerationPrefs.providerId === 'deepinfra-flux'
      ? { providerId: 'deepinfra-flux', ...imageGenerationPrefs.deepinfraFlux }
      : imageGenerationPrefs.providerId === 'google-gemini-image'
      ? { providerId: 'google-gemini-image', ...imageGenerationPrefs.googleGeminiImage }
      : { providerId: 'comfyui', ...imageGenerationPrefs.comfyui }
  );

  const openExpandedPrompt = (config: {
    title: string;
    value: string;
    readOnly?: boolean;
    onApply?: (value: string) => void;
  }) => {
    setExpandedPrompt(config);
    setExpandedPromptDraft(config.value);
  };

  const persistComicWorkspaceState = useCallback((state: ComicWorkspaceState) => {
    void storage.appMeta.put(comicWorkspaceStateKey(project.id), {
      chapterId: state.chapterId ?? chapter.id,
      panelId: state.panelId,
    });
  }, [chapter.id, project.id]);

  const selectPanel = useCallback((panelId: string) => {
    setSelectedPanelId(panelId);
    persistComicWorkspaceState({ panelId });
  }, [persistComicWorkspaceState]);

  const markDownloadStarted = (key: string, fileName: string) => {
    setDownloadNotice({ key, label: `已開始下載 ${fileName}` });
    setMessage(`已開始下載 ${fileName}。若瀏覽器詢問，請確認儲存位置。`);
  };

  useEffect(() => {
    if (!open) {
      setPendingWorkspaceState(null);
      restoredWorkspaceProjectRef.current = null;
      return;
    }
    if (restoredWorkspaceProjectRef.current === project.id) return;
    restoredWorkspaceProjectRef.current = project.id;
    let cancelled = false;
    void (async () => {
      const saved = await storage.appMeta.get<ComicWorkspaceState>(comicWorkspaceStateKey(project.id));
      if (cancelled || !saved) return;
      const savedChapterId = saved.chapterId && chapters.some((item) => item.id === saved.chapterId)
        ? saved.chapterId
        : undefined;
      setPendingWorkspaceState({ chapterId: savedChapterId, panelId: saved.panelId });
      if (savedChapterId && savedChapterId !== chapter.id) {
        onChapterChange?.(savedChapterId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chapter.id, chapters, onChapterChange, open, project.id]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const existingComics = await storage.comics.listByChapter(chapter.id);
      if (cancelled) return;
      const latestComic = existingComics[0];
      if (!latestComic) {
        setComic(null);
        setPanels([]);
        setPanelAssets({});
        setPreviewAsset(null);
        return;
      }
      const latestPanels = await storage.comicPanels.listByComic(latestComic.id);
      if (cancelled) return;
      setComic(latestComic);
      setPanels(latestPanels);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, chapter.id]);

  useEffect(() => {
    if (!downloadNotice) return;
    const timeoutId = window.setTimeout(() => setDownloadNotice(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [downloadNotice]);

  useEffect(() => {
    if (!panels.length) {
      setSelectedPanelId(null);
      return;
    }
    if (pendingWorkspaceState?.chapterId && pendingWorkspaceState.chapterId !== chapter.id) return;
    if (pendingWorkspaceState) {
      const resolved = resolveComicWorkspaceState(pendingWorkspaceState, { chapters, panels });
      if (resolved.panelId) setSelectedPanelId(resolved.panelId);
      setPendingWorkspaceState(null);
      return;
    }
    if (!selectedPanelId || !panels.some((panel) => panel.id === selectedPanelId)) {
      setSelectedPanelId(panels[0].id);
    }
  }, [chapter.id, chapters, panels, pendingWorkspaceState, selectedPanelId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([
      storage.sceneVisuals.listByProject(project.id),
      loadComicCharacterSnapshot({
        projectId: project.id,
        fallbackCharacters: characters,
        listByProject: storage.characters.listByProject,
      }),
    ]).then(([items, freshCharacters]) => {
      if (cancelled) return;
      setScenes(items);
      setAvailableCharacters(freshCharacters);
    });
    return () => {
      cancelled = true;
    };
  }, [open, project.id, characters]);

  useEffect(() => {
    if (!open) return;
    const thumbnailAssetIds = Array.from(new Set([
      ...availableCharacters.map(firstReferenceAssetId),
      ...scenes.map(firstReferenceAssetId),
    ].filter((id): id is string => Boolean(id))));
    const sceneAssetIds = Array.from(new Set(scenes.flatMap((scene) => scene.referenceAssetIds)));
    const assetIds = Array.from(new Set([...thumbnailAssetIds, ...sceneAssetIds]));
    let cancelled = false;
    if (!assetIds.length) {
      queueMicrotask(() => {
        if (!cancelled) {
          setVisualReferenceThumbnails({});
          setSceneReferenceAssets({});
        }
      });
      return () => {
        cancelled = true;
      };
    }
    void Promise.all(assetIds.map((id) => storage.mediaAssets.get(id))).then((assets) => {
      if (cancelled) return;
      const resolvedAssets = assets.filter((asset): asset is MediaAsset => Boolean(asset));
      setVisualReferenceThumbnails(mapReferenceThumbnails(resolvedAssets));
      setSceneReferenceAssets(resolvedAssets.reduce<Record<string, MediaAsset>>((acc, asset) => {
        if (sceneAssetIds.includes(asset.id)) acc[asset.id] = asset;
        return acc;
      }, {}));
    });
    return () => {
      cancelled = true;
    };
  }, [open, availableCharacters, scenes]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([
      storage.chapters.listByProject(project.id),
      storage.comics.listAll(),
      storage.comicPanels.listAll(),
      storage.mediaAssets.listAll(),
    ]).then(([projectChapters, allComics, allPanels, allAssets]) => {
      if (cancelled) return;
      setPanelReferenceOptions(buildPanelReferenceLibrary({
        chapters: projectChapters,
        comics: allComics.filter((item) => item.projectId === project.id),
        panels: allPanels,
        assets: allAssets.filter((item) => item.projectId === project.id),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [open, project.id, referenceLibraryRevision]);

  useEffect(() => {
    if (!open) return;
    const assetIds = Array.from(new Set(panels.map((panel) => panel.assetId).filter(Boolean)));
    let cancelled = false;
    if (!assetIds.length) {
      queueMicrotask(() => {
        if (cancelled) return;
        setPanelAssets({});
        setPreviewAsset(null);
      });
      return () => {
        cancelled = true;
      };
    }
    void Promise.all(assetIds.map((id) => storage.mediaAssets.get(id as string))).then((assets) => {
      if (cancelled) return;
      setPanelAssets(mapPanelAssets(panels, assets.filter((asset): asset is MediaAsset => Boolean(asset))));
    });
    return () => {
      cancelled = true;
    };
  }, [open, panels]);

  useEffect(() => {
    if (!open || !comic) return;
    let cancelled = false;
    void storage.comicPanelImageVariants.listByComic(comic.id).then(async (variants) => {
      if (cancelled) return;
      const currentVariantKeys = new Set(variants.map((variant) => `${variant.panelId}:${variant.assetId ?? ''}`));
      const importedVariants: ComicPanelImageVariant[] = [];
      for (const panel of panels) {
        if (!panel.assetId || currentVariantKeys.has(`${panel.id}:${panel.assetId}`)) continue;
        const asset = await storage.mediaAssets.get(panel.assetId);
        if (!asset) continue;
        if (asset.providerId === 'uploaded') continue;
        const variant = buildLegacyCurrentImageVariant({
          id: uuid(),
          projectId: project.id,
          chapterId: asset.chapterId ?? chapter.id,
          panel,
          asset,
          createdAt: asset.createdAt,
        });
        await storage.comicPanelImageVariants.add(variant);
        importedVariants.push(variant);
        currentVariantKeys.add(`${variant.panelId}:${variant.assetId ?? ''}`);
      }
      if (cancelled) return;
      const allVariants = [...variants, ...importedVariants];
      const byPanel = allVariants.reduce<Record<string, ComicPanelImageVariant[]>>((acc, variant) => {
        const panelVariants = acc[variant.panelId] ?? [];
        if (variant.assetId && panelVariants.some((item) => item.assetId === variant.assetId)) {
          return acc;
        }
        acc[variant.panelId] = [...panelVariants, variant];
        return acc;
      }, {});
      setPanelVariants(byPanel);
      const assetIds = Array.from(new Set(allVariants.map((variant) => variant.assetId).filter((id): id is string => Boolean(id))));
      const assets = await Promise.all(assetIds.map((id) => storage.mediaAssets.get(id)));
      if (cancelled) return;
      setVariantAssets(assets.filter((asset): asset is MediaAsset => Boolean(asset)).reduce<Record<string, MediaAsset>>((acc, asset) => {
        acc[asset.id] = asset;
        return acc;
      }, {}));
    });
    return () => {
      cancelled = true;
    };
  }, [open, comic, panels]);

  useEffect(() => {
    if (!open) return;
    const assetIds = Array.from(new Set([
      comic?.videoAssetId,
      ...panels.map((panel) => panel.segmentAssetId),
    ].filter((id): id is string => Boolean(id))));
    let cancelled = false;
    if (!assetIds.length) {
      queueMicrotask(() => {
        if (!cancelled) setVideoLibraryAssets({});
      });
      return () => {
        cancelled = true;
      };
    }
    void Promise.all(assetIds.map((id) => storage.mediaAssets.get(id))).then((assets) => {
      if (cancelled) return;
      setVideoLibraryAssets(assets.filter((asset): asset is MediaAsset => Boolean(asset)).reduce<Record<string, MediaAsset>>((acc, asset) => {
        acc[asset.id] = asset;
        return acc;
      }, {}));
    });
    return () => {
      cancelled = true;
    };
  }, [open, comic?.videoAssetId, panels, videoLibraryRevision]);

  const persistGeneratedPanel = async (
    panel: ComicPanel,
    config: ImageProviderConfig,
    referenceImages: MediaAsset[] = [],
    referenceImageLabels: string[] = [],
  ): Promise<{ assetId: string; url: string }> => {
    if (!provider) throw new Error('Image provider not found');
    const output = await provider.generateImage({
      panelId: panel.id,
      prompt: panel.finalPromptSnapshot || panel.visualPrompt,
      negativePrompt: panel.finalNegativePromptSnapshot || panel.negativePrompt,
      width: imageGenerationPrefs.width,
      height: imageGenerationPrefs.height,
      seed: panel.seed,
      providerConfig: config,
      referenceImages,
      referenceImageLabels,
    });
    const persistedOutput = await persistableImageOutput(output);
    const asset: MediaAsset = {
      id: uuid(),
      projectId: project.id,
      chapterId: chapter.id,
      kind: 'comic_panel_image',
      url: persistedOutput.url,
      mimeType: persistedOutput.mimeType,
      width: imageGenerationPrefs.width,
      height: imageGenerationPrefs.height,
      providerId: output.providerId,
      generationParamsJson: output.generationParamsJson,
      createdAt: new Date().getTime(),
    };
    await storage.mediaAssets.add(asset);
    const variant = buildReadyImageVariant({
      id: uuid(),
      projectId: project.id,
      chapterId: chapter.id,
      panel,
      asset,
      referenceAssetIds: referenceImages.map((item) => item.id),
      referenceImageLabels,
      createdAt: new Date().getTime(),
    });
    await storage.comicPanelImageVariants.add(variant);
    setPanelAssets((current) => ({ ...current, [panel.id]: asset }));
    setPanelVariants((current) => ({
      ...current,
      [panel.id]: [...(current[panel.id] ?? []), variant],
    }));
    setVariantAssets((current) => ({ ...current, [asset.id]: asset }));
    return { assetId: asset.id, url: persistedOutput.url };
  };

  const generateStoryboard = async () => {
    setBusy(true);
    setMessage('生成分鏡中...');
    try {
      const currentComic = comic;
      const previousPanels = panels.map((panel) => ({
        order: panel.order,
        beat: panel.beat,
        visualPrompt: panel.visualPrompt,
      }));
      const characterSnapshot = await loadComicCharacterSnapshot({
        projectId: project.id,
        fallbackCharacters: availableCharacters,
        listByProject: storage.characters.listByProject,
      });
      setAvailableCharacters(characterSnapshot);
      const wikiPages = await storage.wikiPages.list(chapter.projectId);
      const draft = await generateStoryboardDraft({
        project,
        chapter,
        characters: characterSnapshot,
        wikiPages,
        stylePreset: imageGenerationPrefs.stylePreset,
        targetPanelCount: imageGenerationPrefs.targetPanelCount,
        previousPanels: previousPanels.length ? previousPanels : undefined,
      });
      const now = new Date().getTime();
      const nextComic: ChapterComic = {
        id: currentComic?.id ?? uuid(),
        projectId: project.id,
        chapterId: chapter.id,
        title: `${chapter.title} 漫畫分鏡`,
        status: 'storyboard_ready',
        stylePreset: imageGenerationPrefs.stylePreset,
        providerId: imageGenerationPrefs.providerId,
        targetPanelCount: imageGenerationPrefs.targetPanelCount,
        visualContinuityBibleJson: draft.visualContinuityBibleJson,
        videoStatus: 'idle',
        videoAssetId: undefined,
        videoProviderId: undefined,
        videoSettingsJson: undefined,
        videoErrorMessage: undefined,
        createdAt: currentComic?.createdAt ?? now,
        updatedAt: now,
      };
      if (currentComic) {
        await cleanupMediaAssetFile(currentComic.videoAssetId);
        for (const panel of panels) {
          await cleanupPanelVideoArtifacts({
            panel,
            storage,
            commands: desktopComicVideoCommands,
          });
        }
        const oldVariants = await storage.comicPanelImageVariants.listByComic(currentComic.id);
        const oldAssetIds = Array.from(new Set(
          [
            ...panels.map((panel) => panel.assetId),
            ...oldVariants.map((variant) => variant.assetId),
          ].filter((assetId): assetId is string => Boolean(assetId)),
        ));
        for (const assetId of oldAssetIds) {
          await storage.mediaAssets.delete(assetId);
        }
        await storage.comicPanelImageVariants.deleteByComic(currentComic.id);
        await storage.comicPanels.deleteByComic(currentComic.id);
        await storage.comics.update(currentComic.id, nextComic);
      } else {
        await storage.comics.add(nextComic);
      }
      const nextPanels = draft.panels.map((panel) => ({
        ...panel,
        id: uuid(),
        comicId: nextComic.id,
        createdAt: now,
        updatedAt: now,
      }));
      await storage.comicPanels.bulkAdd(nextPanels);
      setComic(nextComic);
      setPanels(nextPanels);
      setPanelAssets({});
      setVideoAsset(null);
      setVideoMessage('');
      setPreviewAsset(null);
      setMessage(`已產生 ${nextPanels.length} 格分鏡，請確認後開始生圖。`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const updatePanel = (panel: ComicPanel, patch: Partial<ComicPanel>): Promise<void> => {
    persistComicWorkspaceState({ panelId: panel.id });
    const persistedPatch = { ...patch, updatedAt: new Date().getTime() };
    setPanels((current) => current.map((item) => (
      item.id === panel.id ? { ...item, ...persistedPatch } : item
    )));
    return panelWriteQueue.enqueue(panel.id, persistedPatch);
  };

  const persistPanelOrder = async (nextPanels: ComicPanel[]) => {
    const now = new Date().getTime();
    const nextPanelsWithTime = nextPanels.map((panel) => ({ ...panel, updatedAt: now }));
    setPanels(nextPanelsWithTime);
    await Promise.all(nextPanelsWithTime.map((panel) => (
      storage.comicPanels.update(panel.id, { order: panel.order, updatedAt: now })
    )));
    if (comic) {
      const nextComicPatch = { targetPanelCount: nextPanelsWithTime.length, updatedAt: now };
      setComic((current) => current ? { ...current, ...nextComicPatch } : current);
      await storage.comics.update(comic.id, nextComicPatch);
    }
  };

  const addPanelAfterSelected = async () => {
    if (!comic) return;
    const now = new Date().getTime();
    const selectedIndex = selectedPanel ? panels.findIndex((panel) => panel.id === selectedPanel.id) : panels.length - 1;
    const nextPanel: ComicPanel = {
      id: uuid(),
      comicId: comic.id,
      order: panels.length + 1,
      beat: '新增分鏡',
      characters: [],
      location: selectedPanel?.location ?? '',
      shotType: selectedPanel?.shotType ?? '',
      cameraAngle: selectedPanel?.cameraAngle ?? '',
      visualPrompt: '',
      negativePrompt: '',
      dialogue: '',
      narration: '',
      durationSec: selectedPanel?.durationSec ?? 0,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
    const insertAt = Math.max(0, selectedIndex + 1);
    const nextPanels = reindexPanels([
      ...panels.slice(0, insertAt),
      nextPanel,
      ...panels.slice(insertAt),
    ]);
    selectPanel(nextPanel.id);
    await storage.comicPanels.add(nextPanel);
    await persistPanelOrder(nextPanels);
    setMessage(`已新增分鏡 #${nextPanels.find((panel) => panel.id === nextPanel.id)?.order ?? nextPanel.order}。`);
  };

  const deletePanel = async (panel: ComicPanel) => {
    if (!comic || panels.length <= 1) {
      setMessage('至少需要保留一格分鏡。');
      return;
    }
    if (!window.confirm(`刪除分鏡 #${panel.order}？這會移除該格已生成圖片與歷史版本。`)) return;

    const variants = await storage.comicPanelImageVariants.listByPanel(panel.id);
    const assetIds = Array.from(new Set([
      panel.assetId,
      ...variants.map((variant) => variant.assetId),
    ].filter((assetId): assetId is string => Boolean(assetId))));
    await cleanupPanelVideoArtifacts({
      panel,
      storage,
      commands: desktopComicVideoCommands,
    });
    await storage.comicPanelImageVariants.deleteByPanel(panel.id);
    await storage.comicPanels.delete(panel.id);
    await Promise.all(assetIds.map((assetId) => storage.mediaAssets.delete(assetId)));
    if (comic.videoAssetId || comic.videoStatus === 'ready') {
      const staleVideoPatch: Partial<ChapterComic> = {
        videoStatus: 'idle',
        videoAssetId: undefined,
        videoErrorMessage: '刪除分鏡後，影片需重新輸出。',
        updatedAt: Date.now(),
      };
      setComic((current) => current ? { ...current, ...staleVideoPatch } : current);
      await storage.comics.update(comic.id, staleVideoPatch);
    }

    const nextPanels = removePanelById(panels, panel.id);
    setSelectedPanelId((current) => {
      const nextSelectedPanelId = current === panel.id
        ? nextPanels[Math.min(panel.order - 1, nextPanels.length - 1)]?.id ?? null
        : current;
      if (nextSelectedPanelId) persistComicWorkspaceState({ panelId: nextSelectedPanelId });
      return nextSelectedPanelId;
    });
    setPanelAssets((current) => {
      const next = { ...current };
      delete next[panel.id];
      return next;
    });
    setPanelVariants((current) => {
      const next = { ...current };
      delete next[panel.id];
      return next;
    });
    setVariantAssets((current) => {
      const next = { ...current };
      for (const assetId of assetIds) delete next[assetId];
      return next;
    });
    await persistPanelOrder(nextPanels);
    setReferenceLibraryRevision((current) => current + 1);
    setMessage('分鏡已刪除並重新排序。');
  };

  const cleanupMediaAssetFile = async (assetId: string | undefined): Promise<void> => {
    if (!assetId) return;
    const asset = await storage.mediaAssets.get(assetId);
    if (asset?.path) {
      await desktopComicVideoCommands.deleteMediaFile({ path: asset.path });
    }
    await storage.mediaAssets.delete(assetId);
  };

  const renderPanelVideo = async (targetPanel: ComicPanel) => {
    if (!comic) return;
    if (!targetPanel.assetId) {
      setPanelVideoMessage(`分鏡 #${targetPanel.order} 尚未建立圖片。`);
      return;
    }
    if (!targetPanel.narration.trim()) {
      setPanelVideoMessage(`分鏡 #${targetPanel.order} 尚未填寫旁白。`);
      return;
    }

    try {
      setBusy(true);
      setPanelVideoMessage(`正在輸出分鏡 #${targetPanel.order} MP4...`);
      setVideoLibraryMessage(`正在輸出 ${targetPanel.order} 號分鏡 MP4...`);
      const mediaRoot = await desktopComicVideoCommands.resolveMediaRoot({
        projectId: comic.projectId,
        chapterId: comic.chapterId,
      });
      const asset = await renderComicPanelSegment({
        comic,
        panel: targetPanel,
        storage,
        ttsProvider: edgeTtsProvider,
        commands: desktopComicVideoCommands,
        settings: {
          mediaRoot,
          edgeTtsBin,
          ffmpegBin,
          ffprobeBin,
          voice: videoVoice,
          panelPauseMs,
          width: 1920,
          height: 1080,
          fps: 30,
        },
      });
      const refreshedPanel = await storage.comicPanels.get(targetPanel.id);
      if (refreshedPanel) {
        setPanels((current) => current.map((panel) => (
          panel.id === refreshedPanel.id ? refreshedPanel : panel
        )));
      } else {
        setPanels((current) => current.map((panel) => (
          panel.id === targetPanel.id ? { ...panel, segmentAssetId: asset.id, updatedAt: Date.now() } : panel
        )));
      }
      setVideoLibraryAssets((current) => ({ ...current, [asset.id]: asset }));
      setVideoLibraryRevision((current) => current + 1);
      if (selectedPanel?.id === targetPanel.id) setPanelVideoAsset(asset);
      setPanelVideoMessage(`分鏡 #${targetPanel.order} MP4 已輸出完成。`);
      setVideoLibraryMessage(`分鏡 #${targetPanel.order} MP4 已輸出完成。`);
    } catch (error) {
      const message = errorMessage(error);
      setPanelVideoMessage(message);
      setVideoLibraryMessage(message);
      await storage.comicPanels.update(targetPanel.id, {
        ttsStatus: 'failed',
        ttsErrorMessage: message,
        updatedAt: Date.now(),
      });
      setPanels((current) => current.map((panel) => (
        panel.id === targetPanel.id
          ? { ...panel, ttsStatus: 'failed', ttsErrorMessage: message, updatedAt: Date.now() }
          : panel
      )));
    } finally {
      setBusy(false);
    }
  };

  const renderSelectedPanelVideo = async () => {
    if (!selectedPanel) return;
    await renderPanelVideo(selectedPanel);
  };

  const renderVideo = async () => {
    if (!comic) return;
    const orderedPanels = [...panels].sort((a, b) => a.order - b.order);
    const validation = validateComicVideoInputs(orderedPanels);
    if (!validation.ok) {
      setVideoMessage(validation.message);
      setVideoLibraryMessage(validation.message);
      return;
    }

    try {
      setBusy(true);
      setVideoMessage('正在輸出旁白影片...');
      setVideoLibraryMessage('正在輸出整章 MP4...');
      const mediaRoot = await desktopComicVideoCommands.resolveMediaRoot({
        projectId: comic.projectId,
        chapterId: comic.chapterId,
      });
      const asset = await renderComicVideo({
        comic,
        panels: orderedPanels,
        storage,
        ttsProvider: edgeTtsProvider,
        commands: desktopComicVideoCommands,
        writeTextFile: (path, content) => desktopComicVideoCommands.writeTextFile({ path, content }),
        settings: {
          mediaRoot,
          edgeTtsBin,
          ffmpegBin,
          ffprobeBin,
          voice: videoVoice,
          panelPauseMs,
          width: 1920,
          height: 1080,
          fps: 30,
        },
      });
      setVideoAsset(asset);
      setVideoLibraryAssets((current) => ({ ...current, [asset.id]: asset }));
      setVideoLibraryRevision((current) => current + 1);
      setComic((current) => current ? {
        ...current,
        videoStatus: 'ready',
        videoAssetId: asset.id,
        videoProviderId: 'ffmpeg',
        videoSettingsJson: asset.generationParamsJson,
        videoErrorMessage: undefined,
        updatedAt: Date.now(),
      } : current);
      setVideoMessage('影片已輸出完成。');
      setVideoLibraryMessage('整章 MP4 已輸出完成。');
    } catch (error) {
      const message = errorMessage(error);
      setVideoMessage(message);
      setVideoLibraryMessage(message);
      await storage.comics.update(comic.id, {
        videoStatus: 'failed',
        videoErrorMessage: message,
        updatedAt: Date.now(),
      });
      setComic((current) => current ? {
        ...current,
        videoStatus: 'failed',
        videoErrorMessage: message,
        updatedAt: Date.now(),
      } : current);
    } finally {
      setBusy(false);
    }
  };

  const openVideoLibraryItem = async (item: ComicVideoLibraryItem) => {
    if (!item.path) {
      setVideoLibraryMessage(`${item.label} 找不到影片檔路徑。`);
      return;
    }
    try {
      await desktopComicVideoCommands.openMediaFile({ path: item.path });
      setVideoLibraryMessage(`已開啟 ${item.label}。`);
    } catch (error) {
      setVideoLibraryMessage(errorMessage(error));
    }
  };

  const revealVideoLibraryItem = async (item: ComicVideoLibraryItem) => {
    if (!item.path) {
      setVideoLibraryMessage(`${item.label} 找不到影片檔路徑。`);
      return;
    }
    try {
      await desktopComicVideoCommands.revealMediaFile({ path: item.path });
      setVideoLibraryMessage(`已定位 ${item.label}。`);
    } catch (error) {
      setVideoLibraryMessage(errorMessage(error));
    }
  };

  const deleteVideoLibraryItem = async (item: ComicVideoLibraryItem) => {
    if (!item.assetId) return;
    if (!window.confirm(`刪除 ${item.label}？這會移除影片檔與資料庫紀錄。`)) return;
    try {
      await cleanupMediaAssetFile(item.assetId);
      setVideoLibraryAssets((current) => {
        const next = { ...current };
        delete next[item.assetId as string];
        return next;
      });
      if (item.kind === 'chapter' && comic) {
        const patch: Partial<ChapterComic> = {
          videoStatus: 'idle',
          videoAssetId: undefined,
          videoProviderId: undefined,
          videoSettingsJson: undefined,
          videoErrorMessage: undefined,
          updatedAt: Date.now(),
        };
        await storage.comics.update(comic.id, patch);
        setComic((current) => current ? { ...current, ...patch } : current);
        setVideoAsset(null);
      }
      if (item.kind === 'panel' && item.panelId) {
        await storage.comicPanels.update(item.panelId, {
          segmentAssetId: undefined,
          updatedAt: Date.now(),
        });
        setPanels((current) => current.map((panel) => (
          panel.id === item.panelId ? { ...panel, segmentAssetId: undefined, updatedAt: Date.now() } : panel
        )));
        if (selectedPanel?.id === item.panelId) setPanelVideoAsset(null);
      }
      setVideoLibraryRevision((current) => current + 1);
      setVideoLibraryMessage(`已刪除 ${item.label}。`);
    } catch (error) {
      setVideoLibraryMessage(errorMessage(error));
    }
  };

  const rerenderVideoLibraryItem = async (item: ComicVideoLibraryItem) => {
    if (item.kind === 'chapter') {
      await renderVideo();
      return;
    }
    const panel = panels.find((candidate) => candidate.id === item.panelId);
    if (!panel) {
      setVideoLibraryMessage(`${item.label} 找不到對應分鏡。`);
      return;
    }
    await renderPanelVideo(panel);
  };

  const updatePanelDurationDraft = (panel: ComicPanel, value: string) => {
    setPanelDurationDraft((current) => ({ ...current, [panel.id]: value }));
    if (value.trim() === '') {
      void updatePanel(panel, { durationSec: 0 });
      return;
    }

    const durationSec = Number(value);
    if (!Number.isFinite(durationSec) || durationSec < 0) return;
    void updatePanel(panel, { durationSec });
  };

  const clearPanelDurationDraft = (panel: ComicPanel) => {
    setPanelDurationDraft((current) => {
      const next = { ...current };
      delete next[panel.id];
      return next;
    });
  };

  const movePanel = async (panelId: string, targetPanelId: string) => {
    const nextPanels = movePanelById(panels, panelId, targetPanelId);
    if (nextPanels.every((panel, index) => panel.id === panels[index]?.id && panel.order === panels[index]?.order)) return;
    await persistPanelOrder(nextPanels);
  };

  const startPanelPointerDrag = (event: PointerEvent<HTMLElement>, panelId: string) => {
    if (busy || event.button !== 0) return;
    setDraggingPanelId(panelId);
  };

  const enterPanelPointerDropTarget = (targetPanelId: string) => {
    if (!draggingPanelId || draggingPanelId === targetPanelId || busy) return;
    setDragTargetPanelId(targetPanelId);
    void movePanel(draggingPanelId, targetPanelId);
  };

  const stopPanelPointerDrag = () => {
    setDraggingPanelId(null);
    setDragTargetPanelId(null);
  };

  useEffect(() => {
    if (!draggingPanelId) return;
    const stopDragging = () => {
      setDraggingPanelId(null);
      setDragTargetPanelId(null);
    };
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [draggingPanelId]);

  const togglePanelCharacter = (panel: ComicPanel, character: Character, enabled: boolean) => {
    const tokens = new Set(canonicalizePanelCharacterTokens(panel.characters, availableCharacters));
    tokens.delete(character.id);
    if (enabled) tokens.add(character.id);
    void updatePanel(panel, { characters: Array.from(tokens) });
  };

  const panelCharacterSelected = (panel: ComicPanel, character: Character) => (
    panel.characters.some((token) => resolveCharacterToken(token, availableCharacters)?.id === character.id)
  );

  const panelCharacterNames = (panel: ComicPanel) => panel.characters.map((token) => (
    resolveCharacterToken(token, availableCharacters)?.name
  )).filter((name): name is string => Boolean(name)).filter((name, index, names) => names.indexOf(name) === index);

  const activeScene = (panel: ComicPanel) => scenes.find((scene) => scene.slug === panel.sceneSlug);

  const referenceThumbnail = (source: { referenceAssetIds?: string[] }) => {
    const assetId = firstReferenceAssetId(source);
    return assetId ? visualReferenceThumbnails[assetId] : undefined;
  };

  const previewImageUrl = (url: string, label: string) => {
    setPreviewAsset({
      id: `preview-${label}`,
      projectId: project.id,
      kind: 'comic_panel_image',
      url,
      mimeType: 'image/*',
      createdAt: new Date().getTime(),
    });
  };

  const togglePanelReference = (panel: ComicPanel, assetId: string, enabled: boolean) => {
    const ids = new Set(panel.referenceAssetIds ?? []);
    if (enabled) ids.add(assetId);
    else ids.delete(assetId);
    void updatePanel(panel, { referenceAssetIds: Array.from(ids) });
  };

  const referenceOptionsForPanel = (panel: ComicPanel) => (
    panelReferenceOptions.filter((option) => option.panel.id !== panel.id).filter((option) => (
      !selectorSearch.trim()
      || `${option.chapter.title} ${option.chapter.order + 1} ${option.panel.order} ${option.panel.beat}`.toLocaleLowerCase().includes(selectorSearch.trim().toLocaleLowerCase())
    ))
  );

  const filteredCharacters = availableCharacters.filter((character) => (
    !selectorSearch.trim()
    || `${character.name} ${character.appearance} ${character.race}`.toLocaleLowerCase().includes(selectorSearch.trim().toLocaleLowerCase())
  ));

  const filteredScenes = filterSceneVisuals(scenes, selectorSearch);
  const selectedPanel = panels.find((panel) => panel.id === selectedPanelId) ?? panels[0];
  const selectedPanelReferenceOptions = selectedPanel ? referenceOptionsForPanel(selectedPanel) : [];
  const referenceChapterKey = selectedPanelReferenceOptions.map((option) => option.chapter.id).join('|');
  const selectedPanelAsset = selectedPanel ? panelAssets[selectedPanel.id] : undefined;
  const videoLibraryItems = buildComicVideoLibrary({
    comic,
    panels,
    assets: Object.values(videoLibraryAssets),
  });

  useEffect(() => {
    if (!open || !selectedPanel) return;
    const container = referencePickerMenuRef.current;
    const target = activeReferenceChapterRef.current;
    if (!container || !target) return;
    const frameId = window.requestAnimationFrame(() => {
      container.scrollTo({
        top: Math.max(0, target.offsetTop - container.offsetTop),
        behavior: 'smooth',
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [chapter.id, open, referenceChapterKey, selectedPanel?.id]);

  const refreshScenes = async () => {
    setScenes(await storage.sceneVisuals.listByProject(project.id));
  };

  const createSceneFromPanel = async (panel: ComicPanel) => {
    const title = panel.location.trim() || `Scene ${scenes.length + 1}`;
    const scene = createDefaultSceneVisual({
      id: uuid(),
      projectId: project.id,
      title,
      prompt: panel.location.trim(),
    });
    const existing = await storage.sceneVisuals.findBySlug(project.id, scene.slug);
    const target = existing ?? scene;
    if (!existing) await storage.sceneVisuals.add(scene);
    await updatePanel(panel, { sceneSlug: target.slug });
    await refreshScenes();
  };

  const selectPanelVariant = async (panel: ComicPanel, variant: ComicPanelImageVariant) => {
    if (!variant.assetId) return;
    await updatePanel(panel, { assetId: variant.assetId, status: 'ready' });
    const asset = await storage.mediaAssets.get(variant.assetId);
    if (asset) setPanelAssets((current) => ({ ...current, [panel.id]: asset }));
    setPanelVariantNotice((current) => ({ ...current, [panel.id]: '' }));
    setReferenceLibraryRevision((current) => current + 1);
  };

  const deletePanelVariant = async (panel: ComicPanel, variant: ComicPanelImageVariant) => {
    if (!canDeleteImageVariant({ panelAssetId: panel.assetId, variantAssetId: variant.assetId })) {
      const notice = currentVariantDeleteBlockedMessage();
      setMessage(notice);
      setPanelVariantNotice((current) => ({ ...current, [panel.id]: notice }));
      return;
    }
    await storage.comicPanelImageVariants.delete(variant.id);
    if (variant.assetId) await storage.mediaAssets.delete(variant.assetId);
    setPanelVariants((current) => ({
      ...current,
      [panel.id]: (current[panel.id] ?? []).filter((item) => item.id !== variant.id),
    }));
    if (variant.assetId) {
      setVariantAssets((current) => {
        const next = { ...current };
        delete next[variant.assetId as string];
        return next;
      });
    }
    setPanelVariantNotice((current) => ({ ...current, [panel.id]: '' }));
    setReferenceLibraryRevision((current) => current + 1);
  };

  const updateScene = async (scene: SceneVisual, patch: Partial<SceneVisual>) => {
    const next = { ...scene, ...patch, updatedAt: new Date().getTime() };
    setScenes((current) => current.map((item) => item.id === scene.id ? next : item));
    try {
      await storage.sceneVisuals.update(scene.id, next);
    } catch (error) {
      setMessage(errorMessage(error));
      await refreshScenes();
    }
  };

  const deleteScene = async (scene: SceneVisual) => {
    const projectComics = (await storage.comics.listAll()).filter((item) => item.projectId === project.id);
    const projectComicIds = new Set(projectComics.map((item) => item.id));
    const projectPanels = (await storage.comicPanels.listAll()).filter((panel) => projectComicIds.has(panel.comicId));
    const usedPanels = findPanelsUsingScene(projectPanels, scene.slug);
    const message = usedPanels.length
      ? `場景「${scene.title}」目前被 ${usedPanels.length} 格分鏡引用。刪除後這些分鏡會清除場景設定。確定要刪除？`
      : `刪除場景「${scene.title}」？`;
    if (!window.confirm(message)) return;
    const usedPanelIds = new Set(usedPanels.map((panel) => panel.id));
    const now = Date.now();
    try {
      await Promise.all(usedPanels.map((panel) => (
        storage.comicPanels.update(panel.id, { sceneSlug: undefined, updatedAt: now })
      )));
      await storage.sceneVisuals.delete(scene.id);
      setPanels((current) => current.map((panel) => (
        usedPanelIds.has(panel.id) ? { ...panel, sceneSlug: undefined, updatedAt: now } : panel
      )));
      await refreshScenes();
      setMessage(`已刪除場景「${scene.title}」。`);
    } catch (error) {
      setMessage(errorMessage(error));
      await refreshScenes();
    }
  };

  const sceneReferenceList = (scene: SceneVisual) => (
    scene.referenceAssetIds
      .map((assetId) => sceneReferenceAssets[assetId])
      .filter((asset): asset is MediaAsset => Boolean(asset))
  );

  const assetIsReferencedOutsideScene = (assetId: string, sceneId: string) => (
    scenes.some((scene) => scene.id !== sceneId && scene.referenceAssetIds.includes(assetId))
    || availableCharacters.some((character) => character.referenceAssetIds?.includes(assetId))
    || panels.some((panel) => panel.assetId === assetId || panel.referenceAssetIds?.includes(assetId))
    || panelReferenceOptions.some((option) => option.asset.id === assetId)
  );

  const uploadSceneReference = async (scene: SceneVisual, files: FileList | null) => {
    if (!files?.length) return;
    const uploaded: MediaAsset[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const asset: MediaAsset = {
        id: uuid(),
        projectId: project.id,
        kind: 'scene_reference_image',
        url: await readFileAsDataUrl(file),
        mimeType: file.type,
        sizeBytes: file.size,
        createdAt: new Date().getTime(),
      };
      await storage.mediaAssets.add(asset);
      uploaded.push(asset);
    }
    if (!uploaded.length) return;
    setSceneReferenceAssets((current) => ({
      ...current,
      ...uploaded.reduce<Record<string, MediaAsset>>((acc, asset) => {
        acc[asset.id] = asset;
        return acc;
      }, {}),
    }));
    await updateScene(scene, {
      referenceAssetIds: [...scene.referenceAssetIds, ...uploaded.map((asset) => asset.id)],
    });
  };

  const removeSceneReference = async (scene: SceneVisual, assetId: string) => {
    const nextReferenceAssetIds = removeSceneReferenceAssetId(scene.referenceAssetIds, assetId);
    const nextScene = { ...scene, referenceAssetIds: nextReferenceAssetIds, updatedAt: new Date().getTime() };
    setScenes((current) => current.map((item) => item.id === scene.id ? nextScene : item));
    try {
      await storage.sceneVisuals.update(scene.id, nextScene);
    } catch (error) {
      setMessage(errorMessage(error));
      await refreshScenes();
      return;
    }
    if (!assetIsReferencedOutsideScene(assetId, scene.id)) {
      await storage.mediaAssets.delete(assetId);
      setSceneReferenceAssets((current) => {
        const next = { ...current };
        delete next[assetId];
        return next;
      });
      setVisualReferenceThumbnails((current) => {
        const next = { ...current };
        delete next[assetId];
        return next;
      });
    }
  };

  const preparePanelForGeneration = async (
    panel: ComicPanel,
    sourcePanels: ComicPanel[],
    generatedByOrder: Map<number, ComicPanel>,
    characterSnapshot: Character[],
  ): Promise<{ panel: ComicPanel; referenceImages: MediaAsset[]; referenceImageLabels: string[] }> => {
    const canonicalPanel = {
      ...panel,
      characters: canonicalizePanelCharacterTokens(panel.characters, characterSnapshot),
    };
    const composed = composeComicImagePrompt({
      panel: canonicalPanel,
      stylePreset: comic?.stylePreset || imageGenerationPrefs.stylePreset,
      characters: characterSnapshot,
      scenes,
    });
    const continuity = await resolveContinuityReference(canonicalPanel, sourcePanels, generatedByOrder);
    const selectedBindings = (canonicalPanel.referenceAssetIds ?? []).map((assetId) => {
      const option = panelReferenceOptions.find((item) => item.asset.id === assetId);
      return { assetId, label: option?.label ?? `selected panel reference ${assetId}` };
    });
    const referenceBindings: ComicReferenceBinding[] = mergeReferenceBindings(
      composed.referenceBindings,
      selectedBindings,
      continuity.assetId ? [{ assetId: continuity.assetId, label: 'continuity previous panel reference image' }] : [],
    );
    const referenceAssetIds = referenceBindings.map((binding) => binding.assetId);
    const resolved = await resolveReferenceAssets(referenceAssetIds, (id) => storage.mediaAssets.get(id));
    const warnings = [...composed.warnings, ...continuity.warnings, ...resolved.warnings];
    const usableReferences = provider?.capabilities.referenceImages
      ? resolved.assets.slice(0, provider.capabilities.maxReferenceImages)
      : [];
    const usableBindings = usableReferences.map((asset) => (
      referenceBindings.find((binding) => binding.assetId === asset.id)
      ?? { assetId: asset.id, label: `reference image ${asset.id}` }
    ));
    if (resolved.assets.length && !provider?.capabilities.referenceImages) {
      warnings.push(`${providerLabel} does not support reference images; character, scene, and continuity images were skipped.`);
    }
    if (resolved.assets.length > usableReferences.length) {
      warnings.push(`${providerLabel} supports ${provider?.capabilities.maxReferenceImages ?? 0} reference images; extra images were skipped.`);
    }
    const prompt = [
      composed.prompt,
      usableBindings.length ? referenceBindingPrompt(usableBindings) : '',
      continuity.assetId || selectedBindings.length
        ? 'Panel references: Use selected panel images for continuity, lighting, palette, props, and action flow. Do not copy the exact camera angle unless this panel asks for it.'
        : '',
    ].filter(Boolean).join('\n');
    return {
      panel: {
        ...canonicalPanel,
        finalPromptSnapshot: prompt,
        finalNegativePromptSnapshot: composed.negativePrompt,
        errorMessage: warnings.length ? warnings.join('\n') : undefined,
      },
      referenceImages: usableReferences,
      referenceImageLabels: usableBindings.map((binding) => binding.label),
    };
  };

  const resolveContinuityReference = async (
    panel: ComicPanel,
    sourcePanels: ComicPanel[],
    generatedByOrder: Map<number, ComicPanel>,
  ): Promise<{ assetId?: string; warnings: string[] }> => {
    if (!panel.useContinuityReference) return { warnings: [] };
    const previousSameComic = generatedByOrder.get(panel.order - 1)
      ?? sourcePanels.find((item) => item.order === panel.order - 1);
    if (previousSameComic?.assetId) return { assetId: previousSameComic.assetId, warnings: [] };
    if (panel.order !== 1) {
      return { warnings: [`Panel ${panel.order} requested continuity reference, but previous panel has no ready image.`] };
    }

    const chapters = await storage.chapters.listByProject(project.id);
    const previousChapter = [...chapters].reverse().find((item) => item.order < chapter.order);
    if (!previousChapter) return { warnings: ['First panel requested continuity reference, but no previous chapter was found.'] };
    const previousComics = await storage.comics.listByChapter(previousChapter.id);
    const previousComic = previousComics[0];
    if (!previousComic) return { warnings: ['First panel requested continuity reference, but previous chapter has no comic.'] };
    const previousPanels = await storage.comicPanels.listByComic(previousComic.id);
    const lastReadyPanel = [...previousPanels].reverse().find((item) => item.status === 'ready' && item.assetId);
    if (!lastReadyPanel?.assetId) {
      return { warnings: ['First panel requested continuity reference, but previous chapter has no ready final panel image.'] };
    }
    return { assetId: lastReadyPanel.assetId, warnings: [] };
  };

  const generateImages = async () => {
    if (!provider || !comic) return;
    setBusy(true);
    setMessage('漫畫圖片生成中...');
    try {
      const config = providerConfig();
      const health = await provider.validateConfig(config);
      if (!health.ok) throw new Error(health.message);
      const characterSnapshot = await loadComicCharacterSnapshot({
        projectId: project.id,
        fallbackCharacters: availableCharacters,
        listByProject: storage.characters.listByProject,
      });
      setAvailableCharacters(characterSnapshot);
      await storage.comics.update(comic.id, { status: 'generating', updatedAt: new Date().getTime() });
      const generatedByOrder = new Map<number, ComicPanel>();
      const results = await runImageJobQueue({
        panels,
        onPanelUpdate: async (panel) => {
          setPanels((current) => current.map((item) => item.id === panel.id ? panel : item));
          await storage.comicPanels.update(panel.id, panel);
        },
        generate: async (panel) => {
          const prepared = await preparePanelForGeneration(panel, panels, generatedByOrder, characterSnapshot);
          await storage.comicPanels.update(panel.id, prepared.panel);
          setPanels((current) => current.map((item) => item.id === panel.id ? prepared.panel : item));
          const output = await persistGeneratedPanel(prepared.panel, config, prepared.referenceImages, prepared.referenceImageLabels);
          generatedByOrder.set(panel.order, { ...prepared.panel, status: 'ready', assetId: output.assetId });
          return { ...output, panel: prepared.panel };
        },
      });
      const failed = results.filter((panel) => panel.status === 'failed').length;
      await storage.comics.update(comic.id, { status: failed ? 'partial' : 'ready', updatedAt: new Date().getTime() });
      setPanels(results);
      setReferenceLibraryRevision((current) => current + 1);
      setMessage(failed ? `完成，但 ${failed} 格失敗，可修改後重試。` : '漫畫圖片已生成。');
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const regeneratePanelImage = async (panel: ComicPanel) => {
    if (!provider || !comic) return;
    setBusy(true);
    setMessage(`Regenerating panel #${panel.order}...`);
    try {
      const config = providerConfig();
      const health = await provider.validateConfig(config);
      if (!health.ok) throw new Error(health.message);
      const characterSnapshot = await loadComicCharacterSnapshot({
        projectId: project.id,
        fallbackCharacters: availableCharacters,
        listByProject: storage.characters.listByProject,
      });
      setAvailableCharacters(characterSnapshot);
      const generatedByOrder = new Map<number, ComicPanel>();
      const prepared = await preparePanelForGeneration(panel, panels, generatedByOrder, characterSnapshot);
      const generating: ComicPanel = {
        ...prepared.panel,
        status: 'generating',
        updatedAt: new Date().getTime(),
      };
      await updatePanel(panel, generating);
      const output = await persistGeneratedPanel(generating, config, prepared.referenceImages, prepared.referenceImageLabels);
      await updatePanel(generating, {
        status: 'ready',
        assetId: output.assetId,
        updatedAt: new Date().getTime(),
      });
      setReferenceLibraryRevision((current) => current + 1);
      setMessage(`Panel #${panel.order} image regenerated.`);
    } catch (error) {
      await updatePanel(panel, {
        status: 'failed',
        errorMessage: errorMessage(error),
        updatedAt: new Date().getTime(),
      });
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const uploadPanelImage = async (panel: ComicPanel, files: FileList | null) => {
    const file = files?.[0];
    if (!file || !comic) return;
    if (!file.type.startsWith('image/')) {
      setMessage('請上傳圖片檔。');
      return;
    }
    setBusy(true);
    try {
      const now = new Date().getTime();
      const asset: MediaAsset = {
        id: uuid(),
        projectId: project.id,
        chapterId: chapter.id,
        kind: 'comic_panel_image',
        url: await readFileAsDataUrl(file),
        mimeType: file.type || 'image/*',
        sizeBytes: file.size,
        providerId: 'uploaded',
        generationParamsJson: JSON.stringify({ source: 'manual_upload', fileName: file.name }),
        createdAt: now,
      };
      await storage.mediaAssets.add(asset);
      const variant = buildReadyImageVariant({
        id: uuid(),
        projectId: project.id,
        chapterId: chapter.id,
        panel,
        asset,
        referenceAssetIds: [],
        referenceImageLabels: ['manual upload'],
        createdAt: now,
      });
      await storage.comicPanelImageVariants.add(variant);
      await updatePanel(panel, { assetId: asset.id, status: 'ready' });
      setPanelAssets((current) => ({ ...current, [panel.id]: asset }));
      setPanelVariants((current) => ({
        ...current,
        [panel.id]: [...(current[panel.id] ?? []).filter((item) => item.assetId !== asset.id), variant],
      }));
      setVariantAssets((current) => ({ ...current, [asset.id]: asset }));
      setPanelVariantNotice((current) => ({ ...current, [panel.id]: '' }));
      setReferenceLibraryRevision((current) => current + 1);
      setMessage(`已上傳圖片並加入 #${panel.order} 歷史圖。`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={`轉漫畫：${chapter.title}`}
      width={1100}
      fullScreen
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>關閉</Button>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" onClick={generateStoryboard} disabled={busy || !chapter.content.trim()}>
            {panels.length ? '重新生成分鏡' : '生成分鏡'}
          </Button>
          <Button variant="primary" onClick={generateImages} disabled={busy || !panels.length || !provider}>
            開始生圖
          </Button>
          <Button variant="secondary" onClick={() => setChapterVideoSettingsOpen(true)} disabled={busy || !comic}>
            整章影片設定
          </Button>
          <Button variant="secondary" onClick={() => setVideoLibraryOpen(true)} disabled={!comic}>
            影片庫
          </Button>
          {videoMessage && <span className="comic-footer-message" aria-live="polite">{videoMessage}</span>}
          <Button variant="primary" onClick={() => void renderVideo()} disabled={busy || !comic || panels.length === 0}>
            整章輸出 MP4
          </Button>
        </>
      }
    >
      <div className="comic-modal">
        <button
          type="button"
          className="comic-main-close-button"
          onClick={onClose}
          disabled={busy}
          aria-label="關閉轉漫畫"
          title="關閉"
        >
          ×
        </button>
        <section className="comic-settings">
          <div className="comic-provider-summary">
            <FieldLabel label="圖片提供商" help="圖片 provider 在「偏好設定 → 圖片生成」調整。這裡只顯示目前使用的全域設定。" />
            <strong>{providerLabel}</strong>
          </div>
          <label>
            <FieldLabel label="畫風" help="本章漫畫的畫風描述，會進入分鏡與最終圖片 prompt。" />
            <input
              className="toolbar-input"
              value={imageGenerationPrefs.stylePreset}
              onChange={(event) => setImageGenerationPrefs({ stylePreset: event.target.value })}
            />
          </label>
          <label>
            <FieldLabel label="格數" help="希望 LLM 拆成幾格分鏡。短場景可用 4-6，完整章節建議 8-20。" />
            <input
              className="toolbar-input"
              type="number"
              value={imageGenerationPrefs.targetPanelCount}
              onChange={(event) => setImageGenerationPrefs({ targetPanelCount: Number(event.target.value) || 8 })}
            />
          </label>
        </section>

        {message && <p className="comic-message">{message}</p>}
        {videoMessage && <p className="comic-message">{videoMessage}</p>}
        {downloadNotice && <p className="comic-download-notice" aria-live="polite">{downloadNotice.label}</p>}

        <div className="comic-workspace">
          <aside className="comic-rail">
            <section className="comic-rail-section">
              <div className="comic-rail-header"><strong>章節</strong><span>{chapters.length} 章</span></div>
              <select
                className="toolbar-input"
                value={chapter.id}
                onChange={(event) => {
                  persistComicWorkspaceState({ chapterId: event.target.value });
                  onChapterChange?.(event.target.value);
                }}
                disabled={busy || !onChapterChange}
              >
                {chapters.map((item) => (
                  <option value={item.id} key={item.id}>
                    第 {item.order + 1} 章｜{item.title}
                  </option>
                ))}
              </select>
            </section>
            <section className="comic-rail-section">
              <div className="comic-rail-header">
                <strong>分鏡</strong>
                <span>{selectedPanel ? `目前選 #${selectedPanel.order}` : `${panels.length} 格`}</span>
              </div>
              <button
                type="button"
                className="comic-panel-add-button"
                onClick={() => void addPanelAfterSelected()}
                disabled={busy || !comic}
                title="新增分鏡"
              >
                + 新增分鏡
              </button>
              <div className="comic-panel-mini-list">
                {panels.map((panel) => (
                  <div
                    className={`comic-panel-mini ${selectedPanel?.id === panel.id ? 'active' : ''} ${draggingPanelId === panel.id ? 'dragging' : ''} ${dragTargetPanelId === panel.id ? 'drop-target' : ''}`}
                    key={panel.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectPanel(panel.id)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      selectPanel(panel.id);
                    }}
                    onPointerEnter={() => enterPanelPointerDropTarget(panel.id)}
                    onPointerUp={stopPanelPointerDrag}
                    onPointerCancel={stopPanelPointerDrag}
                  >
                    <span
                      className="comic-panel-drag-handle"
                      title="拖拉排序"
                      onPointerDown={(event) => startPanelPointerDrag(event, panel.id)}
                      aria-hidden="true"
                    >
                      ⠿
                    </span>
                    <span className="comic-panel-mini-main">
                      <strong>#{panel.order} {panel.beat}</strong>
                    <span>{panel.status} · {panelVariants[panel.id]?.length ?? 0} 張歷史圖</span>
                    </span>
                    <button
                      type="button"
                      className="comic-panel-mini-delete"
                      title="刪除分鏡"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deletePanel(panel);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        event.stopPropagation();
                        void deletePanel(panel);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <section className="comic-detail">
            {selectedPanel ? (
              <article className={`comic-panel-card ${selectedPanel.status}`}>
                <header>
                  <div className="comic-panel-title-editor">
                    <label>
                      <FieldLabel label={`分鏡 #${selectedPanel.order} 標題`} help="顯示在左側分鏡列表與圖片檔名中的分鏡名稱。" />
                      <input
                        value={selectedPanel.beat}
                        onChange={(event) => void updatePanel(selectedPanel, { beat: event.target.value })}
                      />
                    </label>
                    <span>{panelCharacterNames(selectedPanel).length ? `角色：${panelCharacterNames(selectedPanel).join('、')}` : '尚未選擇角色'}</span>
                  </div>
                  <span>{selectedPanel.status}</span>
                </header>

                <section className="comic-current-image">
                  <div>
                    {selectedPanelAsset?.url ? (
                      <figure className="comic-panel-image">
                        <button
                          type="button"
                          className="comic-image-button"
                          onClick={() => setPreviewAsset(selectedPanelAsset)}
                          title="預覽目前圖片"
                        >
                          <img src={selectedPanelAsset.url} alt={`#${selectedPanel.order} ${selectedPanel.beat}`} loading="lazy" />
                        </button>
                        <figcaption>
                          <button type="button" onClick={() => setPreviewAsset(selectedPanelAsset)}>預覽</button>
                          <a
                            href={selectedPanelAsset.url}
                            download={`comic-panel-${selectedPanel.order}.png`}
                            className={downloadNotice?.key === `panel-${selectedPanel.id}` ? 'download-started' : ''}
                            onClick={() => markDownloadStarted(`panel-${selectedPanel.id}`, `comic-panel-${selectedPanel.order}.png`)}
                          >
                            {downloadNotice?.key === `panel-${selectedPanel.id}` ? '已開始下載' : '下載'}
                          </a>
                          <button type="button" onClick={() => void navigator.clipboard?.writeText(selectedPanelAsset.url ?? '')}>
                            複製 URL
                          </button>
                        </figcaption>
                      </figure>
                    ) : (
                      <div className="comic-image-empty">尚未生成圖片</div>
                    )}
                  </div>
                  <div className="comic-panel-metadata">
                    <label className="comic-panel-title-field">
                      <FieldLabel label="分鏡標題" help="顯示在左側分鏡列表與圖片檔名中的分鏡名稱。" />
                      <input
                        value={selectedPanel.beat}
                        onChange={(event) => void updatePanel(selectedPanel, { beat: event.target.value })}
                      />
                    </label>
                    <dl>
                      <dt>提供商</dt><dd>{providerLabel}</dd>
                      <dt>參考圖</dt><dd>{selectedPanel.referenceAssetIds?.length ?? 0} 張</dd>
                      <dt>場景</dt><dd>{activeScene(selectedPanel)?.title ?? '無場景'}</dd>
                      <dt>Asset</dt><dd>{selectedPanel.assetId ?? '尚未建立'}</dd>
                    </dl>
                    <div className="comic-panel-image-actions">
                      <Button variant="secondary" onClick={() => regeneratePanelImage(selectedPanel)} disabled={busy || !provider || !comic}>
                        重生此格
                      </Button>
                      <label className={`comic-upload-button ${busy || !comic ? 'disabled' : ''}`}>
                        上傳圖片
                        <input
                          type="file"
                          accept="image/*"
                          disabled={busy || !comic}
                          onChange={(event) => {
                            void uploadPanelImage(selectedPanel, event.currentTarget.files);
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </section>

                {(panelVariants[selectedPanel.id]?.length ?? 0) > 0 && (
                  <details className="comic-panel-history" open>
                    <summary>歷史圖 ({panelVariants[selectedPanel.id]?.length ?? 0})</summary>
                    {panelVariantNotice[selectedPanel.id] && (
                      <p className="comic-panel-history-notice">{panelVariantNotice[selectedPanel.id]}</p>
                    )}
                    <div className="comic-panel-history-grid">
                      {(panelVariants[selectedPanel.id] ?? []).map((variant) => {
                        const asset = variant.assetId ? variantAssets[variant.assetId] : undefined;
                        const isCurrent = Boolean(variant.assetId && variant.assetId === selectedPanel.assetId);
                        return (
                          <div className={`comic-panel-variant ${isCurrent ? 'current' : ''}`} key={variant.id}>
                            {asset?.url ? (
                              <button
                                type="button"
                                className="comic-thumb-button"
                                onClick={() => setPreviewAsset(asset)}
                                title="預覽歷史圖"
                              >
                                <img src={asset.url} alt={`panel ${selectedPanel.order} variant`} loading="lazy" />
                              </button>
                            ) : (
                              <span className="comic-panel-variant-placeholder">無圖</span>
                            )}
                            <small>{new Date(variant.createdAt).toLocaleTimeString()} · {variant.providerId || 'provider'}</small>
                            <div className="comic-panel-variant-actions">
                              <button
                                type="button"
                                className="comic-icon-button"
                                title={isCurrent ? '已是目前圖' : '設為目前'}
                                disabled={isCurrent || !variant.assetId}
                                onClick={() => selectPanelVariant(selectedPanel, variant)}
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                className="comic-icon-button danger"
                                title={isCurrent ? '目前採用圖不可刪除' : '刪除'}
                                onClick={() => deletePanelVariant(selectedPanel, variant)}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}

                <section className="comic-narration-panel">
                  <div className="comic-prompt-field-header">
                    <span>旁白腳本</span>
                    <span>{selectedPanel.ttsDurationMs ? `音訊 ${Math.round(selectedPanel.ttsDurationMs / 100) / 10}s` : '尚未產生音訊'}</span>
                  </div>
                  <textarea
                    value={selectedPanel.narration}
                    onChange={(event) => void updatePanel(selectedPanel, {
                      narration: event.target.value,
                      ttsStatus: 'idle',
                      ttsAssetId: undefined,
                      ttsDurationMs: undefined,
                      ttsErrorMessage: undefined,
                    })}
                  />
                  <label className="comic-video-number-field">
                    <FieldLabel label="手動秒數" help="0 代表使用 TTS 實測音訊長度；大於 0 時會和音訊長度取較長者，避免截斷旁白。" />
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={panelDurationDraft[selectedPanel.id] ?? String(selectedPanel.durationSec ?? 0)}
                      onChange={(event) => updatePanelDurationDraft(selectedPanel, event.target.value)}
                      onBlur={() => clearPanelDurationDraft(selectedPanel)}
                    />
                  </label>
                  <small>每格顯示長度 = max(TTS 音訊長度, 手動秒數) + 格間停頓。</small>
                  <div className="comic-panel-video-actions">
                    <Button variant="secondary" disabled={busy || !comic || !selectedPanel} onClick={() => void renderSelectedPanelVideo()}>
                      單格輸出 MP4
                    </Button>
                    <span className="comic-panel-video-status">
                      {selectedPanel.segmentAssetId ? '此格已有 MP4 segment' : '此格尚未輸出 MP4'}
                    </span>
                  </div>
                  {panelVideoAsset?.path && <small title={panelVideoAsset.path}>單格輸出：{panelVideoAsset.path}</small>}
                  {panelVideoMessage && <p className="comic-message">{panelVideoMessage}</p>}
                </section>

                <section className="comic-editor-grid">
                  <div className="comic-prompt-box">
                    <div className="comic-prompt-field-header">
                      <span>畫面提示詞</span>
                      <button type="button" onClick={() => openExpandedPrompt({ title: '畫面提示詞', value: selectedPanel.visualPrompt, onApply: (value) => updatePanel(selectedPanel, { visualPrompt: value }) })}>展開</button>
                    </div>
                    <textarea value={selectedPanel.visualPrompt} onChange={(event) => updatePanel(selectedPanel, { visualPrompt: event.target.value })} />
                  </div>
                  <div className="comic-prompt-box">
                    <div className="comic-prompt-field-header">
                      <span>排除提示詞</span>
                      <button type="button" onClick={() => openExpandedPrompt({ title: '排除提示詞', value: selectedPanel.negativePrompt, onApply: (value) => updatePanel(selectedPanel, { negativePrompt: value }) })}>展開</button>
                    </div>
                    <textarea value={selectedPanel.negativePrompt} onChange={(event) => updatePanel(selectedPanel, { negativePrompt: event.target.value })} />
                  </div>
                  <div className="comic-prompt-box">
                    <div className="comic-prompt-field-header">
                      <span>群眾設定 JSON</span>
                      <button type="button" onClick={() => openExpandedPrompt({ title: '群眾設定 JSON', value: selectedPanel.extraGroupsJson ?? '', onApply: (value) => updatePanel(selectedPanel, { extraGroupsJson: value }) })}>展開</button>
                    </div>
                    <textarea
                      className="comic-extras-input"
                      placeholder='extraGroups JSON，例如 [{"label":"居民","count":12,"role":"civilians","prompt":"穿著舊布衣，站在背景","visualPriority":"low"}]'
                      value={selectedPanel.extraGroupsJson ?? ''}
                      onChange={(event) => updatePanel(selectedPanel, { extraGroupsJson: event.target.value })}
                    />
                  </div>
                  <div className="comic-prompt-box">
                    <div className="comic-prompt-field-header">
                      <span>最終提示詞快照</span>
                      <button type="button" onClick={() => openExpandedPrompt({ title: '最終提示詞快照', value: selectedPanel.finalPromptSnapshot ?? '', readOnly: true })}>展開</button>
                    </div>
                    <textarea value={selectedPanel.finalPromptSnapshot ?? ''} readOnly />
                  </div>
                </section>
                {selectedPanel.errorMessage && <p className="comic-error">{selectedPanel.errorMessage}</p>}
              </article>
            ) : (
              <div className="comic-empty-state">尚未產生分鏡。請先生成分鏡。</div>
            )}
          </section>

          <aside className="comic-side">
            <section className="comic-selector-search">
              <FieldLabel label="搜尋角色、參考圖、場景" help="用關鍵字篩選角色、參考圖與場景視覺設定。" />
              <input
                className="toolbar-input"
                value={selectorSearch}
                onChange={(event) => setSelectorSearch(event.target.value)}
                placeholder="搜尋角色、場景、章節或分鏡..."
              />
            </section>

            {selectedPanel && (
              <section className="comic-side-section">
                <h3>角色</h3>
                <details className="comic-character-picker" open>
                  <summary>
                    <span className="comic-character-summary-text">
                      {panelCharacterNames(selectedPanel).length ? `已選 ${panelCharacterNames(selectedPanel).length} 位：${panelCharacterNames(selectedPanel).join('、')}` : '尚未選擇角色'}
                    </span>
                  </summary>
                  <div className="comic-character-picker-menu">
                    {filteredCharacters.length ? filteredCharacters.map((character) => (
                      <label className="comic-checkbox-row" key={character.id}>
                        <input
                          type="checkbox"
                          checked={panelCharacterSelected(selectedPanel, character)}
                          onChange={(event) => togglePanelCharacter(selectedPanel, character, event.target.checked)}
                        />
                        <VisualReferenceThumb
                          url={referenceThumbnail(character)}
                          label={character.name}
                          onPreview={(url) => previewImageUrl(url, character.name)}
                        />
                        <span>{character.name}</span>
                        {(character.referenceAssetIds?.length ?? 0) > 0 && (
                          <small>{character.referenceAssetIds?.length} 張</small>
                        )}
                      </label>
                    )) : (
                      <p className="comic-message">沒有符合的角色</p>
                    )}
                  </div>
                </details>
                <label className="comic-checkbox-row">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedPanel.useContinuityReference)}
                    onChange={(event) => updatePanel(selectedPanel, { useContinuityReference: event.target.checked })}
                  />
                  <FieldLabel label="自動使用上一格" help="開啟後會優先使用同章上一格的成圖；若這是章節第一格，會嘗試接續前一章最新漫畫的最後一格。" />
                </label>
              </section>
            )}

            {selectedPanel && (
              <section className="comic-side-section">
                <h3>參考圖</h3>
                <details className="comic-reference-picker" open>
                  <summary>已選 {selectedPanel.referenceAssetIds?.length ?? 0} 張</summary>
                  <div className="comic-reference-picker-menu" ref={referencePickerMenuRef}>
                    {selectedPanelReferenceOptions.length ? Array.from(new Set(
                      selectedPanelReferenceOptions.map((option) => option.chapter.id),
                    )).map((chapterId) => {
                      const chapterOptions = selectedPanelReferenceOptions.filter((option) => option.chapter.id === chapterId);
                      return (
                        <section
                          className="comic-reference-chapter"
                          key={chapterId}
                          ref={chapterId === chapter.id ? activeReferenceChapterRef : undefined}
                        >
                          <strong>第 {chapterOptions[0].chapter.order + 1} 章 · {chapterOptions[0].chapter.title}</strong>
                          <div className="comic-reference-grid">
                            {chapterOptions.map((option) => (
                              <label className="comic-reference-option" key={option.asset.id}>
                                <input
                                  type="checkbox"
                                  checked={selectedPanel.referenceAssetIds?.includes(option.asset.id) ?? false}
                                  onChange={(event) => togglePanelReference(selectedPanel, option.asset.id, event.target.checked)}
                                />
                                {option.asset.url && (
                                  <button
                                    type="button"
                                    className="comic-reference-thumb-button"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      setPreviewAsset(option.asset);
                                    }}
                                    title="預覽參考圖"
                                  >
                                    <img src={option.asset.url} alt={`第 ${option.chapter.order + 1} 章第 ${option.panel.order} 格`} loading="lazy" />
                                  </button>
                                )}
                                <span>第 {option.panel.order} 格</span>
                              </label>
                            ))}
                          </div>
                        </section>
                      );
                    }) : <p className="comic-message">尚無可用的已生成分鏡圖</p>}
                  </div>
                </details>
              </section>
            )}

            {selectedPanel && (
              <section className="comic-side-section">
                <h3>場景</h3>
                <details className="comic-scene-picker" open>
                  <summary>
                    <span className="comic-scene-summary-text">{activeScene(selectedPanel)?.title ?? '無場景'}</span>
                  </summary>
                  <div className="comic-scene-picker-menu">
                    <label className="comic-checkbox-row">
                      <input
                        type="radio"
                        name={`scene-${selectedPanel.id}`}
                        checked={!selectedPanel.sceneSlug}
                        onChange={() => updatePanel(selectedPanel, { sceneSlug: undefined })}
                      />
                      <VisualReferenceThumb label="無場景" />
                      <span>無場景</span>
                    </label>
                    {filteredScenes.map((scene) => (
                      <label className="comic-checkbox-row" key={scene.id}>
                        <input
                          type="radio"
                          name={`scene-${selectedPanel.id}`}
                          checked={selectedPanel.sceneSlug === scene.slug}
                          onChange={() => updatePanel(selectedPanel, { sceneSlug: scene.slug })}
                        />
                        <VisualReferenceThumb
                          url={referenceThumbnail(scene)}
                          label={scene.title}
                          onPreview={(url) => previewImageUrl(url, scene.title)}
                        />
                        <span>{scene.title}</span>
                        <small>{scene.referenceAssetIds.length} 張</small>
                      </label>
                    ))}
                  </div>
                </details>
                <Button variant="secondary" onClick={() => createSceneFromPanel(selectedPanel)} disabled={busy}>
                  從此格建立場景
                </Button>
              </section>
            )}

            {filteredScenes.length > 0 && (
              <section className="comic-side-section">
                <h3>場景視覺設定</h3>
                <div className="comic-scene-list">
                  {filteredScenes.map((scene) => {
                    const referenceAssets = sceneReferenceList(scene);
                    return (
                    <details className="comic-scene-card" key={scene.id}>
                      <summary>
                        <VisualReferenceThumb
                          url={referenceThumbnail(scene)}
                          label={scene.title}
                          onPreview={(url) => previewImageUrl(url, scene.title)}
                        />
                        <span className="comic-scene-card-title">{scene.title}</span>
                        <span>{scene.slug}</span>
                      </summary>
                      <div className="comic-scene-card-actions">
                        <button type="button" onClick={() => deleteScene(scene)}>刪除</button>
                      </div>
                      <label>
                        <FieldLabel label="場景名稱" help="只改顯示名稱；穩定識別用的 slug 會保留，避免已選分鏡失效。" />
                        <input value={scene.title} onChange={(event) => void updateScene(scene, { title: event.target.value })} />
                      </label>
                      <label>
                        <FieldLabel label="場景提示詞" help="固定場景外觀，例如房間格局、家具、光線、材質與時代感。" />
                        <textarea value={scene.prompt} onChange={(event) => void updateScene(scene, { prompt: event.target.value })} />
                      </label>
                      <label>
                        <FieldLabel label="場景排除詞" help="避免場景跑偏的內容，例如 modern apartment、clean lab、futuristic city。" />
                        <input value={scene.negativePrompt} onChange={(event) => void updateScene(scene, { negativePrompt: event.target.value })} />
                      </label>
                      <label>
                        <FieldLabel label="參考圖" help="上傳場景參考圖。支援 reference image 的 provider 會自動帶入。" />
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(event) => {
                            void uploadSceneReference(scene, event.target.files);
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                      {referenceAssets.length > 0 ? (
                        <div className="comic-scene-reference-grid" aria-label={`${scene.title} reference images`}>
                          {referenceAssets.map((asset, index) => (
                            <figure className="comic-scene-reference-item" key={asset.id}>
                              <button
                                type="button"
                                className="comic-scene-reference-thumb"
                                onClick={() => setPreviewAsset(asset)}
                                title="預覽場景參考圖"
                              >
                                <img src={asset.url} alt={`${scene.title} reference ${index + 1}`} loading="lazy" />
                              </button>
                              <figcaption>
                                <span>#{index + 1}</span>
                                <button
                                  type="button"
                                  className="comic-scene-reference-delete"
                                  onClick={() => void removeSceneReference(scene, asset.id)}
                                  title="刪除場景參考圖"
                                >
                                  刪除
                                </button>
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                      ) : (
                        <p className="comic-message">尚無場景參考圖</p>
                      )}
                    </details>
                    );
                  })}
                </div>
              </section>
            )}
          </aside>
        </div>
        {chapterVideoSettingsOpen && (
          <div className="comic-video-settings-modal" role="dialog" aria-modal="true" onClick={() => setChapterVideoSettingsOpen(false)}>
            <div className="comic-video-settings-content" onClick={(event) => event.stopPropagation()}>
              <header>
                <div>
                  <strong>整章影片設定</strong>
                  <span>套用於單格輸出與整章輸出 MP4</span>
                </div>
                <button
                  type="button"
                  className="comic-video-settings-close"
                  onClick={() => setChapterVideoSettingsOpen(false)}
                  aria-label="關閉整章影片設定"
                  title="關閉"
                >
                  ×
                </button>
              </header>
              <div className="comic-video-settings-grid">
                <label>
                  <FieldLabel label="旁白音色" help="MVP 使用單一 Edge-TTS 音色輸出旁白。" />
                  <select value={videoVoice} onChange={(event) => setVideoVoice(event.target.value)}>
                    <option value="zh-TW-HsiaoChenNeural">zh-TW-HsiaoChenNeural</option>
                    <option value="zh-TW-YunJheNeural">zh-TW-YunJheNeural</option>
                    <option value="zh-CN-XiaoxiaoNeural">zh-CN-XiaoxiaoNeural</option>
                  </select>
                </label>
                <label>
                  <FieldLabel label="格間停頓" help="加在每格音訊後的靜音長度，用於分鏡之間的呼吸感。" />
                  <select value={panelPauseMs} onChange={(event) => setPanelPauseMs(Number(event.target.value))}>
                    <option value={0}>0ms</option>
                    <option value={250}>250ms</option>
                    <option value={400}>400ms</option>
                    <option value={600}>600ms</option>
                    <option value={1000}>1000ms</option>
                  </select>
                </label>
                <label>
                  <FieldLabel label="Edge-TTS" help="Edge-TTS CLI 指令或完整路徑。" />
                  <input value={edgeTtsBin} onChange={(event) => setEdgeTtsBin(event.target.value)} />
                </label>
                <label>
                  <FieldLabel label="ffmpeg" help="ffmpeg CLI 指令或完整路徑。" />
                  <input value={ffmpegBin} onChange={(event) => setFfmpegBin(event.target.value)} />
                </label>
                <label>
                  <FieldLabel label="ffprobe" help="ffprobe CLI 指令或完整路徑，用於量測 TTS 音訊長度。" />
                  <input value={ffprobeBin} onChange={(event) => setFfprobeBin(event.target.value)} />
                </label>
              </div>
              <footer>
                {videoAsset?.path && <span title={videoAsset.path}>整章輸出：{videoAsset.path}</span>}
                <Button variant="primary" onClick={() => setChapterVideoSettingsOpen(false)}>
                  完成
                </Button>
              </footer>
            </div>
          </div>
        )}
        {videoLibraryOpen && (
          <div className="comic-video-settings-modal" role="dialog" aria-modal="true" onClick={() => setVideoLibraryOpen(false)}>
            <div className="comic-video-settings-content comic-video-library-content" onClick={(event) => event.stopPropagation()}>
              <header>
                <div>
                  <strong>影片庫</strong>
                  <span>管理此章已輸出的整章 MP4 與單格 MP4 segment</span>
                </div>
                <button
                  type="button"
                  className="comic-video-settings-close"
                  onClick={() => setVideoLibraryOpen(false)}
                  aria-label="關閉影片庫"
                  title="關閉"
                >
                  ×
                </button>
              </header>
              {videoLibraryMessage && <p className="comic-message">{videoLibraryMessage}</p>}
              {videoLibraryItems.length ? (
                <div className="comic-video-library-list">
                  {videoLibraryItems.map((item) => (
                    <article className={`comic-video-library-item ${item.status}`} key={item.id}>
                      <div className="comic-video-library-main">
                        <strong>{item.label}</strong>
                        <span>{item.kind === 'chapter' ? '整章影片' : '單格影片'}</span>
                        <small title={item.path ?? item.assetId ?? ''}>
                          {item.path ?? '影片檔案遺失'}
                        </small>
                      </div>
                      <div className="comic-video-library-meta">
                        <span className={`comic-video-library-status ${item.status}`}>
                          {item.status === 'ready' ? '可用' : '遺失'}
                        </span>
                        <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '無建立時間'}</span>
                      </div>
                      <div className="comic-video-library-actions">
                        <button type="button" onClick={() => void openVideoLibraryItem(item)} disabled={busy || !item.path}>
                          開啟
                        </button>
                        <button type="button" onClick={() => void revealVideoLibraryItem(item)} disabled={busy || !item.path}>
                          定位
                        </button>
                        <button type="button" onClick={() => void rerenderVideoLibraryItem(item)} disabled={busy}>
                          重新輸出
                        </button>
                        <button type="button" className="danger" onClick={() => void deleteVideoLibraryItem(item)} disabled={busy || !item.assetId}>
                          刪除
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="comic-empty-state">
                  尚未輸出 MP4。可先使用「單格輸出 MP4」或「整章輸出 MP4」建立影片。
                </div>
              )}
            </div>
          </div>
        )}
        {previewAsset?.url && (
          <div className="comic-image-preview" role="dialog" aria-modal="true" onClick={() => setPreviewAsset(null)}>
            <div className="comic-image-preview-content" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="comic-image-preview-close" onClick={() => setPreviewAsset(null)}>×</button>
              <img src={previewAsset.url} alt="漫畫圖片預覽" />
              <div className="comic-image-preview-actions">
                <a
                  href={previewAsset.url}
                  download="comic-panel.png"
                  className={downloadNotice?.key === `preview-${previewAsset.id}` ? 'download-started' : ''}
                  onClick={() => markDownloadStarted(`preview-${previewAsset.id}`, 'comic-panel.png')}
                >
                  {downloadNotice?.key === `preview-${previewAsset.id}` ? '已開始下載' : '下載圖片'}
                </a>
                <button type="button" onClick={() => void navigator.clipboard?.writeText(previewAsset.url ?? '')}>
                  複製 URL
                </button>
              </div>
            </div>
          </div>
        )}
        {expandedPrompt && (
          <div className="comic-prompt-expand-modal" role="dialog" aria-modal="true" onClick={() => setExpandedPrompt(null)}>
            <div className="comic-prompt-expand-content" onClick={(event) => event.stopPropagation()}>
              <header>
                <strong>{expandedPrompt.title}</strong>
                <button
                  type="button"
                  className="comic-prompt-expand-close"
                  onClick={() => setExpandedPrompt(null)}
                  aria-label="關閉"
                  title="關閉"
                >
                  ×
                </button>
                <button type="button" onClick={() => setExpandedPrompt(null)}>關閉</button>
              </header>
              <textarea
                value={expandedPromptDraft}
                readOnly={expandedPrompt.readOnly}
                onChange={(event) => setExpandedPromptDraft(event.target.value)}
              />
              <footer>
                <button type="button" onClick={() => setExpandedPrompt(null)}>取消</button>
                {!expandedPrompt.readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      expandedPrompt.onApply?.(expandedPromptDraft);
                      setExpandedPrompt(null);
                    }}
                  >
                    套用
                  </button>
                )}
              </footer>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function referenceBindingPrompt(bindings: ComicReferenceBinding[]): string {
  const lines = bindings.map((binding, index) => `image ${index + 1} = ${binding.label}`);
  return [
    'Reference image bindings:',
    ...lines,
    'Follow these bindings strictly: each named character must match their own reference image identity and not borrow another character reference.',
  ].join('\n');
}

function FieldLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="comic-field-label">
      {label}
      <span className="comic-help" title={help} aria-label={help}>?</span>
    </span>
  );
}

function VisualReferenceThumb({ url, label, onPreview }: { url?: string; label: string; onPreview?: (url: string) => void }) {
  return url ? (
    <button
      type="button"
      className="comic-visual-reference-thumb-button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onPreview?.(url);
      }}
      title="預覽縮圖"
    >
      <img className="comic-visual-reference-thumb" src={url} alt={`${label} reference`} loading="lazy" />
    </button>
  ) : (
    <span className="comic-visual-reference-thumb placeholder" aria-hidden="true">
      {label.trim().slice(0, 1) || '?'}
    </span>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}
