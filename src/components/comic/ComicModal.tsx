import { useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import type { Chapter, ChapterComic, Character, ComicPanel, ComicPanelImageVariant, ImageProviderConfig, MediaAsset, Project, SceneVisual } from '../../types';
import { storage } from '../../lib/storage';
import { generateStoryboardDraft } from '../../lib/comic/storyboard-generate';
import { getImageProvider } from '../../lib/comic/providers';
import { runImageJobQueue } from '../../lib/comic/image-job-queue';
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
import { createDefaultSceneVisual, filterSceneVisuals, removeSceneReferenceAssetId } from '../../lib/scene-visuals';
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

  const provider = useMemo(() => getImageProvider(imageGenerationPrefs.providerId), [imageGenerationPrefs.providerId]);
  const panelWriteQueue = useMemo(
    () => createPanelWriteQueue((panelId, patch) => storage.comicPanels.update(panelId, patch)),
    [],
  );
  const providerLabel = imageGenerationPrefs.providerId === 'comfyui'
    ? 'ComfyUI HTTP API'
    : imageGenerationPrefs.providerId === 'deepinfra-flux'
    ? 'DeepInfra FLUX-2'
    : 'OpenAI-compatible Image';

  const providerConfig = (): ImageProviderConfig => (
    imageGenerationPrefs.providerId === 'openai-compatible-image'
      ? { providerId: 'openai-compatible-image', ...imageGenerationPrefs.openaiCompatible }
      : imageGenerationPrefs.providerId === 'deepinfra-flux'
      ? { providerId: 'deepinfra-flux', ...imageGenerationPrefs.deepinfraFlux }
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
    if (!panels.length) {
      setSelectedPanelId(null);
      return;
    }
    if (!selectedPanelId || !panels.some((panel) => panel.id === selectedPanelId)) {
      setSelectedPanelId(panels[0].id);
    }
  }, [panels, selectedPanelId]);

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
        acc[variant.panelId] = [...(acc[variant.panelId] ?? []), variant];
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
    const asset: MediaAsset = {
      id: uuid(),
      projectId: project.id,
      chapterId: chapter.id,
      kind: 'comic_panel_image',
      url: output.url,
      mimeType: output.mimeType,
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
    return { assetId: asset.id, url: output.url };
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
        createdAt: currentComic?.createdAt ?? now,
        updatedAt: now,
      };
      if (currentComic) {
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
      setPreviewAsset(null);
      setMessage(`已產生 ${nextPanels.length} 格分鏡，請確認後開始生圖。`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const updatePanel = (panel: ComicPanel, patch: Partial<ComicPanel>): Promise<void> => {
    const persistedPatch = { ...patch, updatedAt: new Date().getTime() };
    setPanels((current) => current.map((item) => (
      item.id === panel.id ? { ...item, ...persistedPatch } : item
    )));
    return panelWriteQueue.enqueue(panel.id, persistedPatch);
  };

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
      || `${option.chapter.title} ${option.chapter.order} ${option.panel.order} ${option.panel.beat}`.toLocaleLowerCase().includes(selectorSearch.trim().toLocaleLowerCase())
    ))
  );

  const filteredCharacters = availableCharacters.filter((character) => (
    !selectorSearch.trim()
    || `${character.name} ${character.appearance} ${character.race}`.toLocaleLowerCase().includes(selectorSearch.trim().toLocaleLowerCase())
  ));

  const filteredScenes = filterSceneVisuals(scenes, selectorSearch);
  const selectedPanel = panels.find((panel) => panel.id === selectedPanelId) ?? panels[0];
  const selectedPanelReferenceOptions = selectedPanel ? referenceOptionsForPanel(selectedPanel) : [];
  const selectedPanelAsset = selectedPanel ? panelAssets[selectedPanel.id] : undefined;

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
    const usedPanels = panels.filter((panel) => panel.sceneSlug === scene.slug);
    const message = usedPanels.length
      ? `刪除場景「${scene.title}」？${usedPanels.length} 格分鏡會清除這個場景設定。`
      : `刪除場景「${scene.title}」？`;
    if (!window.confirm(message)) return;
    for (const panel of usedPanels) {
      await updatePanel(panel, { sceneSlug: undefined });
    }
    await storage.sceneVisuals.delete(scene.id);
    setScenes((current) => current.filter((item) => item.id !== scene.id));
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
        </>
      }
    >
      <div className="comic-modal">
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

        <div className="comic-workspace">
          <aside className="comic-rail">
            <section className="comic-rail-section">
              <div className="comic-rail-header"><strong>章節</strong><span>{chapters.length} 章</span></div>
              <select
                className="toolbar-input"
                value={chapter.id}
                onChange={(event) => onChapterChange?.(event.target.value)}
                disabled={busy || !onChapterChange}
              >
                {chapters.map((item) => (
                  <option value={item.id} key={item.id}>
                    第 {item.order} 章｜{item.title}
                  </option>
                ))}
              </select>
            </section>
            <section className="comic-rail-section">
              <div className="comic-rail-header">
                <strong>分鏡</strong>
                <span>{selectedPanel ? `目前選 #${selectedPanel.order}` : `${panels.length} 格`}</span>
              </div>
              <div className="comic-panel-mini-list">
                {panels.map((panel) => (
                  <button
                    type="button"
                    className={`comic-panel-mini ${selectedPanel?.id === panel.id ? 'active' : ''}`}
                    key={panel.id}
                    onClick={() => setSelectedPanelId(panel.id)}
                  >
                    <strong>#{panel.order} {panel.beat}</strong>
                    <span>{panel.status} · {panelVariants[panel.id]?.length ?? 0} 張歷史圖</span>
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <section className="comic-detail">
            {selectedPanel ? (
              <article className={`comic-panel-card ${selectedPanel.status}`}>
                <header>
                  <div>
                    <strong>#{selectedPanel.order} {selectedPanel.beat}</strong>
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
                          <a href={selectedPanelAsset.url} download={`comic-panel-${selectedPanel.order}.png`}>下載</a>
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
                    <dl>
                      <dt>提供商</dt><dd>{providerLabel}</dd>
                      <dt>參考圖</dt><dd>{selectedPanel.referenceAssetIds?.length ?? 0} 張</dd>
                      <dt>場景</dt><dd>{activeScene(selectedPanel)?.title ?? '無場景'}</dd>
                      <dt>Asset</dt><dd>{selectedPanel.assetId ?? '尚未建立'}</dd>
                    </dl>
                    <Button variant="secondary" onClick={() => regeneratePanelImage(selectedPanel)} disabled={busy || !provider || !comic}>
                      重生此格
                    </Button>
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

            {selectedPanel && (
              <section className="comic-side-section">
                <h3>參考圖</h3>
                <details className="comic-reference-picker" open>
                  <summary>已選 {selectedPanel.referenceAssetIds?.length ?? 0} 張</summary>
                  <div className="comic-reference-picker-menu">
                    {selectedPanelReferenceOptions.length ? Array.from(new Set(
                      selectedPanelReferenceOptions.map((option) => option.chapter.id),
                    )).map((chapterId) => {
                      const chapterOptions = selectedPanelReferenceOptions.filter((option) => option.chapter.id === chapterId);
                      return (
                        <section className="comic-reference-chapter" key={chapterId}>
                          <strong>第 {chapterOptions[0].chapter.order} 章 · {chapterOptions[0].chapter.title}</strong>
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
                                    <img src={option.asset.url} alt={`第 ${option.chapter.order} 章第 ${option.panel.order} 格`} loading="lazy" />
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
        {previewAsset?.url && (
          <div className="comic-image-preview" role="dialog" aria-modal="true" onClick={() => setPreviewAsset(null)}>
            <div className="comic-image-preview-content" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="comic-image-preview-close" onClick={() => setPreviewAsset(null)}>×</button>
              <img src={previewAsset.url} alt="漫畫圖片預覽" />
              <div className="comic-image-preview-actions">
                <a href={previewAsset.url} download="comic-panel.png">下載圖片</a>
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
