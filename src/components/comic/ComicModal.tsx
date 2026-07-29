import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Select as MantineSelect } from '@mantine/core';
import { v4 as uuid } from 'uuid';
import type { Chapter, ChapterComic, Character, ComicPanel, ComicPanelImageVariant, ImageProviderConfig, MediaAsset, Project, SceneVisual } from '../../types';
import { storage } from '../../lib/storage';
import { generateStoryboardDraft } from '../../lib/comic/storyboard-generate';
import { getImageProvider, localizeImageProviderMessage } from '../../lib/comic/providers';
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
import { loadComicVideoState } from '../../lib/comic/video/video-state-refresh';
import { COMIC_VIDEO_VOICE_GROUPS } from '../../lib/comic/video/voices';
import {
  COMIC_VIDEO_MOTION_EFFECTS,
  comicMotionEffectDescription,
  comicMotionEffectLabel,
  normalizeComicPanelMotionEffect,
} from '../../lib/comic/video/motion-effects';
import {
  buildPanelVideoClipMetadata,
  normalizePanelVideoClipAudioMode,
  normalizePanelVideoClipAudioVolume,
  normalizePanelVideoClipLoopMode,
  panelVideoClipAssetIds,
  panelVideoClipDurationMs,
  panelVideoClipFileName,
  panelVideoClipHasAudio,
} from '../../lib/comic/video/video-clips';
import { comicWorkspaceStateKey, resolveComicWorkspaceState, type ComicWorkspaceState } from '../../lib/comic/comic-workspace-state';
import { createDefaultSceneVisual, findPanelsUsingScene, removeSceneReferenceAssetId } from '../../lib/scene-visuals';
import { t } from '../../lib/language-policy';
import { errorMessage } from '../../lib/error-message';
import { saveBlobFile } from '../../lib/file-export';
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
  embedded?: boolean;
  workspaceMode?: ComicWorkspaceMode;
}

export type ComicWorkspaceMode = 'scene' | 'comic' | 'video';

