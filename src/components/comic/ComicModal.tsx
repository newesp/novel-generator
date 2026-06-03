import { useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import type { Chapter, ChapterComic, Character, ComicPanel, ImageProviderConfig, MediaAsset, Project, SceneVisual } from '../../types';
import { storage } from '../../lib/storage';
import { generateStoryboardDraft } from '../../lib/comic/storyboard-generate';
import { getImageProvider } from '../../lib/comic/providers';
import { runImageJobQueue } from '../../lib/comic/image-job-queue';
import { composeComicImagePrompt } from '../../lib/comic/prompt-composer';
import { mapPanelAssets } from '../../lib/comic/media-assets';
import { resolveReferenceAssets } from '../../lib/comic/reference-assets';
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
  characters: Character[];
}

export function ComicModal({ open, onClose, project, chapter, characters }: ComicModalProps) {
  const { imageGenerationPrefs, setImageGenerationPrefs } = useSettingsStore();
  const [comic, setComic] = useState<ChapterComic | null>(null);
  const [panels, setPanels] = useState<ComicPanel[]>([]);
  const [scenes, setScenes] = useState<SceneVisual[]>([]);
  const [panelAssets, setPanelAssets] = useState<Record<string, MediaAsset>>({});
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const provider = useMemo(() => getImageProvider(imageGenerationPrefs.providerId), [imageGenerationPrefs.providerId]);
  const providerLabel = imageGenerationPrefs.providerId === 'comfyui'
    ? 'ComfyUI HTTP API'
    : imageGenerationPrefs.providerId === 'deepinfra-flux'
    ? 'DeepInfra FLUX-2-pro'
    : 'OpenAI-compatible Image';

  const providerConfig = (): ImageProviderConfig => (
    imageGenerationPrefs.providerId === 'openai-compatible-image'
      ? { providerId: 'openai-compatible-image', ...imageGenerationPrefs.openaiCompatible }
      : imageGenerationPrefs.providerId === 'deepinfra-flux'
      ? { providerId: 'deepinfra-flux', ...imageGenerationPrefs.deepinfraFlux }
      : { providerId: 'comfyui', ...imageGenerationPrefs.comfyui }
  );

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
    void storage.sceneVisuals.listByProject(project.id).then((items) => {
      if (!cancelled) setScenes(items);
    });
    return () => {
      cancelled = true;
    };
  }, [open, project.id]);

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

  const persistGeneratedPanel = async (
    panel: ComicPanel,
    config: ImageProviderConfig,
    referenceImages: MediaAsset[] = [],
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
      createdAt: Date.now(),
    };
    await storage.mediaAssets.add(asset);
    setPanelAssets((current) => ({ ...current, [panel.id]: asset }));
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
      const wikiPages = await storage.wikiPages.list(chapter.projectId);
      const draft = await generateStoryboardDraft({
        project,
        chapter,
        characters,
        wikiPages,
        stylePreset: imageGenerationPrefs.stylePreset,
        targetPanelCount: imageGenerationPrefs.targetPanelCount,
        previousPanels: previousPanels.length ? previousPanels : undefined,
      });
      const now = Date.now();
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
        const oldAssetIds = Array.from(new Set(
          panels.map((panel) => panel.assetId).filter((assetId): assetId is string => Boolean(assetId)),
        ));
        for (const assetId of oldAssetIds) {
          await storage.mediaAssets.delete(assetId);
        }
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

  const updatePanel = async (panel: ComicPanel, patch: Partial<ComicPanel>) => {
    const next = { ...panel, ...patch, updatedAt: new Date().getTime() };
    await storage.comicPanels.update(panel.id, next);
    setPanels((current) => current.map((item) => item.id === panel.id ? next : item));
  };

  const togglePanelCharacter = (panel: ComicPanel, name: string, enabled: boolean) => {
    const names = new Set(panel.characters);
    if (enabled) names.add(name);
    else names.delete(name);
    void updatePanel(panel, { characters: Array.from(names) });
  };

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

  const updateScene = async (scene: SceneVisual, patch: Partial<SceneVisual>) => {
    const next = { ...scene, ...patch, updatedAt: new Date().getTime() };
    await storage.sceneVisuals.update(scene.id, next);
    setScenes((current) => current.map((item) => item.id === scene.id ? next : item));
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
  ): Promise<{ panel: ComicPanel; referenceImages: MediaAsset[] }> => {
    const composed = composeComicImagePrompt({
      panel,
      stylePreset: comic?.stylePreset || imageGenerationPrefs.stylePreset,
      characters,
      scenes,
    });
    const continuity = await resolveContinuityReference(panel, sourcePanels, generatedByOrder);
    const referenceAssetIds = [...composed.referenceAssetIds, ...(continuity.assetId ? [continuity.assetId] : [])];
    const resolved = await resolveReferenceAssets(referenceAssetIds, (id) => storage.mediaAssets.get(id));
    const warnings = [...composed.warnings, ...continuity.warnings, ...resolved.warnings];
    const usableReferences = provider?.capabilities.referenceImages
      ? resolved.assets.slice(0, provider.capabilities.maxReferenceImages)
      : [];
    if (resolved.assets.length && !provider?.capabilities.referenceImages) {
      warnings.push(`${providerLabel} does not support reference images; character, scene, and continuity images were skipped.`);
    }
    if (resolved.assets.length > usableReferences.length) {
      warnings.push(`${providerLabel} supports ${provider?.capabilities.maxReferenceImages ?? 0} reference images; extra images were skipped.`);
    }
    const prompt = continuity.assetId
      ? `${composed.prompt}\nContinuity reference: Use the continuity reference image only for lighting, palette, props, and action flow. Do not copy the exact camera angle unless this panel asks for it.`
      : composed.prompt;
    return {
      panel: {
        ...panel,
        finalPromptSnapshot: prompt,
        finalNegativePromptSnapshot: composed.negativePrompt,
        errorMessage: warnings.length ? warnings.join('\n') : undefined,
      },
      referenceImages: usableReferences,
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
      await storage.comics.update(comic.id, { status: 'generating', updatedAt: Date.now() });
      const generatedByOrder = new Map<number, ComicPanel>();
      const results = await runImageJobQueue({
        panels,
        onPanelUpdate: async (panel) => {
          setPanels((current) => current.map((item) => item.id === panel.id ? panel : item));
          await storage.comicPanels.update(panel.id, panel);
        },
        generate: async (panel) => {
          const prepared = await preparePanelForGeneration(panel, panels, generatedByOrder);
          await storage.comicPanels.update(panel.id, prepared.panel);
          setPanels((current) => current.map((item) => item.id === panel.id ? prepared.panel : item));
          const output = await persistGeneratedPanel(prepared.panel, config, prepared.referenceImages);
          generatedByOrder.set(panel.order, { ...prepared.panel, status: 'ready', assetId: output.assetId });
          return { ...output, panel: prepared.panel };
        },
      });
      const failed = results.filter((panel) => panel.status === 'failed').length;
      await storage.comics.update(comic.id, { status: failed ? 'partial' : 'ready', updatedAt: Date.now() });
      setPanels(results);
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
      const generatedByOrder = new Map<number, ComicPanel>();
      const prepared = await preparePanelForGeneration(panel, panels, generatedByOrder);
      const generating: ComicPanel = {
        ...prepared.panel,
        status: 'generating',
        updatedAt: Date.now(),
      };
      await updatePanel(panel, generating);
      const output = await persistGeneratedPanel(generating, config, prepared.referenceImages);
      await updatePanel(generating, {
        status: 'ready',
        assetId: output.assetId,
        updatedAt: Date.now(),
      });
      setMessage(`Panel #${panel.order} image regenerated.`);
    } catch (error) {
      await updatePanel(panel, {
        status: 'failed',
        errorMessage: errorMessage(error),
        updatedAt: Date.now(),
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
      width={760}
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
            <FieldLabel label="Provider" help="圖片 provider 在「偏好設定 → 圖片生成」調整。這裡只顯示目前使用的全域設定。" />
            <strong>{providerLabel}</strong>
          </div>
          <label>
            <FieldLabel label="Style" help="本章漫畫的畫風描述，會進入分鏡與最終圖片 prompt。" />
            <input
              className="toolbar-input"
              value={imageGenerationPrefs.stylePreset}
              onChange={(event) => setImageGenerationPrefs({ stylePreset: event.target.value })}
            />
          </label>
          <label>
            <FieldLabel label="Panels" help="希望 LLM 拆成幾格分鏡。短場景可用 4-6，完整章節建議 8-20。" />
            <input
              className="toolbar-input"
              type="number"
              value={imageGenerationPrefs.targetPanelCount}
              onChange={(event) => setImageGenerationPrefs({ targetPanelCount: Number(event.target.value) || 8 })}
            />
          </label>
        </section>

        {scenes.length > 0 && (
          <section className="comic-scene-library">
            <header>
              <strong>場景視覺設定</strong>
              <span>{scenes.length} scenes</span>
            </header>
            <div className="comic-scene-list">
              {scenes.map((scene) => (
                <details className="comic-scene-card" key={scene.id}>
                  <summary>{scene.title} <span>{scene.slug}</span></summary>
                  <label>
                    <FieldLabel label="Scene prompt" help="固定場景外觀，例如房間格局、家具、光線、材質與時代感。" />
                    <textarea value={scene.prompt} onChange={(event) => void updateScene(scene, { prompt: event.target.value })} />
                  </label>
                  <label>
                    <FieldLabel label="Negative" help="避免場景跑偏的內容，例如 modern apartment、clean lab、futuristic city。" />
                    <input value={scene.negativePrompt} onChange={(event) => void updateScene(scene, { negativePrompt: event.target.value })} />
                  </label>
                  <label>
                    <FieldLabel label="Reference images" help="上傳場景參考圖。支援 reference image 的 provider 會自動帶入。" />
                    <input type="file" accept="image/*" multiple onChange={(event) => void uploadSceneReference(scene, event.target.files)} />
                  </label>
                  <p className="comic-message">{scene.referenceAssetIds.length} reference image(s)</p>
                </details>
              ))}
            </div>
          </section>
        )}

        {message && <p className="comic-message">{message}</p>}

        <div className="comic-panel-list">
          {panels.map((panel) => (
            <article className={`comic-panel-card ${panel.status}`} key={panel.id}>
              <header><strong>#{panel.order} {panel.beat}</strong><span>{panel.status}</span></header>
              {panelAssets[panel.id]?.url && (
                <figure className="comic-panel-image">
                  <button
                    type="button"
                    className="comic-image-button"
                    onClick={() => setPreviewAsset(panelAssets[panel.id])}
                    title="Preview image"
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
              <div className="comic-panel-controls">
                <label>
                  <FieldLabel label="Characters" help="選擇這格要使用哪些角色視覺設定；被勾選的角色會自動帶入角色 prompt 和已上傳的角色參考圖。" />
                  <details className="comic-character-picker">
                    <summary>
                      {panel.characters.length ? panel.characters.join(', ') : 'No characters'}
                    </summary>
                    <div className="comic-character-picker-menu">
                      {characters.length ? characters.map((character) => (
                        <label className="comic-checkbox-row" key={character.id}>
                          <input
                            type="checkbox"
                            checked={panel.characters.includes(character.name)}
                            onChange={(event) => togglePanelCharacter(panel, character.name, event.target.checked)}
                          />
                          <span>{character.name}</span>
                          {(character.referenceAssetIds?.length ?? 0) > 0 && (
                            <small>{character.referenceAssetIds?.length} refs</small>
                          )}
                        </label>
                      )) : (
                        <p className="comic-message">No project characters</p>
                      )}
                    </div>
                  </details>
                </label>
                <label>
                  <FieldLabel label="Scene" help="選擇 Project 層級的場景視覺設定；場景 prompt 和參考圖會自動加入生圖。" />
                  <select
                    value={panel.sceneSlug ?? ''}
                    onChange={(event) => updatePanel(panel, { sceneSlug: event.target.value || undefined })}
                  >
                    <option value="">No scene</option>
                    {scenes.map((scene) => (
                      <option value={scene.slug} key={scene.id}>{scene.title}</option>
                    ))}
                  </select>
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
                  <FieldLabel label="連續性參考圖" help="開啟後會優先使用同章上一格的成圖；若這是章節第一格，會嘗試接續前一章最新漫畫的最後一格。" />
                </label>
              </div>
              <textarea value={panel.visualPrompt} onChange={(event) => updatePanel(panel, { visualPrompt: event.target.value })} />
              <input value={panel.negativePrompt} onChange={(event) => updatePanel(panel, { negativePrompt: event.target.value })} />
              <textarea
                className="comic-extras-input"
                placeholder='extraGroups JSON，例如 [{"label":"居民","count":12,"role":"civilians","prompt":"穿著舊布衣，站在背景","visualPriority":"low"}]'
                value={panel.extraGroupsJson ?? ''}
                onChange={(event) => updatePanel(panel, { extraGroupsJson: event.target.value })}
              />
              {panel.finalPromptSnapshot && (
                <details className="comic-prompt-preview">
                  <summary>Final prompt</summary>
                  <pre>{panel.finalPromptSnapshot}</pre>
                </details>
              )}
              {panel.errorMessage && <p className="comic-error">{panel.errorMessage}</p>}
              {panel.assetId && <p className="comic-message">asset: {panel.assetId}</p>}
              <Button variant="secondary" onClick={() => regeneratePanelImage(panel)} disabled={busy || !provider || !comic}>
                重生此格
              </Button>
            </article>
          ))}
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
      </div>
    </Modal>
  );
}

function FieldLabel({ label, help }: { label: string; help: string }) {
  return (
    <span className="comic-field-label">
      {label}
      <span className="comic-help" title={help} aria-label={help}>?</span>
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
