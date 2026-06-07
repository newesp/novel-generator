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
import { buildReadyImageVariant, canDeleteImageVariant } from '../../lib/comic/image-variants';
import { createDefaultSceneVisual } from '../../lib/scene-visuals';
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
  const [selectorSearch, setSelectorSearch] = useState('');

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
    const assetIds = Array.from(new Set([
      ...availableCharacters.map(firstReferenceAssetId),
      ...scenes.map(firstReferenceAssetId),
    ].filter((id): id is string => Boolean(id))));
    let cancelled = false;
    if (!assetIds.length) {
      queueMicrotask(() => {
        if (!cancelled) setVisualReferenceThumbnails({});
      });
      return () => {
        cancelled = true;
      };
    }
    void Promise.all(assetIds.map((id) => storage.mediaAssets.get(id))).then((assets) => {
      if (cancelled) return;
      setVisualReferenceThumbnails(mapReferenceThumbnails(assets.filter((asset): asset is MediaAsset => Boolean(asset))));
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
      const byPanel = variants.reduce<Record<string, ComicPanelImageVariant[]>>((acc, variant) => {
        acc[variant.panelId] = [...(acc[variant.panelId] ?? []), variant];
        return acc;
      }, {});
      setPanelVariants(byPanel);
      const assetIds = Array.from(new Set(variants.map((variant) => variant.assetId).filter((id): id is string => Boolean(id))));
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

  const filteredScenes = scenes.filter((scene) => (
    !selectorSearch.trim()
    || `${scene.title} ${scene.slug} ${scene.prompt}`.toLocaleLowerCase().includes(selectorSearch.trim().toLocaleLowerCase())
  ));

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
    setReferenceLibraryRevision((current) => current + 1);
  };

  const deletePanelVariant = async (panel: ComicPanel, variant: ComicPanelImageVariant) => {
    if (!canDeleteImageVariant({ panelAssetId: panel.assetId, variantAssetId: variant.assetId })) {
      setMessage('目前採用圖不能直接刪除；請先選另一張歷史圖。');
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
    setReferenceLibraryRevision((current) => current + 1);
  };

  const updateScene = async (scene: SceneVisual, patch: Partial<SceneVisual>) => {
    const next = { ...scene, ...patch, updatedAt: new Date().getTime() };
    await storage.sceneVisuals.update(scene.id, next);
    setScenes((current) => current.map((item) => item.id === scene.id ? next : item));
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
    await updateScene(scene, {
      referenceAssetIds: [...scene.referenceAssetIds, ...uploaded.map((asset) => asset.id)],
    });
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
          <label>
            <FieldLabel label="章節" help="切換要轉成漫畫的章節。" />
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
          </label>
          <div className="comic-provider-summary">
            <FieldLabel label="???" help="圖片 provider 在「偏好設定 → 圖片生成」調整。這裡只顯示目前使用的全域設定。" />
            <strong>{providerLabel}</strong>
          </div>
          <label>
            <FieldLabel label="??" help="本章漫畫的畫風描述，會進入分鏡與最終圖片 prompt。" />
            <input
              className="toolbar-input"
              value={imageGenerationPrefs.stylePreset}
              onChange={(event) => setImageGenerationPrefs({ stylePreset: event.target.value })}
            />
          </label>
          <label>
            <FieldLabel label="???" help="希望 LLM 拆成幾格分鏡。短場景可用 4-6，完整章節建議 8-20。" />
            <input
              className="toolbar-input"
              type="number"
              value={imageGenerationPrefs.targetPanelCount}
              onChange={(event) => setImageGenerationPrefs({ targetPanelCount: Number(event.target.value) || 8 })}
            />
          </label>
        </section>

        <section className="comic-selector-search">
          <FieldLabel label="搜尋" help="用關鍵字篩選角色、參考圖與場景視覺設定。" />
          <input
            className="toolbar-input"
            value={selectorSearch}
            onChange={(event) => setSelectorSearch(event.target.value)}
            placeholder="搜尋角色、場景、章節或分鏡..."
          />
        </section>

        {scenes.length > 0 && (
          <section className="comic-scene-library">
            <header>
              <strong>場景視覺設定</strong>
              <span>{scenes.length} ???</span>
            </header>
            <div className="comic-scene-list">
              {scenes.map((scene) => (
                <details className="comic-scene-card" key={scene.id}>
                  <summary>
                    <VisualReferenceThumb url={referenceThumbnail(scene)} label={scene.title} />
                    <span className="comic-scene-card-title">{scene.title}</span>
                    <span>{scene.slug}</span>
                  </summary>
                  <div className="comic-scene-card-actions">
                    <button type="button" onClick={() => deleteScene(scene)}>刪除</button>
                  </div>
                  <label>
                    <FieldLabel label="?????" help="固定場景外觀，例如房間格局、家具、光線、材質與時代感。" />
                    <textarea value={scene.prompt} onChange={(event) => void updateScene(scene, { prompt: event.target.value })} />
                  </label>
                  <label>
                    <FieldLabel label="?????" help="避免場景跑偏的內容，例如 modern apartment、clean lab、futuristic city。" />
                    <input value={scene.negativePrompt} onChange={(event) => void updateScene(scene, { negativePrompt: event.target.value })} />
                  </label>
                  <label>
                    <FieldLabel label="???" help="上傳場景參考圖。支援 reference image 的 provider 會自動帶入。" />
                    <input type="file" accept="image/*" multiple onChange={(event) => void uploadSceneReference(scene, event.target.files)} />
                  </label>
                  <p className="comic-message">{scene.referenceAssetIds.length} ????</p>
                </details>
              ))}
            </div>
          </section>
        )}

        {message && <p className="comic-message">{message}</p>}

        <div className="comic-panel-list">
          {panels.map((panel) => {
            const filteredPanelReferenceOptions = referenceOptionsForPanel(panel);
            return (
            <article className={`comic-panel-card ${panel.status}`} key={panel.id}>
              <header><strong>#{panel.order} {panel.beat}</strong><span>{panel.status}</span></header>
              {panelAssets[panel.id]?.url && (
                <figure className="comic-panel-image">
                  <button
                    type="button"
                    className="comic-image-button"
                    onClick={() => setPreviewAsset(panelAssets[panel.id])}
                    title="????"
                  >
                    <img src={panelAssets[panel.id].url} alt={`#${panel.order} ${panel.beat}`} loading="lazy" />
                  </button>
                  <figcaption>
                    <button type="button" onClick={() => setPreviewAsset(panelAssets[panel.id])}>預覽</button>
                    <a href={panelAssets[panel.id].url} download={`comic-panel-${panel.order}.png`}>下載</a>
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(panelAssets[panel.id].url ?? '')}>
                      複製 URL
                    </button>
                  </figcaption>
                </figure>
              )}
              {(panelVariants[panel.id]?.length ?? 0) > 0 && (
                <details className="comic-panel-history">
                  <summary>歷史圖 ({panelVariants[panel.id]?.length ?? 0})</summary>
                  <div className="comic-panel-history-grid">
                    {(panelVariants[panel.id] ?? []).map((variant) => {
                      const asset = variant.assetId ? variantAssets[variant.assetId] : undefined;
                      const isCurrent = Boolean(variant.assetId && variant.assetId === panel.assetId);
                      return (
                        <div className={`comic-panel-variant ${isCurrent ? 'current' : ''}`} key={variant.id}>
                          {asset?.url ? (
                            <img src={asset.url} alt={`panel ${panel.order} variant`} loading="lazy" />
                          ) : (
                            <span className="comic-panel-variant-placeholder">???</span>
                          )}
                          <small>{new Date(variant.createdAt).toLocaleTimeString()} · {variant.providerId || 'provider'}</small>
                          <div className="comic-panel-variant-actions">
                            <button
                              type="button"
                              className="comic-icon-button"
                              title={isCurrent ? '已是目前圖' : '設為目前'}
                              disabled={isCurrent || !variant.assetId}
                              onClick={() => selectPanelVariant(panel, variant)}
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              className="comic-icon-button danger"
                              title={isCurrent ? '目前採用圖不可刪除' : '刪除'}
                              onClick={() => deletePanelVariant(panel, variant)}
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
              <div className="comic-panel-controls">
                <label className="comic-character-control">
                  <FieldLabel label="??" help="選擇這格要使用哪些角色視覺設定；被勾選的角色會自動帶入角色 prompt 和已上傳的角色參考圖。" />
                  <details className="comic-character-picker">
                    <summary>
                      <span className="comic-character-summary-text">
                        {panelCharacterNames(panel).length ? panelCharacterNames(panel).join(', ') : '????'}
                      </span>
                    </summary>
                    <div className="comic-character-picker-menu">
                      {filteredCharacters.length ? filteredCharacters.map((character) => (
                        <label className="comic-checkbox-row" key={character.id}>
                          <input
                            type="checkbox"
                            checked={panelCharacterSelected(panel, character)}
                            onChange={(event) => togglePanelCharacter(panel, character, event.target.checked)}
                          />
                          <VisualReferenceThumb url={referenceThumbnail(character)} label={character.name} />
                          <span>{character.name}</span>
                          {(character.referenceAssetIds?.length ?? 0) > 0 && (
                            <small>{character.referenceAssetIds?.length} ?</small>
                          )}
                        </label>
                      )) : (
                        <p className="comic-message">沒有符合的角色</p>
                      )}
                    </div>
                  </details>
                </label>
                <label>
                  <FieldLabel label="??" help="選擇 Project 層級的場景視覺設定；場景 prompt 和參考圖會自動加入生圖。" />
                  <details className="comic-scene-picker">
                    <summary>
                      <span className="comic-scene-summary-text">
                        {activeScene(panel)?.title ?? '無場景'}
                      </span>
                    </summary>
                    <div className="comic-scene-picker-menu">
                      <label className="comic-checkbox-row">
                        <input
                          type="radio"
                          name={`scene-${panel.id}`}
                          checked={!panel.sceneSlug}
                          onChange={() => updatePanel(panel, { sceneSlug: undefined })}
                        />
                        <VisualReferenceThumb label="無場景" />
                        <span>無場景</span>
                      </label>
                      {filteredScenes.map((scene) => (
                        <label className="comic-checkbox-row" key={scene.id}>
                          <input
                            type="radio"
                            name={`scene-${panel.id}`}
                            checked={panel.sceneSlug === scene.slug}
                            onChange={() => updatePanel(panel, { sceneSlug: scene.slug })}
                          />
                          <VisualReferenceThumb url={referenceThumbnail(scene)} label={scene.title} />
                          <span>{scene.title}</span>
                          <small>{scene.referenceAssetIds.length} ?</small>
                        </label>
                      ))}
                    </div>
                  </details>
                </label>
                <Button variant="secondary" onClick={() => createSceneFromPanel(panel)} disabled={busy}>
                  建立場景
                </Button>
                <label className="comic-checkbox-row">
                  <input
                    type="checkbox"
                    checked={Boolean(panel.useContinuityReference)}
                    onChange={(event) => updatePanel(panel, { useContinuityReference: event.target.checked })}
                  />
                  <FieldLabel label="自動使用上一格" help="開啟後會優先使用同章上一格的成圖；若這是章節第一格，會嘗試接續前一章最新漫畫的最後一格。" />
                </label>
                <div className="comic-reference-control">
                  <FieldLabel label="參考圖" help="從已生成的章節分鏡中挑選圖片，生成時會真的傳給支援參考圖的 Provider。" />
                  <details className="comic-reference-picker">
                    <summary>已選 {panel.referenceAssetIds?.length ?? 0} 張</summary>
                    <div className="comic-reference-picker-menu">
                      {filteredPanelReferenceOptions.length ? Array.from(new Set(
                        filteredPanelReferenceOptions.map((option) => option.chapter.id),
                      )).map((chapterId) => {
                        const chapterOptions = filteredPanelReferenceOptions.filter((option) => option.chapter.id === chapterId);
                        return (
                          <section className="comic-reference-chapter" key={chapterId}>
                            <strong>第 {chapterOptions[0].chapter.order} 章 · {chapterOptions[0].chapter.title}</strong>
                            <div className="comic-reference-grid">
                              {chapterOptions.map((option) => (
                                <label className="comic-reference-option" key={option.asset.id}>
                                  <input
                                    type="checkbox"
                                    checked={panel.referenceAssetIds?.includes(option.asset.id) ?? false}
                                    onChange={(event) => togglePanelReference(panel, option.asset.id, event.target.checked)}
                                  />
                                  {option.asset.url && <img src={option.asset.url} alt={`第 ${option.chapter.order} 章第 ${option.panel.order} 格`} loading="lazy" />}
                                  <span>第 {option.panel.order} 格</span>
                                </label>
                              ))}
                            </div>
                          </section>
                        );
                      }) : <p className="comic-message">尚無可用的已生成分鏡圖</p>}
                    </div>
                  </details>
                </div>
              </div>
              <div className="comic-prompt-field-header">
                <span>畫面提示詞</span>
                <button type="button" onClick={() => openExpandedPrompt({ title: '畫面提示詞', value: panel.visualPrompt, onApply: (value) => updatePanel(panel, { visualPrompt: value }) })}>展開</button>
              </div>
              <textarea value={panel.visualPrompt} onChange={(event) => updatePanel(panel, { visualPrompt: event.target.value })} />
              <div className="comic-prompt-field-header">
                <span>排除提示詞</span>
                <button type="button" onClick={() => openExpandedPrompt({ title: '排除提示詞', value: panel.negativePrompt, onApply: (value) => updatePanel(panel, { negativePrompt: value }) })}>展開</button>
              </div>
              <input value={panel.negativePrompt} onChange={(event) => updatePanel(panel, { negativePrompt: event.target.value })} />
              <div className="comic-prompt-field-header">
                <span>群眾設定 JSON</span>
                <button type="button" onClick={() => openExpandedPrompt({ title: '群眾設定 JSON', value: panel.extraGroupsJson ?? '', onApply: (value) => updatePanel(panel, { extraGroupsJson: value }) })}>展開</button>
              </div>
              <textarea
                className="comic-extras-input"
                placeholder='extraGroups JSON，例如 [{"label":"居民","count":12,"role":"civilians","prompt":"穿著舊布衣，站在背景","visualPriority":"low"}]'
                value={panel.extraGroupsJson ?? ''}
                onChange={(event) => updatePanel(panel, { extraGroupsJson: event.target.value })}
              />
              {panel.finalPromptSnapshot && (
                <details className="comic-prompt-preview">
                  <summary>
                    <span>最終提示詞</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        openExpandedPrompt({ title: '最終提示詞', value: panel.finalPromptSnapshot ?? '', readOnly: true });
                      }}
                    >
                      展開
                    </button>
                  </summary>
                  <pre>{panel.finalPromptSnapshot}</pre>
                </details>
              )}
              {panel.errorMessage && <p className="comic-error">{panel.errorMessage}</p>}
              {panel.assetId && <p className="comic-message">asset: {panel.assetId}</p>}
              <Button variant="secondary" onClick={() => regeneratePanelImage(panel)} disabled={busy || !provider || !comic}>
                重生此格
              </Button>
            </article>
            );
          })}
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

function VisualReferenceThumb({ url, label }: { url?: string; label: string }) {
  return url ? (
    <img className="comic-visual-reference-thumb" src={url} alt={`${label} reference`} loading="lazy" />
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
