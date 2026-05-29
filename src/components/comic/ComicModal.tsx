import { useMemo, useState, type ReactNode } from 'react';
import { v4 as uuid } from 'uuid';
import type { Chapter, ChapterComic, Character, ComicPanel, ImageProviderConfig, MediaAsset, Project } from '../../types';
import { storage } from '../../lib/storage';
import { generateStoryboardDraft } from '../../lib/comic/storyboard-generate';
import { getImageProvider } from '../../lib/comic/providers';
import { runImageJobQueue } from '../../lib/comic/image-job-queue';
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
          <label>
            <FieldLabel label="Provider" help="選擇圖片生成後端。本地 ComfyUI 適合工作流與角色一致性；OpenAI-compatible 適合線上 API。" />
            <select className="toolbar-select" value={imageGenerationPrefs.providerId} onChange={(event) => setImageGenerationPrefs({ providerId: event.target.value as 'comfyui' | 'openai-compatible-image' })}>
              <option value="comfyui">ComfyUI HTTP API</option>
              <option value="openai-compatible-image">OpenAI-compatible Image</option>
            </select>
          </label>
          <label>
            <FieldLabel label="Style" help="整批分鏡與圖片 prompt 的畫風描述，例如黑白漫畫、賽博龐克、吉卜力風等。" />
            <input className="toolbar-input" value={imageGenerationPrefs.stylePreset} onChange={(event) => setImageGenerationPrefs({ stylePreset: event.target.value })} />
          </label>
          <label>
            <FieldLabel label="Panels" help="希望 LLM 拆成幾格分鏡。短場景可用 4-6，完整章節建議 8-20。" />
            <input className="toolbar-input" type="number" value={imageGenerationPrefs.targetPanelCount} onChange={(event) => setImageGenerationPrefs({ targetPanelCount: Number(event.target.value) || 8 })} />
          </label>
        </section>

        {imageGenerationPrefs.providerId === 'comfyui' ? (
          <section className="comic-provider-grid">
            <Field label="Base URL" help="ComfyUI 服務網址。預設通常是 http://127.0.0.1:8188。">
              <input className="toolbar-input" value={imageGenerationPrefs.comfyui.baseUrl} onChange={(event) => setImageGenerationPrefs({ comfyui: { baseUrl: event.target.value } })} />
            </Field>
            <Field label="Prompt node" help="ComfyUI workflow 中負責正向 prompt 的節點 ID。">
              <input className="toolbar-input" placeholder="例如 6" value={imageGenerationPrefs.comfyui.promptNodeId} onChange={(event) => setImageGenerationPrefs({ comfyui: { promptNodeId: event.target.value } })} />
            </Field>
            <Field label="Negative node" help="ComfyUI workflow 中負責 negative prompt 的節點 ID。">
              <input className="toolbar-input" placeholder="例如 7" value={imageGenerationPrefs.comfyui.negativePromptNodeId} onChange={(event) => setImageGenerationPrefs({ comfyui: { negativePromptNodeId: event.target.value } })} />
            </Field>
            <Field label="Seed node" help="ComfyUI workflow 中存放 seed 的節點 ID；用來重現或微調同一格圖片。">
              <input className="toolbar-input" placeholder="例如 3" value={imageGenerationPrefs.comfyui.seedNodeId} onChange={(event) => setImageGenerationPrefs({ comfyui: { seedNodeId: event.target.value } })} />
            </Field>
            <Field label="Width node" help="ComfyUI workflow 中控制圖片寬度的節點 ID。">
              <input className="toolbar-input" placeholder="例如 5" value={imageGenerationPrefs.comfyui.widthNodeId} onChange={(event) => setImageGenerationPrefs({ comfyui: { widthNodeId: event.target.value } })} />
            </Field>
            <Field label="Height node" help="ComfyUI workflow 中控制圖片高度的節點 ID。">
              <input className="toolbar-input" placeholder="例如 5" value={imageGenerationPrefs.comfyui.heightNodeId} onChange={(event) => setImageGenerationPrefs({ comfyui: { heightNodeId: event.target.value } })} />
            </Field>
            <Field label="Workflow JSON" help="從 ComfyUI 匯出的 workflow JSON。系統會把 prompt、negative、seed、尺寸填入上方指定節點。" wide>
              <textarea className="form-textarea" placeholder="貼上 ComfyUI workflow JSON" value={imageGenerationPrefs.comfyui.workflowJson} onChange={(event) => setImageGenerationPrefs({ comfyui: { workflowJson: event.target.value } })} />
            </Field>
          </section>
        ) : (
          <section className="comic-provider-grid">
            <Field label="Base URL" help="OpenAI-compatible 圖片 API 的 base URL，例如 https://api.example.com/v1。">
              <input className="toolbar-input" value={imageGenerationPrefs.openaiCompatible.baseUrl} onChange={(event) => setImageGenerationPrefs({ openaiCompatible: { baseUrl: event.target.value } })} />
            </Field>
            <Field label="Model" help="圖片模型名稱。不同 provider 的名稱不同，請填該服務文件中的 image model。">
              <input className="toolbar-input" value={imageGenerationPrefs.openaiCompatible.model} onChange={(event) => setImageGenerationPrefs({ openaiCompatible: { model: event.target.value } })} />
            </Field>
            <Field label="API Key" help="線上圖片 API key，只存在本機偏好設定中。">
              <input className="toolbar-input" type="password" value={imageGenerationPrefs.openaiCompatible.apiKey} onChange={(event) => setImageGenerationPrefs({ openaiCompatible: { apiKey: event.target.value } })} />
            </Field>
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

function Field({ label, help, children, wide = false }: {
  label: string;
  help: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`comic-field${wide ? ' wide' : ''}`}>
      <FieldLabel label={label} help={help} />
      {children}
    </label>
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