export function ComicModal({
  open,
  onClose,
  project,
  chapter,
  chapters = [chapter],
  onChapterChange,
  characters,
  embedded = false,
  workspaceMode = 'comic',
}: ComicModalProps) {
  const { generalPrefs, imageGenerationPrefs, setImageGenerationPrefs } = useSettingsStore();
  const locale = generalPrefs.interfaceLocale;
  const [comic, setComic] = useState<ChapterComic | null>(null);
  const [panels, setPanels] = useState<ComicPanel[]>([]);
  const [scenes, setScenes] = useState<SceneVisual[]>([]);
  const [availableCharacters, setAvailableCharacters] = useState<Character[]>(characters);
  const [panelAssets, setPanelAssets] = useState<Record<string, MediaAsset>>({});
  const [panelVideoClipAssets, setPanelVideoClipAssets] = useState<Record<string, MediaAsset>>({});
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
  const [sceneWorkspaceSlug, setSceneWorkspaceSlug] = useState('__none__');
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [pendingWorkspaceState, setPendingWorkspaceState] = useState<ComicWorkspaceState | null>(null);
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null);
  const [dragTargetPanelId, setDragTargetPanelId] = useState<string | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<{ key: string; label: string } | null>(null);
  const [videoVoice, setVideoVoice] = useState(
    project.writingLanguage === 'en' ? 'en-US-AriaNeural' : 'zh-TW-HsiaoChenNeural',
  );
  const [voicePreviewing, setVoicePreviewing] = useState(false);
  const [panelPauseMs, setPanelPauseMs] = useState(400);
  const [videoMessage, setVideoMessage] = useState('');
  const [voicePreviewMessage, setVoicePreviewMessage] = useState('');
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
  const sceneWorkspaceContextRef = useRef('');
  const referencePickerMenuRef = useRef<HTMLDivElement | null>(null);
  const activeReferenceChapterRef = useRef<HTMLElement | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewUrlRef = useRef<string | null>(null);

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

  useEffect(() => () => {
    voicePreviewAudioRef.current?.pause();
    voicePreviewAudioRef.current = null;
    if (voicePreviewUrlRef.current) URL.revokeObjectURL(voicePreviewUrlRef.current);
    voicePreviewUrlRef.current = null;
  }, []);

  useEffect(() => {
    setVideoVoice(project.writingLanguage === 'en' ? 'en-US-AriaNeural' : 'zh-TW-HsiaoChenNeural');
  }, [project.id, project.writingLanguage]);

  useEffect(() => {
    if (chapterVideoSettingsOpen) return;
    voicePreviewAudioRef.current?.pause();
    voicePreviewAudioRef.current = null;
    if (voicePreviewUrlRef.current) URL.revokeObjectURL(voicePreviewUrlRef.current);
    voicePreviewUrlRef.current = null;
    setVoicePreviewing(false);
  }, [chapterVideoSettingsOpen]);

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

  const saveComicImage = async (asset: MediaAsset, key: string, baseName: string) => {
    if (!asset.url) return;
    let fileName = `${baseName}.${imageExtension(asset)}`;
    setDownloadNotice({ key, label: t('comic.preparingImage', undefined, locale) });
    setMessage(t('comic.preparingImageFile', undefined, locale));
    try {
      const blob = await imageAssetBlob(asset, locale);
      const extension = imageExtension(asset, blob.type);
      fileName = `${baseName}.${extension}`;
      setDownloadNotice({ key, label: t('comic.saveLocationTitle', { fileName }, locale) });
      setMessage(t('comic.saveLocationDesc', { fileName }, locale));
      const result = await saveBlobFile({
        filename: fileName,
        blob,
        pickerTitle: t('comic.selectImageSaveLocation', undefined, locale),
        description: imagePickerDescription(extension, locale),
        accept: { [blob.type || asset.mimeType || 'image/png']: [`.${extension}`] },
        defaultExtension: extension,
      });
      if (result.status === 'cancelled') {
        setDownloadNotice({ key, label: t('comic.saveCancelled', { fileName }, locale) });
        setMessage(t('comic.saveCancelled', { fileName }, locale));
      } else if (result.path) {
        setDownloadNotice({ key, label: t('comic.saveSuccess', { fileName }, locale) });
        setMessage(t('comic.saveSuccess', { fileName: result.path }, locale));
      } else {
        setDownloadNotice({ key, label: result.status === 'downloaded' ? t('comic.downloadStarted', { fileName }, locale) : t('comic.saveSuccess', { fileName }, locale) });
        setMessage(result.status === 'downloaded' ? t('comic.downloadStarted', { fileName }, locale) : t('comic.saveSuccess', { fileName }, locale));
      }
    } catch (err) {
      setDownloadNotice({ key, label: t('comic.saveFailed', { fileName }, locale) });
      setMessage(t('comic.saveFailed', { fileName: errorMessage(err) }, locale));
    }
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
    if (!open) return;
    const assetIds = Array.from(new Set(panels.flatMap((panel) => panelVideoClipAssetIds(panel))));
    let cancelled = false;
    if (!assetIds.length) {
      queueMicrotask(() => {
        if (!cancelled) setPanelVideoClipAssets({});
      });
      return () => {
        cancelled = true;
      };
    }
    void Promise.all(assetIds.map((id) => storage.mediaAssets.get(id))).then((assets) => {
      if (cancelled) return;
      setPanelVideoClipAssets(assets.filter((asset): asset is MediaAsset => Boolean(asset)).reduce<Record<string, MediaAsset>>((acc, asset) => {
        acc[asset.id] = asset;
        return acc;
      }, {}));
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
    let cancelled = false;
    if (!comic) {
      queueMicrotask(() => {
        if (!cancelled) setVideoLibraryAssets({});
      });
      return () => {
        cancelled = true;
      };
    }
    void loadComicVideoState({ comicId: comic.id, storage, commands: desktopComicVideoCommands }).then((state) => {
      if (cancelled) return;
      setVideoLibraryAssets(state.assets);
    });
    return () => {
      cancelled = true;
    };
  }, [open, comic?.id, comic?.videoAssetId, comic?.subtitleAssetId, panels, videoLibraryRevision]);

  const persistGeneratedPanel = async (
    panel: ComicPanel,
    config: ImageProviderConfig,
    referenceImages: MediaAsset[] = [],
    referenceImageLabels: string[] = [],
  ): Promise<{ assetId: string; url: string }> => {
    if (!provider) throw new Error('Image provider not found');
    let output;
    try {
      output = await provider.generateImage({
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
    } catch (error) {
      throw new Error(localizeImageProviderMessage(errorMessage(error), locale), { cause: error });
    }
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
    setMessage(t('comic.generatingStoryboard', undefined, locale));
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
        title: t('comic.storyboardTitle', { title: chapter.title }, locale),
        status: 'storyboard_ready',
        stylePreset: imageGenerationPrefs.stylePreset,
        providerId: imageGenerationPrefs.providerId,
        targetPanelCount: imageGenerationPrefs.targetPanelCount,
        visualContinuityBibleJson: draft.visualContinuityBibleJson,
        videoStatus: 'idle',
        videoAssetId: undefined,
        subtitleAssetId: undefined,
        videoProviderId: undefined,
        videoSettingsJson: undefined,
        videoErrorMessage: undefined,
        createdAt: currentComic?.createdAt ?? now,
        updatedAt: now,
      };
      if (currentComic) {
        await cleanupMediaAssetFile(currentComic.videoAssetId);
        await cleanupMediaAssetFile(currentComic.subtitleAssetId);
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
      setMessage(t('comic.storyboardGenerated', { count: nextPanels.length }, locale));
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
      beat: t('comic.addPanel', undefined, locale),
      characters: [],
      location: selectedPanel?.location ?? '',
      shotType: selectedPanel?.shotType ?? '',
      cameraAngle: selectedPanel?.cameraAngle ?? '',
      visualPrompt: '',
      negativePrompt: '',
      dialogue: '',
      narration: '',
      durationSec: selectedPanel?.durationSec ?? 0,
      motionEffect: selectedPanel?.motionEffect ?? 'none',
      videoClipAudioMode: normalizePanelVideoClipAudioMode(selectedPanel?.videoClipAudioMode),
      videoClipAudioVolume: normalizePanelVideoClipAudioVolume(selectedPanel?.videoClipAudioVolume),
      videoClipLoopMode: normalizePanelVideoClipLoopMode(selectedPanel?.videoClipLoopMode),
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
    setMessage(t('comic.panelAdded', { order: nextPanels.find((panel) => panel.id === nextPanel.id)?.order ?? nextPanel.order }, locale));
  };

  const deletePanel = async (panel: ComicPanel) => {
    if (!comic || panels.length <= 1) {
      setMessage(t('comic.keepAtLeastOnePanel', undefined, locale));
      return;
    }
    if (!window.confirm(t('comic.deletePanelConfirm', { order: panel.order }, locale))) return;

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
    if (comic.videoAssetId || comic.subtitleAssetId || comic.videoStatus === 'ready') {
      const staleVideoPatch: Partial<ChapterComic> = {
        videoStatus: 'idle',
        videoAssetId: undefined,
        subtitleAssetId: undefined,
        videoErrorMessage: t('comic.deletePanelWarning', undefined, locale),
        updatedAt: Date.now(),
      };
      await cleanupMediaAssetFile(comic.videoAssetId);
      await cleanupMediaAssetFile(comic.subtitleAssetId);
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
    setMessage(t('comic.panelDeleted', undefined, locale));
  };

  const cleanupMediaAssetFile = async (assetId: string | undefined): Promise<void> => {
    if (!assetId) return;
    const asset = await storage.mediaAssets.get(assetId);
    if (asset?.path) {
      await desktopComicVideoCommands.deleteMediaFile({ path: asset.path });
    }
    await storage.mediaAssets.delete(assetId);
  };

  const refreshVideoState = async (comicId: string): Promise<ChapterComic | null> => {
    const nextState = await loadComicVideoState({ comicId, storage, commands: desktopComicVideoCommands });
    if (!nextState.comic) return null;
    setComic(nextState.comic);
    setPanels(nextState.panels);
    setVideoLibraryAssets(nextState.assets);
    setVideoAsset(nextState.comic.videoAssetId ? nextState.assets[nextState.comic.videoAssetId] ?? null : null);
    const currentPanelId = selectedPanelId;
    const currentPanel = currentPanelId ? nextState.panels.find((panel) => panel.id === currentPanelId) : undefined;
    setPanelVideoAsset(currentPanel?.segmentAssetId ? nextState.assets[currentPanel.segmentAssetId] ?? null : null);
    setVideoLibraryRevision((current) => current + 1);
    return nextState.comic;
  };

  const renderPanelVideo = async (targetPanel: ComicPanel) => {
    if (!comic) return;
    const validation = validateComicVideoInputs([targetPanel], {
      voiceId: videoVoice,
      writingLanguage: project.writingLanguage,
      locale,
    });
    if (!validation.ok) {
      setPanelVideoMessage(validation.message);
      return;
    }

    try {
      setBusy(true);
      setPanelVideoMessage(t('comic.renderingPanelMp4', { order: targetPanel.order }, locale));
      setVideoLibraryMessage(t('comic.renderingPanelMp4', { order: targetPanel.order }, locale));
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
        forceRender: true,
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
      await refreshVideoState(comic.id);
      if (selectedPanel?.id === targetPanel.id) setPanelVideoAsset(asset);
      setPanelVideoMessage(t('comic.panelMp4Rendered', { order: targetPanel.order }, locale));
      setVideoLibraryMessage(t('comic.panelMp4Rendered', { order: targetPanel.order }, locale));
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

  const previewVideoVoice = async () => {
    if (!comic) return;

    try {
      setVoicePreviewing(true);
      setVoicePreviewMessage(t('comic.generatingVoicePreview', undefined, locale));
      voicePreviewAudioRef.current?.pause();

      const mediaRoot = await desktopComicVideoCommands.resolveMediaRoot({
        projectId: comic.projectId,
        chapterId: comic.chapterId,
      });
      const outputPath = `${mediaRoot}/voice-preview-${safeFileSegment(videoVoice)}.mp3`;
      await desktopComicVideoCommands.generateTtsAudio({
        edgeTtsBin,
        text: project.writingLanguage === 'en'
          ? t('comic.voicePreviewTextEn', undefined, locale)
          : t('comic.voicePreviewTextZhHant', undefined, locale),
        voice: videoVoice,
        outputPath,
      });

      const bytes = await desktopComicVideoCommands.readMediaFileBytes({ path: outputPath });
      if (voicePreviewUrlRef.current) URL.revokeObjectURL(voicePreviewUrlRef.current);
      const audioUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'audio/mpeg' }));
      voicePreviewUrlRef.current = audioUrl;
      const audio = new Audio(audioUrl);
      voicePreviewAudioRef.current = audio;
      audio.onended = () => {
        if (voicePreviewAudioRef.current !== audio) return;
        setVoicePreviewing(false);
        voicePreviewAudioRef.current = null;
        if (voicePreviewUrlRef.current) URL.revokeObjectURL(voicePreviewUrlRef.current);
        voicePreviewUrlRef.current = null;
      };
      audio.onerror = () => {
        if (voicePreviewAudioRef.current !== audio) return;
        setVoicePreviewing(false);
        setVoicePreviewMessage(t('comic.voicePreviewPlaybackFailed', undefined, locale));
        voicePreviewAudioRef.current = null;
        if (voicePreviewUrlRef.current) URL.revokeObjectURL(voicePreviewUrlRef.current);
        voicePreviewUrlRef.current = null;
      };
      await audio.play();
      setVoicePreviewMessage(t('comic.playingVoicePreview', undefined, locale));
    } catch (error) {
      setVoicePreviewing(false);
      setVoicePreviewMessage(errorMessage(error));
    }
  };

  const renderVideo = async () => {
    if (!comic) return;
    const orderedPanels = [...panels].sort((a, b) => a.order - b.order);
    const validation = validateComicVideoInputs(orderedPanels, {
      voiceId: videoVoice,
      writingLanguage: project.writingLanguage,
      locale,
    });
    if (!validation.ok) {
      setVideoMessage(validation.message);
      setVideoLibraryMessage(validation.message);
      return;
    }

    try {
      setBusy(true);
      setVideoMessage(t('comic.generatingVoiceVideo', undefined, locale));
      setVideoLibraryMessage(t('comic.generatingChapterVideo', undefined, locale));
      const mediaRoot = await desktopComicVideoCommands.resolveMediaRoot({
        projectId: comic.projectId,
        chapterId: comic.chapterId,
      });
      await renderComicVideo({
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
      await refreshVideoState(comic.id);
      setVideoMessage(t('comic.videoRendered', undefined, locale));
      setVideoLibraryMessage(t('comic.chapterMp4Rendered', undefined, locale));
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
      setVideoLibraryMessage(t('comic.mediaPathNotFound', { label: item.label }, locale));
      return;
    }
    try {
      await desktopComicVideoCommands.openMediaFile({ path: item.path });
      setVideoLibraryMessage(t('comic.openedItem', { label: item.label }, locale));
    } catch (error) {
      setVideoLibraryMessage(errorMessage(error));
    }
  };

  const openSelectedPanelVideo = async () => {
    if (!currentPanelVideoAsset?.path) {
      setPanelVideoMessage(t('comic.panelMp4PathNotFound', undefined, locale));
      return;
    }
    try {
      await desktopComicVideoCommands.openMediaFile({ path: currentPanelVideoAsset.path });
      setPanelVideoMessage(t('comic.openedPanelMp4', undefined, locale));
    } catch (error) {
      setPanelVideoMessage(errorMessage(error));
    }
  };

  const revealSelectedPanelVideo = async () => {
    if (!currentPanelVideoAsset?.path) {
      setPanelVideoMessage(t('comic.panelMp4PathNotFound', undefined, locale));
      return;
    }
    try {
      await desktopComicVideoCommands.revealMediaFile({ path: currentPanelVideoAsset.path });
      setPanelVideoMessage(t('comic.revealedPanelMp4', undefined, locale));
    } catch (error) {
      setPanelVideoMessage(errorMessage(error));
    }
  };

  const revealVideoLibraryItem = async (item: ComicVideoLibraryItem) => {
    if (!item.path) {
      setVideoLibraryMessage(t('comic.mediaPathNotFound', { label: item.label }, locale));
      return;
    }
    try {
      await desktopComicVideoCommands.revealMediaFile({ path: item.path });
      setVideoLibraryMessage(t('comic.revealedItem', { label: item.label }, locale));
    } catch (error) {
      setVideoLibraryMessage(errorMessage(error));
    }
  };

  const deleteVideoLibraryItem = async (item: ComicVideoLibraryItem) => {
    if (!item.assetId) return;
    if (!window.confirm(t('comic.confirmDeleteVideo', { label: item.label }, locale))) return;
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
      if (item.kind === 'subtitle' && comic) {
        const patch: Partial<ChapterComic> = {
          subtitleAssetId: undefined,
          updatedAt: Date.now(),
        };
        await storage.comics.update(comic.id, patch);
        setComic((current) => current ? { ...current, ...patch } : current);
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
      setVideoLibraryMessage(t('comic.deletedItem', { label: item.label }, locale));
    } catch (error) {
      setVideoLibraryMessage(errorMessage(error));
    }
  };

  const rerenderVideoLibraryItem = async (item: ComicVideoLibraryItem) => {
    if (item.kind === 'chapter' || item.kind === 'subtitle') {
      await renderVideo();
      return;
    }
    const panel = panels.find((candidate) => candidate.id === item.panelId);
    if (!panel) {
      setVideoLibraryMessage(t('comic.panelForItemNotFound', { label: item.label }, locale));
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

  const selectedPanel = panels.find((panel) => panel.id === selectedPanelId) ?? panels[0];
  const selectedSceneSlug = workspaceMode === 'scene' ? sceneWorkspaceSlug : selectedPanel?.sceneSlug;
  const selectedScene = scenes.find((scene) => scene.slug === selectedSceneSlug);
  const selectedPanelReferenceOptions = selectedPanel ? referenceOptionsForPanel(selectedPanel) : [];
  const referenceChapterKey = selectedPanelReferenceOptions.map((option) => option.chapter.id).join('|');
  const selectedPanelAsset = selectedPanel ? panelAssets[selectedPanel.id] : undefined;
  const selectedPanelVideoClips = selectedPanel
    ? panelVideoClipAssetIds(selectedPanel).map((assetId) => panelVideoClipAssets[assetId]).filter((asset): asset is MediaAsset => Boolean(asset))
    : [];
  const currentPanelVideoAsset = selectedPanel?.segmentAssetId
    ? videoLibraryAssets[selectedPanel.segmentAssetId] ?? panelVideoAsset
    : panelVideoAsset;
  const videoLibraryItems = buildComicVideoLibrary({
    comic,
    panels,
    assets: Object.values(videoLibraryAssets),
    locale,
  });

  useEffect(() => {
    if (workspaceMode !== 'scene') return;
    const contextKey = `${chapter.id}:${selectedPanel?.id ?? 'none'}:${scenes.length}`;
    if (sceneWorkspaceContextRef.current === contextKey) return;
    sceneWorkspaceContextRef.current = contextKey;
    setSceneWorkspaceSlug(selectedPanel?.sceneSlug ?? scenes[0]?.slug ?? '__none__');
  }, [workspaceMode, chapter.id, selectedPanel?.id, selectedPanel?.sceneSlug, scenes]);

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
      const notice = currentVariantDeleteBlockedMessage(locale);
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
      ? t('comic.confirmDeleteUsedScene', { title: scene.title, count: usedPanels.length }, locale)
      : t('comic.confirmDeleteScene', { title: scene.title }, locale);
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
      setMessage(t('comic.sceneDeleted', { title: scene.title }, locale));
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
  const selectedSceneReferenceAssets = selectedScene ? sceneReferenceList(selectedScene) : [];

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
    setMessage(t('comic.generatingImages', undefined, locale));
    try {
      const config = providerConfig();
      const health = await provider.validateConfig(config);
      if (!health.ok) throw new Error(localizeImageProviderMessage(health.message, locale));
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
      setMessage(failed ? t('comic.imagesGeneratedWithErrors', { count: failed }, locale) : t('comic.imagesGenerated', undefined, locale));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const regeneratePanelImage = async (panel: ComicPanel) => {
    if (!provider || !comic) return;
    setBusy(true);
    setMessage(t('comic.regeneratingPanelImage', { order: panel.order }, locale));
    try {
      const config = providerConfig();
      const health = await provider.validateConfig(config);
      if (!health.ok) throw new Error(localizeImageProviderMessage(health.message, locale));
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
      setMessage(t('comic.panelImageRegenerated', { order: panel.order }, locale));
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
      setMessage(t('comic.uploadImageRequired', undefined, locale));
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
      setMessage(t('comic.imageUploadedToHistory', { order: panel.order }, locale));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const uploadPanelVideoClips = async (panel: ComicPanel, files: FileList | null) => {
    if (!files?.length || !comic) return;
    const videoFiles = Array.from(files).filter((file) => (
      file.type === 'video/mp4' || file.name.toLocaleLowerCase().endsWith('.mp4')
    ));
    if (!videoFiles.length) {
      setMessage(t('comic.selectMp4Required', undefined, locale));
      return;
    }

    setBusy(true);
    try {
      const mediaRoot = await desktopComicVideoCommands.resolveMediaRoot({
        projectId: comic.projectId,
        chapterId: comic.chapterId,
      });
      const now = Date.now();
      const paddedOrder = String(panel.order).padStart(3, '0');
      const uploaded: MediaAsset[] = [];
      for (const [index, file] of videoFiles.entries()) {
        const assetId = uuid();
        const outputPath = `${mediaRoot}/clips/panel-${paddedOrder}-clip-${assetId}.mp4`;
        let durationMs = 0;
        let hasAudio = false;
        try {
          await desktopComicVideoCommands.writeBinaryFile({
            path: outputPath,
            bytes: await readFileAsBytes(file),
          });
          durationMs = await desktopComicVideoCommands.probeVideoDuration({
            ffprobeBin,
            inputPath: outputPath,
          });
          hasAudio = await desktopComicVideoCommands.probeVideoHasAudio({
            ffprobeBin,
            inputPath: outputPath,
          });
        } catch (error) {
          await desktopComicVideoCommands.deleteMediaFile({ path: outputPath });
          throw error;
        }
        const asset: MediaAsset = {
          id: assetId,
          projectId: project.id,
          chapterId: chapter.id,
          kind: 'video',
          path: outputPath,
          mimeType: 'video/mp4',
          sizeBytes: file.size,
          providerId: 'uploaded-panel-video',
          generationParamsJson: buildPanelVideoClipMetadata({
            fileName: file.name,
            panelId: panel.id,
            order: panelVideoClipAssetIds(panel).length + index + 1,
            durationMs,
            hasAudio,
          }),
          createdAt: now + index,
        };
        await storage.mediaAssets.add(asset);
        uploaded.push(asset);
      }

      if (panel.segmentAssetId) await cleanupMediaAssetFile(panel.segmentAssetId);
      const nextClipIds = [...panelVideoClipAssetIds(panel), ...uploaded.map((asset) => asset.id)];
      await updatePanel(panel, { videoClipAssetIds: nextClipIds, segmentAssetId: undefined });
      setPanelVideoClipAssets((current) => ({
        ...current,
        ...uploaded.reduce<Record<string, MediaAsset>>((acc, asset) => {
          acc[asset.id] = asset;
          return acc;
        }, {}),
      }));
      setPanelVideoAsset(null);
      setVideoLibraryRevision((current) => current + 1);
      setMessage(t('comic.mp4ClipsAdded', { count: uploaded.length, order: panel.order }, locale));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const removePanelVideoClip = async (panel: ComicPanel, assetId: string) => {
    if (!window.confirm(t('comic.confirmDeletePanelMp4', undefined, locale))) return;
    try {
      setBusy(true);
      await cleanupMediaAssetFile(assetId);
      if (panel.segmentAssetId) await cleanupMediaAssetFile(panel.segmentAssetId);
      await updatePanel(panel, {
        videoClipAssetIds: panelVideoClipAssetIds(panel).filter((id) => id !== assetId),
        segmentAssetId: undefined,
      });
      setPanelVideoClipAssets((current) => {
        const next = { ...current };
        delete next[assetId];
        return next;
      });
      setPanelVideoAsset(null);
      setVideoLibraryRevision((current) => current + 1);
      setMessage(t('comic.panelMp4ClipDeleted', { order: panel.order }, locale));
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const updatePanelVideoClipSettings = async (
    panel: ComicPanel,
    patch: Pick<Partial<ComicPanel>, 'videoClipAudioMode' | 'videoClipAudioVolume' | 'videoClipLoopMode'>,
  ) => {
    try {
      if (panel.segmentAssetId) await cleanupMediaAssetFile(panel.segmentAssetId);
      await updatePanel(panel, {
        ...patch,
        segmentAssetId: undefined,
      });
      setPanelVideoAsset(null);
      setVideoLibraryRevision((current) => current + 1);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={t('comic.workspaceTitle', {
        mode: t(
          workspaceMode === 'scene' ? 'comic.workspaceScene' : workspaceMode === 'video' ? 'comic.workspaceVideo' : 'comic.workspaceComic',
          undefined,
          locale,
        ),
        chapterTitle: chapter.title,
      }, locale)}
      width={1100}
      fullScreen
      embedded={embedded}
      footer={workspaceMode === 'scene' && embedded ? undefined : (
        <>
          {!embedded && <Button variant="secondary" onClick={onClose} disabled={busy}>{t('common.close', undefined, locale)}</Button>}
          {!embedded && <div style={{ flex: 1 }} />}
          {workspaceMode === 'comic' && (
            <>
              <Button variant="secondary" onClick={generateStoryboard} disabled={busy || !chapter.content.trim()}>
                {t(panels.length ? 'comic.regenerateStoryboard' : 'comic.generateStoryboard', undefined, locale)}
              </Button>
              <Button variant="primary" onClick={generateImages} disabled={busy || !panels.length || !provider}>
                {t('comic.generateImages', undefined, locale)}
              </Button>
            </>
          )}
          {workspaceMode === 'video' && (
            <>
              <Button variant="secondary" onClick={() => setChapterVideoSettingsOpen(true)} disabled={busy || !comic}>
                {t('comic.chapterVideoSettings', undefined, locale)}
              </Button>
              <Button variant="secondary" onClick={() => setVideoLibraryOpen(true)} disabled={!comic}>
                {t('comic.videoLibrary', undefined, locale)}
              </Button>
              <Button variant="primary" onClick={() => void renderVideo()} disabled={busy || !comic || panels.length === 0}>
                {t('comic.renderChapterMp4', undefined, locale)}
              </Button>
            </>
          )}
        </>
      )}
    >
      <div className={`comic-modal comic-workspace-${workspaceMode}`}>
        {!embedded && (
          <button
            type="button"
            className="comic-main-close-button"
            onClick={onClose}
            disabled={busy}
            aria-label={t('comic.closeComicWorkspace', undefined, locale)}
            title={t('common.close', undefined, locale)}
          >
            ×
          </button>
        )}
        {videoMessage && (
          <div className="comic-top-message" role="status" aria-live="polite">
            <span>{videoMessage}</span>
            <button
              type="button"
              onClick={() => setVideoMessage('')}
              aria-label={t('common.dismissMessage', undefined, locale)}
              title={t('common.dismissMessage', undefined, locale)}
            >
              ×
            </button>
          </div>
        )}
        {workspaceMode === 'comic' && <section className="comic-settings">
          <div className="comic-provider-summary">
            <FieldLabel label={t('comic.imageProvider', undefined, locale)} help={t('comic.imageProviderHelp', undefined, locale)} />
            <strong>{providerLabel}</strong>
          </div>
          <label>
            <FieldLabel label={t('comic.stylePreset', undefined, locale)} help={t('comic.stylePresetHelp', undefined, locale)} />
            <input
              className="toolbar-input"
              value={imageGenerationPrefs.stylePreset}
              onChange={(event) => setImageGenerationPrefs({ stylePreset: event.target.value })}
            />
          </label>
          <label>
            <FieldLabel label={t('comic.targetPanelCount', undefined, locale)} help={t('comic.targetPanelCountHelp', undefined, locale)} />
            <input
              className="toolbar-input"
              type="number"
              value={imageGenerationPrefs.targetPanelCount}
              onChange={(event) => setImageGenerationPrefs({ targetPanelCount: Number(event.target.value) || 8 })}
            />
          </label>
        </section>}

        {message && <p className="comic-message">{message}</p>}
        {downloadNotice && <p className="comic-download-notice" aria-live="polite">{downloadNotice.label}</p>}

        <div className="comic-workspace">
          <aside className="comic-rail">
            <section className="comic-rail-section">
              <div className="comic-rail-header"><strong>{t('comic.chapters', undefined, locale)}</strong><span>{t('comic.chapterCount', { count: chapters.length }, locale)}</span></div>
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
                    {t('comic.chapterOption', { order: item.order + 1, title: item.title }, locale)}
                  </option>
                ))}
              </select>
            </section>
            <section className="comic-rail-section">
              <div className="comic-rail-header">
                <strong>{t('comic.storyboard', undefined, locale)}</strong>
                <span>{selectedPanel
                  ? t('comic.currentPanel', { order: selectedPanel.order }, locale)
                  : t('comic.panelCount', { count: panels.length }, locale)}</span>
              </div>
              <button
                type="button"
                className="comic-panel-add-button"
                onClick={() => void addPanelAfterSelected()}
                disabled={busy || !comic}
                title={t('comic.addPanel', undefined, locale)}
              >
                + {t('comic.addPanel', undefined, locale)}
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
                      title={t('comic.dragToReorder', undefined, locale)}
                      onPointerDown={(event) => startPanelPointerDrag(event, panel.id)}
                      aria-hidden="true"
                    >
                      ⠿
                    </span>
                    <span className="comic-panel-mini-main">
                      <strong>#{panel.order} {panel.beat}</strong>
                    <span>{panel.status} · {t('comic.historyImageCount', { count: panelVariants[panel.id]?.length ?? 0 }, locale)}</span>
                    </span>
                    <button
                      type="button"
                      className="comic-panel-mini-delete"
                      title={t('comic.deletePanel', undefined, locale)}
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
                      <FieldLabel
                        label={t('comic.panelTitleWithOrder', { order: selectedPanel.order }, locale)}
                        help={t('comic.panelTitleHelp', undefined, locale)}
                      />
                      <input
                        value={selectedPanel.beat}
                        onChange={(event) => void updatePanel(selectedPanel, { beat: event.target.value })}
                      />
                    </label>
                    <span>{panelCharacterNames(selectedPanel).length
                      ? t('comic.panelCharacters', { names: panelCharacterNames(selectedPanel).join(', ') }, locale)
                      : t('comic.noSelectedCharacters', undefined, locale)}</span>
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
                          title={t('comic.previewCurrentImage', undefined, locale)}
                        >
                          <img src={selectedPanelAsset.url} alt={`#${selectedPanel.order} ${selectedPanel.beat}`} loading="lazy" />
                        </button>
                        <figcaption>
                          <button type="button" onClick={() => setPreviewAsset(selectedPanelAsset)}>{t('common.preview', undefined, locale)}</button>
                          <button
                            type="button"
                            className={downloadNotice?.key === `panel-${selectedPanel.id}` ? 'download-started' : ''}
                            onClick={() => void saveComicImage(selectedPanelAsset, `panel-${selectedPanel.id}`, `comic-panel-${selectedPanel.order}`)}
                          >
                            {t(downloadNotice?.key === `panel-${selectedPanel.id}` ? 'common.processing' : 'common.download', undefined, locale)}
                          </button>
                          <button type="button" onClick={() => void navigator.clipboard?.writeText(selectedPanelAsset.url ?? '')}>
                            {t('common.copyUrl', undefined, locale)}
                          </button>
                        </figcaption>
                      </figure>
                    ) : (
                      <div className="comic-image-empty">{t('comic.imageNotGenerated', undefined, locale)}</div>
                    )}
                  </div>
                  <div className="comic-panel-metadata">
                    <label className="comic-panel-title-field">
                      <FieldLabel label={t('comic.panelTitle', undefined, locale)} help={t('comic.panelTitleHelp', undefined, locale)} />
                      <input
                        value={selectedPanel.beat}
                        onChange={(event) => void updatePanel(selectedPanel, { beat: event.target.value })}
                      />
                    </label>
                    <dl>
                      <dt>{t('comic.provider', undefined, locale)}</dt><dd>{providerLabel}</dd>
                      <dt>{t('comic.referenceImages', undefined, locale)}</dt><dd>{t('comic.imageCount', { count: selectedPanel.referenceAssetIds?.length ?? 0 }, locale)}</dd>
                      <dt>{t('comic.scene', undefined, locale)}</dt><dd>{activeScene(selectedPanel)?.title ?? t('comic.noScene', undefined, locale)}</dd>
                      <dt>{t('comic.asset', undefined, locale)}</dt><dd>{selectedPanel.assetId ?? t('comic.assetNotCreated', undefined, locale)}</dd>
                    </dl>
                    <div className="comic-panel-image-actions">
                      <Button variant="secondary" onClick={() => regeneratePanelImage(selectedPanel)} disabled={busy || !provider || !comic}>
                        {t('comic.regeneratePanelImage', undefined, locale)}
                      </Button>
                      <label className={`comic-upload-button ${busy || !comic ? 'disabled' : ''}`}>
                        {t('comic.uploadImage', undefined, locale)}
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
                    <div className="comic-panel-video-clips">
                      <div className="comic-prompt-field-header">
                        <span>{t('comic.mp4Clips', undefined, locale)}</span>
                        <label className={`comic-upload-button ${busy || !comic ? 'disabled' : ''}`}>
                          {t('comic.addMp4', undefined, locale)}
                          <input
                            type="file"
                            accept="video/mp4,.mp4"
                            multiple
                            disabled={busy || !comic}
                            onChange={(event) => {
                              void uploadPanelVideoClips(selectedPanel, event.currentTarget.files);
                              event.currentTarget.value = '';
                            }}
                          />
                        </label>
                      </div>
                      {selectedPanelVideoClips.length ? (
                        <div className="comic-panel-video-clip-list">
                          {selectedPanelVideoClips.map((asset, index) => (
                            <div className="comic-panel-video-clip" key={asset.id}>
                              <span title={asset.path ?? asset.id}>
                                #{index + 1} {panelVideoClipFileName(asset)}
                              </span>
                              <small>{(panelVideoClipDurationMs(asset) / 1000).toFixed(1)}s</small>
                              <small>{t(panelVideoClipHasAudio(asset) ? 'comic.hasAudioTrack' : 'comic.noAudioTrack', undefined, locale)}</small>
                              <button type="button" className="danger" onClick={() => void removePanelVideoClip(selectedPanel, asset.id)} disabled={busy}>
                                {t('common.delete', undefined, locale)}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <small>{t('comic.noMp4ClipHelp', undefined, locale)}</small>
                      )}
                      <div className="comic-panel-video-clip-settings">
                        <div className="comic-panel-video-clip-audio-controls">
                          <label className="comic-checkbox-row">
                            <input
                              type="checkbox"
                              checked={normalizePanelVideoClipAudioMode(selectedPanel.videoClipAudioMode) === 'keep'}
                              disabled={busy || !selectedPanelVideoClips.length}
                              onChange={(event) => void updatePanelVideoClipSettings(selectedPanel, {
                                videoClipAudioMode: event.target.checked ? 'keep' : 'mute',
                              })}
                            />
                            <span>{t('comic.keepOriginalAudio', undefined, locale)}</span>
                          </label>
                          <label className="comic-panel-video-clip-volume">
                            <FieldLabel label={t('comic.originalAudioVolume', undefined, locale)} help={t('comic.originalAudioVolumeHelp', undefined, locale)} />
                            <div>
                              <input
                                type="range"
                                min={0}
                                max={200}
                                step={5}
                                value={normalizePanelVideoClipAudioVolume(selectedPanel.videoClipAudioVolume)}
                                disabled={
                                  busy
                                  || !selectedPanelVideoClips.length
                                  || normalizePanelVideoClipAudioMode(selectedPanel.videoClipAudioMode) !== 'keep'
                                }
                                onChange={(event) => void updatePanelVideoClipSettings(selectedPanel, {
                                  videoClipAudioVolume: normalizePanelVideoClipAudioVolume(Number(event.target.value)),
                                })}
                              />
                              <input
                                type="number"
                                min={0}
                                max={200}
                                step={5}
                                value={normalizePanelVideoClipAudioVolume(selectedPanel.videoClipAudioVolume)}
                                disabled={
                                  busy
                                  || !selectedPanelVideoClips.length
                                  || normalizePanelVideoClipAudioMode(selectedPanel.videoClipAudioMode) !== 'keep'
                                }
                                onChange={(event) => void updatePanelVideoClipSettings(selectedPanel, {
                                  videoClipAudioVolume: normalizePanelVideoClipAudioVolume(Number(event.target.value)),
                                })}
                                aria-label={t('comic.originalAudioVolumePercent', undefined, locale)}
                              />
                              <span>%</span>
                            </div>
                          </label>
                        </div>
                        <label>
                          <FieldLabel label={t('comic.whenNarrationIsLonger', undefined, locale)} help={t('comic.whenNarrationIsLongerHelp', undefined, locale)} />
                          <select
                            value={normalizePanelVideoClipLoopMode(selectedPanel.videoClipLoopMode)}
                            disabled={busy || !selectedPanelVideoClips.length}
                            onChange={(event) => void updatePanelVideoClipSettings(selectedPanel, {
                              videoClipLoopMode: normalizePanelVideoClipLoopMode(event.target.value),
                            })}
                          >
                            <option value="freeze">{t('comic.freezeLastFrame', undefined, locale)}</option>
                            <option value="loop">{t('comic.loopVideo', undefined, locale)}</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
                </section>

                {(panelVariants[selectedPanel.id]?.length ?? 0) > 0 && (
                  <details className="comic-panel-history" open>
                    <summary>{t('comic.imageHistory', { count: panelVariants[selectedPanel.id]?.length ?? 0 }, locale)}</summary>
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
                                title={t('comic.previewHistoryImage', undefined, locale)}
                              >
                                <img src={asset.url} alt={`panel ${selectedPanel.order} variant`} loading="lazy" />
                              </button>
                            ) : (
                              <span className="comic-panel-variant-placeholder">{t('comic.noImage', undefined, locale)}</span>
                            )}
                            <small>{new Date(variant.createdAt).toLocaleTimeString()} · {variant.providerId || 'provider'}</small>
                            <div className="comic-panel-variant-actions">
                              <button
                                type="button"
                                className="comic-icon-button"
                                title={t(isCurrent ? 'comic.currentImage' : 'comic.useAsCurrentImage', undefined, locale)}
                                disabled={isCurrent || !variant.assetId}
                                onClick={() => selectPanelVariant(selectedPanel, variant)}
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                className="comic-icon-button danger"
                                title={t(isCurrent ? 'comic.currentImageCannotDelete' : 'common.delete', undefined, locale)}
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
                    <span>{t('comic.narrationScript', undefined, locale)}</span>
                    <span>{selectedPanel.ttsDurationMs
                      ? t('comic.audioDuration', { seconds: Math.round(selectedPanel.ttsDurationMs / 100) / 10 }, locale)
                      : t('comic.audioNotGenerated', undefined, locale)}</span>
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
                    <FieldLabel label={t('comic.manualDuration', undefined, locale)} help={t('comic.manualDurationHelp', undefined, locale)} />
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={panelDurationDraft[selectedPanel.id] ?? String(selectedPanel.durationSec ?? 0)}
                      onChange={(event) => updatePanelDurationDraft(selectedPanel, event.target.value)}
                      onBlur={() => clearPanelDurationDraft(selectedPanel)}
                    />
                  </label>
                  <small>{t('comic.panelDisplayDurationHelp', undefined, locale)}</small>
                  <label>
                    <FieldLabel label="Motion effect" help={t('comic.motionEffectHelp', undefined, locale)} />
                    <select
                      value={normalizeComicPanelMotionEffect(selectedPanel.motionEffect)}
                      onChange={(event) => void updatePanel(selectedPanel, {
                        motionEffect: normalizeComicPanelMotionEffect(event.target.value),
                      })}
                    >
                      {COMIC_VIDEO_MOTION_EFFECTS.map((effect) => (
                        <option key={effect.id} value={effect.id} title={comicMotionEffectDescription(effect, locale)}>
                          {comicMotionEffectLabel(effect, locale)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="comic-panel-video-actions">
                    <Button variant="secondary" disabled={busy || !comic || !selectedPanel} onClick={() => void renderSelectedPanelVideo()}>
                      {t('comic.renderPanelMp4', undefined, locale)}
                    </Button>
                    <span className="comic-panel-video-status">
                      {t(selectedPanel.segmentAssetId ? 'comic.panelMp4Ready' : 'comic.panelMp4NotRendered', undefined, locale)}
                    </span>
                  </div>
                  {currentPanelVideoAsset?.path && (
                    <div className="comic-panel-video-file">
                      <span title={currentPanelVideoAsset.path}>{t('comic.panelOutputPath', { path: currentPanelVideoAsset.path }, locale)}</span>
                      <div>
                        <button type="button" onClick={() => void openSelectedPanelVideo()} disabled={busy}>
                          {t('common.open', undefined, locale)}
                        </button>
                        <button type="button" onClick={() => void revealSelectedPanelVideo()} disabled={busy}>
                          {t('common.reveal', undefined, locale)}
                        </button>
                      </div>
                    </div>
                  )}
                  {panelVideoMessage && <p className="comic-message">{panelVideoMessage}</p>}
                </section>

                <section className="comic-editor-grid">
                  <div className="comic-prompt-box">
                    <div className="comic-prompt-field-header">
                      <span>{t('comic.visualPrompt', undefined, locale)}</span>
                      <button type="button" onClick={() => openExpandedPrompt({ title: t('comic.visualPrompt', undefined, locale), value: selectedPanel.visualPrompt, onApply: (value) => updatePanel(selectedPanel, { visualPrompt: value }) })}>{t('common.expand', undefined, locale)}</button>
                    </div>
                    <textarea value={selectedPanel.visualPrompt} onChange={(event) => updatePanel(selectedPanel, { visualPrompt: event.target.value })} />
                  </div>
                  <div className="comic-prompt-box">
                    <div className="comic-prompt-field-header">
                      <span>{t('comic.negativePrompt', undefined, locale)}</span>
                      <button type="button" onClick={() => openExpandedPrompt({ title: t('comic.negativePrompt', undefined, locale), value: selectedPanel.negativePrompt, onApply: (value) => updatePanel(selectedPanel, { negativePrompt: value }) })}>{t('common.expand', undefined, locale)}</button>
                    </div>
                    <textarea value={selectedPanel.negativePrompt} onChange={(event) => updatePanel(selectedPanel, { negativePrompt: event.target.value })} />
                  </div>
                  <div className="comic-prompt-box">
                    <div className="comic-prompt-field-header">
                      <span>{t('comic.extraGroupsJson', undefined, locale)}</span>
                      <button type="button" onClick={() => openExpandedPrompt({ title: t('comic.extraGroupsJson', undefined, locale), value: selectedPanel.extraGroupsJson ?? '', onApply: (value) => updatePanel(selectedPanel, { extraGroupsJson: value }) })}>{t('common.expand', undefined, locale)}</button>
                    </div>
                    <textarea
                      className="comic-extras-input"
                      placeholder={t('comic.extraGroupsPlaceholder', undefined, locale)}
                      value={selectedPanel.extraGroupsJson ?? ''}
                      onChange={(event) => updatePanel(selectedPanel, { extraGroupsJson: event.target.value })}
                    />
                  </div>
                  <div className="comic-prompt-box">
                    <div className="comic-prompt-field-header">
                      <span>{t('comic.finalPromptSnapshot', undefined, locale)}</span>
                      <button type="button" onClick={() => openExpandedPrompt({ title: t('comic.finalPromptSnapshot', undefined, locale), value: selectedPanel.finalPromptSnapshot ?? '', readOnly: true })}>{t('common.expand', undefined, locale)}</button>
                    </div>
                    <textarea value={selectedPanel.finalPromptSnapshot ?? ''} readOnly />
                  </div>
                </section>
                {selectedPanel.errorMessage && <p className="comic-error">{selectedPanel.errorMessage}</p>}
              </article>
            ) : (
              <div className="comic-empty-state">{t('comic.noStoryboardYet', undefined, locale)}</div>
            )}
          </section>

          <aside className="comic-side">
            {workspaceMode === 'scene' && (
              <section className="scene-source-toolbar">
                <label>
                  <FieldLabel label={t('comic.sourceChapter', undefined, locale)} help={t('comic.sourceChapterHelp', undefined, locale)} />
                  <select
                    value={chapter.id}
                    onChange={(event) => {
                      persistComicWorkspaceState({ chapterId: event.target.value });
                      onChapterChange?.(event.target.value);
                    }}
                    disabled={busy || !onChapterChange}
                  >
                    {chapters.map((item) => (
                      <option value={item.id} key={item.id}>
                        {t('comic.chapterOption', { order: item.order + 1, title: item.title }, locale)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <FieldLabel label={t('comic.panelSource', undefined, locale)} help={t('comic.panelSourceHelp', undefined, locale)} />
                  <select
                    value={selectedPanel?.id ?? ''}
                    onChange={(event) => selectPanel(event.target.value)}
                    disabled={busy || panels.length === 0}
                  >
                    {panels.length === 0 && <option value="">{t('comic.noPanels', undefined, locale)}</option>}
                    {panels.map((panel) => (
                      <option value={panel.id} key={panel.id}>
                        #{panel.order}｜{panel.beat}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
            )}

            {workspaceMode !== 'scene' && (
              <section className="comic-selector-search">
                <FieldLabel label={t('comic.searchVisualReferences', undefined, locale)} help={t('comic.searchVisualReferencesHelp', undefined, locale)} />
                <input
                  className="toolbar-input"
                  value={selectorSearch}
                  onChange={(event) => setSelectorSearch(event.target.value)}
                  placeholder={t('comic.searchVisualReferencesPlaceholder', undefined, locale)}
                />
              </section>
            )}

            {selectedPanel && (
              <section className="comic-side-section comic-character-section">
                <h3>{t('comic.characters', undefined, locale)}</h3>
                <details className="comic-character-picker" open>
                  <summary>
                    <span className="comic-character-summary-text">
                      {panelCharacterNames(selectedPanel).length
                        ? t('comic.selectedCharacters', {
                          count: panelCharacterNames(selectedPanel).length,
                          names: panelCharacterNames(selectedPanel).join(', '),
                        }, locale)
                        : t('comic.noSelectedCharacters', undefined, locale)}
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
                          previewTitle={t('comic.previewThumbnail', undefined, locale)}
                        />
                        <span>{character.name}</span>
                        {(character.referenceAssetIds?.length ?? 0) > 0 && (
                          <small>{t('comic.imageCount', { count: character.referenceAssetIds?.length ?? 0 }, locale)}</small>
                        )}
                      </label>
                    )) : (
                      <p className="comic-message">{t('comic.noMatchingCharacters', undefined, locale)}</p>
                    )}
                  </div>
                </details>
                <label className="comic-checkbox-row">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedPanel.useContinuityReference)}
                    onChange={(event) => updatePanel(selectedPanel, { useContinuityReference: event.target.checked })}
                  />
                  <FieldLabel label={t('comic.usePreviousPanelImage', undefined, locale)} help={t('comic.usePreviousPanelImageHelp', undefined, locale)} />
                </label>
              </section>
            )}

            {selectedPanel && (
              <section className="comic-side-section comic-reference-section">
                <h3>{t('comic.referenceImages', undefined, locale)}</h3>
                <details className="comic-reference-picker" open>
                  <summary>{t('comic.selectedReferenceImages', { count: selectedPanel.referenceAssetIds?.length ?? 0 }, locale)}</summary>
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
                          <strong>{t('comic.chapterOption', {
                            order: chapterOptions[0].chapter.order + 1,
                            title: chapterOptions[0].chapter.title,
                          }, locale)}</strong>
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
                                    title={t('comic.previewReferenceImage', undefined, locale)}
                                  >
                                    <img src={option.asset.url} alt={t('comic.chapterOption', {
                                      order: option.chapter.order + 1,
                                      title: `#${option.panel.order}`,
                                    }, locale)} loading="lazy" />
                                  </button>
                                )}
                                <span>#{option.panel.order}</span>
                              </label>
                            ))}
                          </div>
                        </section>
                      );
                    }) : <p className="comic-message">{t('comic.noGeneratedPanelImages', undefined, locale)}</p>}
                  </div>
                </details>
              </section>
            )}

            {(selectedPanel || workspaceMode === 'scene') && (
              <section className="comic-side-section comic-scene-assignment-section">
                <h3>{t('comic.scene', undefined, locale)}</h3>
                <MantineSelect
                  searchable
                  allowDeselect={false}
                  value={workspaceMode === 'scene' ? sceneWorkspaceSlug : selectedPanel?.sceneSlug ?? '__none__'}
                  data={[
                    { value: '__none__', label: t('comic.noScene', undefined, locale) },
                    ...scenes.map((scene) => ({
                      value: scene.slug,
                      label: `${scene.title} · ${t('comic.imageCount', { count: scene.referenceAssetIds.length }, locale)}`,
                    })),
                  ]}
                  onChange={(value) => {
                    const nextSlug = !value || value === '__none__' ? undefined : value;
                    if (workspaceMode === 'scene') setSceneWorkspaceSlug(nextSlug ?? '__none__');
                    if (selectedPanel) void updatePanel(selectedPanel, { sceneSlug: nextSlug });
                  }}
                  placeholder={t('comic.searchOrSelectScene', undefined, locale)}
                  nothingFoundMessage={t('comic.noMatchingScenes', undefined, locale)}
                />
                <Button
                  variant="secondary"
                  className="comic-scene-create-button"
                  onClick={() => selectedPanel && createSceneFromPanel(selectedPanel)}
                  disabled={busy || !selectedPanel}
                >
                  {t('comic.createSceneFromPanel', undefined, locale)}
                </Button>
              </section>
            )}

            {selectedScene && workspaceMode === 'scene' && (
              <section className="scene-visual-workspace">
                <section className="scene-text-settings">
                  <header className="scene-settings-header">
                    <div>
                      <h3>{selectedScene.title}</h3>
                      <span>{selectedScene.slug}</span>
                    </div>
                    <button type="button" onClick={() => deleteScene(selectedScene)}>{t('comic.deleteScene', undefined, locale)}</button>
                  </header>
                  <label>
                    <FieldLabel label={t('comic.sceneName', undefined, locale)} help={t('comic.sceneNameHelp', undefined, locale)} />
                    <input value={selectedScene.title} onChange={(event) => void updateScene(selectedScene, { title: event.target.value })} />
                  </label>
                  <label className="scene-prompt-field">
                    <FieldLabel label={t('comic.scenePrompt', undefined, locale)} help={t('comic.scenePromptHelp', undefined, locale)} />
                    <textarea value={selectedScene.prompt} onChange={(event) => void updateScene(selectedScene, { prompt: event.target.value })} />
                  </label>
                  <label>
                    <FieldLabel label={t('comic.sceneNegativePrompt', undefined, locale)} help={t('comic.sceneNegativePromptHelp', undefined, locale)} />
                    <input value={selectedScene.negativePrompt} onChange={(event) => void updateScene(selectedScene, { negativePrompt: event.target.value })} />
                  </label>
                </section>

                <section className="scene-reference-settings">
                  <header className="scene-settings-header">
                    <div>
                      <h3>{t('comic.sceneReferenceImages', undefined, locale)}</h3>
                      <span>{t('comic.sceneImageCount', { count: selectedSceneReferenceAssets.length }, locale)}</span>
                    </div>
                  </header>
                  <label className="scene-reference-upload">
                    <FieldLabel label={t('comic.addSceneReferenceImages', undefined, locale)} help={t('comic.addSceneReferenceImagesHelp', undefined, locale)} />
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => {
                        void uploadSceneReference(selectedScene, event.target.files);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                  {selectedSceneReferenceAssets.length > 0 ? (
                    <div className="comic-scene-reference-grid scene-reference-gallery" aria-label={`${selectedScene.title} reference images`}>
                      {selectedSceneReferenceAssets.map((asset, index) => (
                        <figure className="comic-scene-reference-item" key={asset.id}>
                          <button
                            type="button"
                            className="comic-scene-reference-thumb"
                            onClick={() => setPreviewAsset(asset)}
                            title={t('comic.previewSceneReferenceImage', undefined, locale)}
                          >
                            <img src={asset.url} alt={`${selectedScene.title} reference ${index + 1}`} loading="lazy" />
                          </button>
                          <figcaption>
                            <span>#{index + 1}</span>
                            <button
                              type="button"
                              className="comic-scene-reference-delete"
                              onClick={() => void removeSceneReference(selectedScene, asset.id)}
                              title={t('comic.deleteSceneReferenceImage', undefined, locale)}
                            >
                              {t('common.delete', undefined, locale)}
                            </button>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  ) : (
                    <div className="scene-reference-empty">
                      <span>{t('comic.noSceneReferenceImages', undefined, locale)}</span>
                      <small>{t('comic.sceneReferenceImagesHelp', undefined, locale)}</small>
                    </div>
                  )}
                </section>
              </section>
            )}

            {selectedScene && workspaceMode !== 'scene' && (
              <section className="comic-side-section comic-scene-library-section">
                <h3>{t('comic.sceneVisualSettings', undefined, locale)}</h3>
                <div className="comic-scene-list">
                    <details className="comic-scene-card" key={selectedScene.id}>
                      <summary>
                        <VisualReferenceThumb
                          url={referenceThumbnail(selectedScene)}
                          label={selectedScene.title}
                          onPreview={(url) => previewImageUrl(url, selectedScene.title)}
                          previewTitle={t('comic.previewThumbnail', undefined, locale)}
                        />
                        <span className="comic-scene-card-title">{selectedScene.title}</span>
                        <span>{selectedScene.slug}</span>
                      </summary>
                      <div className="comic-scene-card-actions">
                        <button type="button" onClick={() => deleteScene(selectedScene)}>{t('common.delete', undefined, locale)}</button>
                      </div>
                      <label>
                        <FieldLabel label={t('comic.sceneName', undefined, locale)} help={t('comic.sceneNameHelp', undefined, locale)} />
                        <input value={selectedScene.title} onChange={(event) => void updateScene(selectedScene, { title: event.target.value })} />
                      </label>
                      <label>
                        <FieldLabel label={t('comic.scenePrompt', undefined, locale)} help={t('comic.scenePromptHelp', undefined, locale)} />
                        <textarea value={selectedScene.prompt} onChange={(event) => void updateScene(selectedScene, { prompt: event.target.value })} />
                      </label>
                      <label>
                        <FieldLabel label={t('comic.sceneNegativePrompt', undefined, locale)} help={t('comic.sceneNegativePromptHelp', undefined, locale)} />
                        <input value={selectedScene.negativePrompt} onChange={(event) => void updateScene(selectedScene, { negativePrompt: event.target.value })} />
                      </label>
                      <label>
                        <FieldLabel label={t('comic.referenceImages', undefined, locale)} help={t('comic.addSceneReferenceImagesHelp', undefined, locale)} />
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(event) => {
                            void uploadSceneReference(selectedScene, event.target.files);
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                      {selectedSceneReferenceAssets.length > 0 ? (
                        <div className="comic-scene-reference-grid" aria-label={`${selectedScene.title} reference images`}>
                          {selectedSceneReferenceAssets.map((asset, index) => (
                            <figure className="comic-scene-reference-item" key={asset.id}>
                              <button
                                type="button"
                                className="comic-scene-reference-thumb"
                                onClick={() => setPreviewAsset(asset)}
                                title={t('comic.previewSceneReferenceImage', undefined, locale)}
                              >
                                <img src={asset.url} alt={`${selectedScene.title} reference ${index + 1}`} loading="lazy" />
                              </button>
                              <figcaption>
                                <span>#{index + 1}</span>
                                <button
                                  type="button"
                                  className="comic-scene-reference-delete"
                                  onClick={() => void removeSceneReference(selectedScene, asset.id)}
                                  title={t('comic.deleteSceneReferenceImage', undefined, locale)}
                                >
                                  {t('common.delete', undefined, locale)}
                                </button>
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                      ) : (
                        <p className="comic-message">{t('comic.noSceneReferenceImages', undefined, locale)}</p>
                      )}
                    </details>
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
                  <strong>{t('comic.chapterVideoSettings', undefined, locale)}</strong>
                  <span>{t('comic.chapterVideoSettingsHelp', undefined, locale)}</span>
                </div>
                <button
                  type="button"
                  className="comic-video-settings-close"
                  onClick={() => setChapterVideoSettingsOpen(false)}
                  aria-label={t('comic.closeChapterVideoSettings', undefined, locale)}
                  title={t('common.close', undefined, locale)}
                >
                  ×
                </button>
              </header>
              <div className="comic-video-settings-grid">
                <label>
                  <FieldLabel label={t('comic.narrationVoice', undefined, locale)} help={t('comic.voiceHelp', undefined, locale)} />
                  <div className="comic-video-voice-row">
                    <select
                      value={videoVoice}
                      onChange={(event) => {
                        setVideoVoice(event.target.value);
                        setVoicePreviewMessage('');
                      }}
                    >
                      {COMIC_VIDEO_VOICE_GROUPS.map((group) => (
                        <optgroup key={group.label} label={voiceGroupLabel(group.label, locale)}>
                          {group.voices.map((voice) => (
                            <option key={voice.id} value={voice.id}>{voice.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="comic-video-voice-preview"
                      onClick={() => void previewVideoVoice()}
                      disabled={busy || voicePreviewing || !comic}
                      title={t('comic.voicePreviewTitle', undefined, locale)}
                    >
                      {voicePreviewing ? t('comic.playing', undefined, locale) : t('comic.previewVoice', undefined, locale)}
                    </button>
                  </div>
                  {voicePreviewMessage && <small>{voicePreviewMessage}</small>}
                </label>
                <label>
                  <FieldLabel label={t('comic.interPanelPause', undefined, locale)} help={t('comic.interPanelPauseHelp', undefined, locale)} />
                  <select value={panelPauseMs} onChange={(event) => setPanelPauseMs(Number(event.target.value))}>
                    <option value={0}>0ms</option>
                    <option value={250}>250ms</option>
                    <option value={400}>400ms</option>
                    <option value={600}>600ms</option>
                    <option value={1000}>1000ms</option>
                  </select>
                </label>
                <label>
                  <FieldLabel label="Edge-TTS" help={t('comic.edgeTtsHelp', undefined, locale)} />
                  <input value={edgeTtsBin} onChange={(event) => setEdgeTtsBin(event.target.value)} />
                </label>
                <label>
                  <FieldLabel label="ffmpeg" help={t('comic.ffmpegHelp', undefined, locale)} />
                  <input value={ffmpegBin} onChange={(event) => setFfmpegBin(event.target.value)} />
                </label>
                <label>
                  <FieldLabel label="ffprobe" help={t('comic.ffprobeHelp', undefined, locale)} />
                  <input value={ffprobeBin} onChange={(event) => setFfprobeBin(event.target.value)} />
                </label>
              </div>
              <footer>
                {videoAsset?.path && <span title={videoAsset.path}>{t('comic.chapterOutputPath', { path: videoAsset.path }, locale)}</span>}
                <Button variant="primary" onClick={() => setChapterVideoSettingsOpen(false)}>
                  {t('common.done', undefined, locale)}
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
                  <strong>{t('comic.videoLibrary', undefined, locale)}</strong>
                  <span>{t('comic.videoLibraryHelp', undefined, locale)}</span>
                </div>
                <button
                  type="button"
                  className="comic-video-settings-close"
                  onClick={() => setVideoLibraryOpen(false)}
                  aria-label={t('comic.closeVideoLibrary', undefined, locale)}
                  title={t('common.close', undefined, locale)}
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
                        <span>{t(
                          item.kind === 'chapter' ? 'comic.videoKindChapter' : item.kind === 'subtitle' ? 'comic.videoKindSubtitle' : 'comic.videoKindPanel',
                          undefined,
                          locale,
                        )}</span>
                        <small title={item.path ?? item.assetId ?? ''}>
                          {item.path ?? t('comic.mediaFileMissing', undefined, locale)}
                        </small>
                      </div>
                      <div className="comic-video-library-meta">
                        <span className={`comic-video-library-status ${item.status}`}>
                          {t(item.status === 'ready' ? 'comic.videoReady' : 'comic.videoMissing', undefined, locale)}
                        </span>
                        <span>{item.createdAt ? new Date(item.createdAt).toLocaleString(locale) : t('comic.noCreationTime', undefined, locale)}</span>
                      </div>
                      <div className="comic-video-library-actions">
                        <button type="button" onClick={() => void openVideoLibraryItem(item)} disabled={busy || !item.path}>
                          {t('common.open', undefined, locale)}
                        </button>
                        <button type="button" onClick={() => void revealVideoLibraryItem(item)} disabled={busy || !item.path}>
                          {t('common.reveal', undefined, locale)}
                        </button>
                        <button type="button" onClick={() => void rerenderVideoLibraryItem(item)} disabled={busy}>
                          {t('comic.rerender', undefined, locale)}
                        </button>
                        <button type="button" className="danger" onClick={() => void deleteVideoLibraryItem(item)} disabled={busy || !item.assetId}>
                          {t('common.delete', undefined, locale)}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="comic-empty-state">
                  {t('comic.noVideoOutputYet', undefined, locale)}
                </div>
              )}
            </div>
          </div>
        )}
        {previewAsset?.url && (
          <div className="comic-image-preview" role="dialog" aria-modal="true" onClick={() => setPreviewAsset(null)}>
            <div className="comic-image-preview-content" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="comic-image-preview-close" onClick={() => setPreviewAsset(null)}>×</button>
              <img src={previewAsset.url} alt={t('comic.imagePreviewAlt', undefined, locale)} />
              <div className="comic-image-preview-actions">
                <button
                  type="button"
                  className={downloadNotice?.key === `preview-${previewAsset.id}` ? 'download-started' : ''}
                  onClick={() => void saveComicImage(previewAsset, `preview-${previewAsset.id}`, 'comic-panel')}
                >
                  {t(downloadNotice?.key === `preview-${previewAsset.id}` ? 'common.processing' : 'comic.downloadImage', undefined, locale)}
                </button>
                <button type="button" onClick={() => void navigator.clipboard?.writeText(previewAsset.url ?? '')}>
                  {t('common.copyUrl', undefined, locale)}
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
                  aria-label={t('common.close', undefined, locale)}
                  title={t('common.close', undefined, locale)}
                >
                  ×
                </button>
                <button type="button" onClick={() => setExpandedPrompt(null)}>{t('common.close', undefined, locale)}</button>
              </header>
              <textarea
                value={expandedPromptDraft}
                readOnly={expandedPrompt.readOnly}
                onChange={(event) => setExpandedPromptDraft(event.target.value)}
              />
              <footer>
                <button type="button" onClick={() => setExpandedPrompt(null)}>{t('common.cancel', undefined, locale)}</button>
                {!expandedPrompt.readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      expandedPrompt.onApply?.(expandedPromptDraft);
                      setExpandedPrompt(null);
                    }}
                  >
                    {t('common.apply', undefined, locale)}
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

async function imageAssetBlob(asset: MediaAsset, locale: 'zh-TW' | 'en'): Promise<Blob> {
  if (!asset.url) throw new Error(t('comic.imageHasNoSavableUrl', undefined, locale));
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(t('comic.imageReadFailed', { status: response.status }, locale));
  const blob = await response.blob();
  const mimeType = imageMimeType(asset, blob.type);
  return blob.type === mimeType ? blob : new Blob([await blob.arrayBuffer()], { type: mimeType });
}

function imageExtension(asset: MediaAsset, fallback?: string): string {
  const mimeType = imageMimeType(asset, fallback);
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'png';
}

function imageMimeType(asset: MediaAsset, fallback?: string): string {
  const candidates = [
    asset.mimeType,
    fallback,
    dataUrlMimeType(asset.url),
  ];
  return candidates.find((item) => item?.startsWith('image/') && item !== 'image/*') ?? 'image/png';
}

function dataUrlMimeType(url?: string): string | undefined {
  if (!url?.startsWith('data:')) return undefined;
  return /^data:([^;,]+)/.exec(url)?.[1];
}

function imagePickerDescription(extension: string, locale: 'zh-TW' | 'en'): string {
  return t('comic.imageFileDescription', { format: extension === 'jpg' ? 'JPEG' : extension.toUpperCase() }, locale);
}

function referenceBindingPrompt(bindings: ComicReferenceBinding[]): string {
  const lines = bindings.map((binding, index) => `image ${index + 1} = ${binding.label}`);
  return [
    'Reference image bindings:',
    ...lines,
    'Follow these bindings strictly: each named character must match their own reference image identity and not borrow another character reference.',
  ].join('\n');
}

function voiceGroupLabel(label: string, locale: 'zh-TW' | 'en'): string {
  if (locale !== 'en') return label;
  return {
    台灣華語: 'Mandarin (Taiwan)',
    中國普通話: 'Mandarin (China)',
    中國方言: 'Chinese Regional Voices',
    香港粵語: 'Cantonese (Hong Kong)',
  }[label] ?? label;
}

function FieldLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="comic-field-label">
      {label}
      <span className="comic-help" title={help} aria-label={help}>?</span>
    </span>
  );
}

function VisualReferenceThumb({
  url,
  label,
  onPreview,
  previewTitle,
}: {
  url?: string;
  label: string;
  onPreview?: (url: string) => void;
  previewTitle: string;
}) {
  return url ? (
    <button
      type="button"
      className="comic-visual-reference-thumb-button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onPreview?.(url);
      }}
      title={previewTitle}
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

function safeFileSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'voice';
}

function readFileAsBytes(file: File): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result;
      if (!(buffer instanceof ArrayBuffer)) {
        reject(new Error('Failed to read video file'));
        return;
      }
      resolve(Array.from(new Uint8Array(buffer)));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read video file'));
    reader.readAsArrayBuffer(file);
  });
}
