import { useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import type { Chapter, ChapterComic, Character, ComicPanel, ImageProviderConfig, MediaAsset, Project } from '../../types';
import { storage } from '../../lib/storage';
import { generateStoryboardDraft } from '../../lib/comic/storyboard-generate';
import { getImageProvider } from '../../lib/comic/providers';
import { runImageJobQueue } from '../../lib/comic/image-job-queue';
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const provider = useMemo(() => getImageProvider(imageGenerationPrefs.providerId), [imageGenerationPrefs.providerId]);

  const providerConfig = (): ImageProviderConfig => (
    imageGenerationPrefs.providerId === 'openai-compatible-image'
      ? { providerId: 'openai-compatible-image', ...imageGenerationPrefs.openaiCompatible }
      : { providerId: 'comfyui', ...imageGenerationPrefs.comfyui }
  );

  const generateStoryboard = async () => {
    setBusy(true);
    setMessage('生成分鏡中...');
    try {
      const wikiPages = await storage.wikiPages.list(chapter.projectId);
      const draft = await generateStoryboardDraft({
        project,
        chapter,
        characters,
        wikiPages,
        stylePreset: imageGenerationPrefs.stylePreset,
        targetPanelCount: imageGenerationPrefs.targetPanelCount,
      });
      const now = Date.now();
      const nextComic: ChapterComic = {
        id: uuid(),
        projectId: project.id,
        chapterId: chapter.id,
        title: `${chapter.title} 漫畫分鏡`,
        status: 'storyboard_ready',
        stylePreset: imageGenerationPrefs.stylePreset,
        providerId: imageGenerationPrefs.providerId,
        targetPanelCount: imageGenerationPrefs.targetPanelCount,
        visualContinuityBibleJson: draft.visualContinuityBibleJson,
        createdAt: now,
        updatedAt: now,
      };
      const nextPanels = draft.panels.map((panel) => ({ ...panel, id: uuid(), comicId: nextComic.id, createdAt: now, updatedAt: now }));
      await storage.comics.add(nextComic);
      await storage.comicPanels.bulkAdd(nextPanels);
      setComic(nextComic);
      setPanels(nextPanels);
      setMessage(`已產生 ${nextPanels.length} 格分鏡，請確認後開始生圖。`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const updatePanel = async (panel: ComicPanel, patch: Partial<ComicPanel>) => {
    const next = { ...panel, ...patch, updatedAt: new Date().getTime() };
    await storage.comicPanels.update(panel.id, next);
    setPanels((current) => current.map((item) => item.id === panel.id ? next : item));
  };

  const generateImages = async () => {
    if (!provider || !comic) return;
    setBusy(true);
    setMessage('批次生圖中...');
    try {
      const config = providerConfig();
      const health = await provider.validateConfig(config);
      if (!health.ok) throw new Error(health.message);
      await storage.comics.update(comic.id, { status: 'generating', updatedAt: Date.now() });
      const results = await runImageJobQueue({
        panels,
        onPanelUpdate: async (panel) => {
          setPanels((current) => current.map((item) => item.id === panel.id ? panel : item));
          await storage.comicPanels.update(panel.id, panel);
        },
        generate: async (panel) => {
          const output = await provider.generateImage({
            panelId: panel.id,
            prompt: panel.visualPrompt,
            negativePrompt: panel.negativePrompt,
            width: imageGenerationPrefs.width,
            height: imageGenerationPrefs.height,
            seed: panel.seed,
            providerConfig: config,
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
          return { assetId: asset.id, url: output.url };
        },
      });
      const failed = results.filter((panel) => panel.status === 'failed').length;
      await storage.comics.update(comic.id, { status: failed ? 'partial' : 'ready', updatedAt: Date.now() });
      setPanels(results);
      setMessage(failed ? `完成，但 ${failed} 格失敗，可修改後重試。` : '漫畫圖片已生成。');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={`轉漫畫：${chapter.title}`}
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
          <label>Provider
            <select className="toolbar-select" value={imageGenerationPrefs.providerId} onChange={(event) => setImageGenerationPrefs({ providerId: event.target.value as 'comfyui' | 'openai-compatible-image' })}>
              <option value="comfyui">ComfyUI HTTP API</option>
              <option value="openai-compatible-image">OpenAI-compatible Image</option>
            </select>
          </label>
          <label>Style
            <input className="toolbar-input" value={imageGenerationPrefs.stylePreset} onChange={(event) => setImageGenerationPrefs({ stylePreset: event.target.value })} />
          </label>
          <label>Panels
            <input className="toolbar-input" type="number" value={imageGenerationPrefs.targetPanelCount} onChange={(event) => setImageGenerationPrefs({ targetPanelCount: Number(event.target.value) || 8 })} />
          </label>
        </section>

        {imageGenerationPrefs.providerId === 'comfyui' ? (
          <section className="comic-provider-grid">
            <input className="toolbar-input" placeholder="ComfyUI Base URL" value={imageGenerationPrefs.comfyui.baseUrl} onChange={(event) => setImageGenerationPrefs({ comfyui: { baseUrl: event.target.value } })} />
            <input className="toolbar-input" placeholder="prompt node" value={imageGenerationPrefs.comfyui.promptNodeId} onChange={(event) => setImageGenerationPrefs({ comfyui: { promptNodeId: event.target.value } })} />
            <input className="toolbar-input" placeholder="negative node" value={imageGenerationPrefs.comfyui.negativePromptNodeId} onChange={(event) => setImageGenerationPrefs({ comfyui: { negativePromptNodeId: event.target.value } })} />
            <input className="toolbar-input" placeholder="seed node" value={imageGenerationPrefs.comfyui.seedNodeId} onChange={(event) => setImageGenerationPrefs({ comfyui: { seedNodeId: event.target.value } })} />
            <input className="toolbar-input" placeholder="width node" value={imageGenerationPrefs.comfyui.widthNodeId} onChange={(event) => setImageGenerationPrefs({ comfyui: { widthNodeId: event.target.value } })} />
            <input className="toolbar-input" placeholder="height node" value={imageGenerationPrefs.comfyui.heightNodeId} onChange={(event) => setImageGenerationPrefs({ comfyui: { heightNodeId: event.target.value } })} />
            <textarea className="form-textarea" placeholder="ComfyUI workflow JSON" value={imageGenerationPrefs.comfyui.workflowJson} onChange={(event) => setImageGenerationPrefs({ comfyui: { workflowJson: event.target.value } })} />
          </section>
        ) : (
          <section className="comic-provider-grid">
            <input className="toolbar-input" placeholder="Base URL" value={imageGenerationPrefs.openaiCompatible.baseUrl} onChange={(event) => setImageGenerationPrefs({ openaiCompatible: { baseUrl: event.target.value } })} />
            <input className="toolbar-input" placeholder="Model" value={imageGenerationPrefs.openaiCompatible.model} onChange={(event) => setImageGenerationPrefs({ openaiCompatible: { model: event.target.value } })} />
            <input className="toolbar-input" placeholder="API Key" type="password" value={imageGenerationPrefs.openaiCompatible.apiKey} onChange={(event) => setImageGenerationPrefs({ openaiCompatible: { apiKey: event.target.value } })} />
          </section>
        )}

        {message && <p className="comic-message">{message}</p>}

        <div className="comic-panel-list">
          {panels.map((panel) => (
            <article className={`comic-panel-card ${panel.status}`} key={panel.id}>
              <header><strong>#{panel.order} {panel.beat}</strong><span>{panel.status}</span></header>
              <textarea value={panel.visualPrompt} onChange={(event) => updatePanel(panel, { visualPrompt: event.target.value })} />
              <input value={panel.negativePrompt} onChange={(event) => updatePanel(panel, { negativePrompt: event.target.value })} />
              {panel.errorMessage && <p className="comic-error">{panel.errorMessage}</p>}
              {panel.assetId && <p className="comic-message">asset: {panel.assetId}</p>}
            </article>
          ))}
        </div>
      </div>
    </Modal>
  );
}
