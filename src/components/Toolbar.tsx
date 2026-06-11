import { useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { useSettingsStore, type InlineEditContextMode, type AIPromptPrefs } from '../stores/settingsStore';
import {
  DEFAULT_CHAPTER_DRAFTS_TEMPLATE,
  DEFAULT_CHAPTER_CONTINUATION_RULES,
  DEFAULT_CHAPTER_CONTENT_TEMPLATE,
  DEFAULT_CHAPTER_POINTS_TEMPLATE,
  DEFAULT_CHARACTER_DRAFTS_TEMPLATE,
  DEFAULT_INLINE_ADJUST_TEMPLATE,
  DEFAULT_COMIC_STORYBOARD_TEMPLATE,
  DEFAULT_WIKI_INGEST_PLAN_TEMPLATE,
  DEFAULT_WIKI_INGEST_CREATE_TEMPLATE,
  DEFAULT_WIKI_INGEST_UPDATE_TEMPLATE,
  DEFAULT_WIKI_QUERY_ANSWER_TEMPLATE,
  DEFAULT_LINT_UNRECORDED_VERIFY_TEMPLATE,
  DEFAULT_LINT_WIKI_CONTRADICT_TEMPLATE,
  DEFAULT_LINT_WIKI_VS_CHAPTER_TEMPLATE,
  DEFAULT_LINT_FIX_SUGGEST_TEMPLATE,
  PROMPT_TEMPLATE_VARS,
  PROMPT_TEMPLATE_SAMPLES,
} from '../lib/prompt-defaults';
import { renderTemplate } from '../lib/prompt-template';
import { buildLivePromptVars } from '../lib/prompt-preview';
import { storage } from '../lib/storage';
import {
  applyLlmProviderDefaults,
  LLM_PROVIDER_DEFAULTS,
  LLM_PROVIDER_LABELS,
} from '../lib/llm-provider-defaults';
import { Button } from './common/Button';
import { Modal } from './common/Modal';
import { Input } from './common/Input';
import { EditPreviewTabs, type EditPreviewMode } from './common/EditPreviewTabs';
import { MarkdownView } from './common/MarkdownView';
import { BackupModal } from './BackupModal';
import { GlobalSearchModal } from './search/GlobalSearchModal';
import type { LLMProvider } from '../types';

/** 偏好設定 Modal 的分頁 */
type PrefsTab = 'llm' | 'image' | 'inline' | 'ai-prompts' | 'wiki';
const PREFS_TABS: { key: PrefsTab; label: string }[] = [
  { key: 'llm',        label: '🔑 LLM API' },
  { key: 'image',      label: '🖼 圖片生成' },
  { key: 'inline',     label: '✨ 選取調整' },
  { key: 'ai-prompts', label: '📜 AI 提示詞' },
  { key: 'wiki',       label: '📚 Wiki 設定' },
];

export function Toolbar() {
  const { project } = useProjectStore();
  const { view, setView } = useUIStore();
  const {
    llmConfig, inlineEdit, aiPrompts, wikiPrefs, imageGenerationPrefs, lintPrefs,
    setLlmConfig, setInlineEdit, setAiPrompts, setWikiPrefs, setImageGenerationPrefs, setLintPrefs,
  } = useSettingsStore();
  const [showPrefsModal, setShowPrefsModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [activePrefsTab, setActivePrefsTab] = useState<PrefsTab>('llm');
  const [draftLlm, setDraftLlm] = useState(llmConfig);
  const [draftInline, setDraftInline] = useState(inlineEdit);
  const [draftPrompts, setDraftPrompts] = useState(aiPrompts);
  const [draftWiki, setDraftWiki] = useState(wikiPrefs);
  const [draftImage, setDraftImage] = useState(imageGenerationPrefs);
  const [draftLint, setDraftLint] = useState(lintPrefs);
  const [activePromptKey, setActivePromptKey] = useState<keyof AIPromptPrefs>('chapterDraftsTemplate');
  const [promptViewMode, setPromptViewMode] = useState<EditPreviewMode>('edit');
  const [previewDataSource, setPreviewDataSource] = useState<PreviewDataSource>('project');

  const goHome = () => setView('home');

  const openPrefs = () => {
    setDraftLlm(llmConfig);
    setDraftInline(inlineEdit);
    setDraftPrompts(aiPrompts);
    setDraftWiki(wikiPrefs);
    setDraftImage(imageGenerationPrefs);
    setDraftLint(lintPrefs);
    setActivePrefsTab('llm');
    setActivePromptKey('chapterDraftsTemplate');
    setPromptViewMode('edit');
    setPreviewDataSource('project');
    setShowPrefsModal(true);
  };

  const savePrefs = () => {
    setLlmConfig(draftLlm);
    setInlineEdit(draftInline);
    setAiPrompts(draftPrompts);
    setWikiPrefs(draftWiki);
    setImageGenerationPrefs(draftImage);
    setLintPrefs(draftLint);
    setShowPrefsModal(false);
  };

  return (
    <>
      <div className="toolbar">
        <span
          className="toolbar-logo"
          style={{ cursor: 'pointer' }}
          onClick={goHome}
          title="返回書庫"
        >
          📖 小說產生器
        </span>

        {view === 'editor' && (
          <>
            <Button variant="text" onClick={goHome} style={{ fontSize: 12, height: 28 }}>
              ← 書庫
            </Button>
            {project && (
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {project.title}
              </span>
            )}
          </>
        )}

        <div className="toolbar-spacer" />
        {view === 'editor' && project && storage.search && (
          <Button variant="secondary" onClick={() => setShowSearchModal(true)}>🔎 全文搜尋</Button>
        )}
        <Button variant="secondary" onClick={() => setShowBackupModal(true)}>💾 備份</Button>
        <Button variant="secondary" onClick={openPrefs}>⚙️ 偏好設定</Button>
      </div>

      <BackupModal open={showBackupModal} onClose={() => setShowBackupModal(false)} />
      <GlobalSearchModal open={showSearchModal} onClose={() => setShowSearchModal(false)} />

      <Modal
        open={showPrefsModal}
        onClose={() => setShowPrefsModal(false)}
        title="⚙️ 偏好設定"
        width={720}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPrefsModal(false)}>取消</Button>
            <Button variant="primary" onClick={savePrefs}>儲存</Button>
          </>
        }
      >
        {/* —— 分頁列 —— */}
        <div className="prefs-tabs">
          {PREFS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`prefs-tab${activePrefsTab === t.key ? ' active' : ''}`}
              onClick={() => setActivePrefsTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* —— LLM API —— */}
        {activePrefsTab === 'llm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label className="form-label">提供商</label>
              <select
                className="form-input"
                value={draftLlm.provider}
                onChange={(e) => {
                  const next = e.target.value as LLMProvider;
                  setDraftLlm(applyLlmProviderDefaults(draftLlm, next));
                }}
              >
                {(['custom', 'google', 'grok'] as LLMProvider[]).map((p) => (
                  <option key={p} value={p}>{LLM_PROVIDER_LABELS[p]}</option>
                ))}
              </select>
            </div>

            <Input
              label="顯示名稱"
              value={draftLlm.name}
              onChange={(e) => setDraftLlm({ ...draftLlm, name: e.target.value })}
            />

            <Input
              label={
                draftLlm.provider === 'custom'
                  ? 'API 端點 (Base URL)'
                  : 'API 端點 (Base URL，選填)'
              }
              placeholder={LLM_PROVIDER_DEFAULTS[draftLlm.provider].baseUrl || 'https://api.openai.com/v1'}
              value={draftLlm.baseUrl}
              onChange={(e) => setDraftLlm({ ...draftLlm, baseUrl: e.target.value })}
            />

            <Input
              label="API Key"
              type="password"
              value={draftLlm.apiKey}
              onChange={(e) => setDraftLlm({ ...draftLlm, apiKey: e.target.value })}
            />
            <Input
              label="模型名稱"
              placeholder={LLM_PROVIDER_DEFAULTS[draftLlm.provider].model}
              value={draftLlm.model}
              onChange={(e) => setDraftLlm({ ...draftLlm, model: e.target.value })}
            />
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
              {draftLlm.provider === 'google'
                ? '從 Google AI Studio 取得 API Key。常用模型：gemini-2.0-flash、gemini-1.5-pro、gemini-1.5-flash。'
                : draftLlm.provider === 'grok'
                ? '從 console.x.ai 取得 API Key。常用模型：grok-2-latest、grok-2-1212、grok-beta。Grok 走 OpenAI-compatible 介面。'
                : '支援 OpenAI-compatible API（OpenAI、NVIDIA、本機 Ollama 等）。'}
            </p>
          </div>
        )}

        {/* —— 圖片生成 —— */}
        {activePrefsTab === 'image' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="form-label">圖片 Provider</label>
              <select
                className="form-input"
                value={draftImage.providerId}
                onChange={(e) => setDraftImage({
                  ...draftImage,
                  providerId: e.target.value as typeof draftImage.providerId,
                })}
              >
                <option value="comfyui">ComfyUI HTTP API</option>
                <option value="openai-compatible-image">OpenAI-compatible Image</option>
                <option value="deepinfra-flux">DeepInfra FLUX-2</option>
                <option value="google-gemini-image">Google Gemini Image</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Input
                label="預設寬度"
                type="number"
                value={String(draftImage.width)}
                onChange={(e) => setDraftImage({ ...draftImage, width: Number(e.target.value) || 1024 })}
              />
              <Input
                label="預設高度"
                type="number"
                value={String(draftImage.height)}
                onChange={(e) => setDraftImage({ ...draftImage, height: Number(e.target.value) || 1024 })}
              />
            </div>

            <Input
              label="預設漫畫風格"
              value={draftImage.stylePreset}
              onChange={(e) => setDraftImage({ ...draftImage, stylePreset: e.target.value })}
            />

            <Input
              label="預設分鏡格數"
              type="number"
              value={String(draftImage.targetPanelCount)}
              onChange={(e) => setDraftImage({ ...draftImage, targetPanelCount: Number(e.target.value) || 8 })}
            />

            {draftImage.providerId === 'comfyui' ? (
              <>
                <Input
                  label="ComfyUI Base URL"
                  value={draftImage.comfyui.baseUrl}
                  onChange={(e) => setDraftImage({
                    ...draftImage,
                    comfyui: { ...draftImage.comfyui, baseUrl: e.target.value },
                  })}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <Input
                    label="Prompt node"
                    value={draftImage.comfyui.promptNodeId}
                    onChange={(e) => setDraftImage({
                      ...draftImage,
                      comfyui: { ...draftImage.comfyui, promptNodeId: e.target.value },
                    })}
                  />
                  <Input
                    label="Negative node"
                    value={draftImage.comfyui.negativePromptNodeId}
                    onChange={(e) => setDraftImage({
                      ...draftImage,
                      comfyui: { ...draftImage.comfyui, negativePromptNodeId: e.target.value },
                    })}
                  />
                  <Input
                    label="Seed node"
                    value={draftImage.comfyui.seedNodeId}
                    onChange={(e) => setDraftImage({
                      ...draftImage,
                      comfyui: { ...draftImage.comfyui, seedNodeId: e.target.value },
                    })}
                  />
                  <Input
                    label="Width node"
                    value={draftImage.comfyui.widthNodeId}
                    onChange={(e) => setDraftImage({
                      ...draftImage,
                      comfyui: { ...draftImage.comfyui, widthNodeId: e.target.value },
                    })}
                  />
                  <Input
                    label="Height node"
                    value={draftImage.comfyui.heightNodeId}
                    onChange={(e) => setDraftImage({
                      ...draftImage,
                      comfyui: { ...draftImage.comfyui, heightNodeId: e.target.value },
                    })}
                  />
                  <Input
                    label="Output node"
                    value={draftImage.comfyui.outputNodeId}
                    onChange={(e) => setDraftImage({
                      ...draftImage,
                      comfyui: { ...draftImage.comfyui, outputNodeId: e.target.value },
                    })}
                  />
                  <Input
                    label="Reference nodes"
                    placeholder="node1,node2,node3"
                    value={draftImage.comfyui.referenceImageNodeIds.join(',')}
                    onChange={(e) => setDraftImage({
                      ...draftImage,
                      comfyui: {
                        ...draftImage.comfyui,
                        referenceImageNodeIds: e.target.value.split(',').map((value) => value.trim()).filter(Boolean),
                      },
                    })}
                  />
                </div>
                <div>
                  <label className="form-label">ComfyUI workflow JSON</label>
                  <textarea
                    className="form-textarea"
                    style={{ minHeight: 140, fontFamily: '"Cascadia Code", Consolas, monospace', fontSize: 12 }}
                    value={draftImage.comfyui.workflowJson}
                    onChange={(e) => setDraftImage({
                      ...draftImage,
                      comfyui: { ...draftImage.comfyui, workflowJson: e.target.value },
                    })}
                    placeholder="貼上 ComfyUI Save (API Format) 匯出的 workflow JSON"
                    spellCheck={false}
                  />
                </div>
              </>
            ) : draftImage.providerId === 'deepinfra-flux' ? (
              <>
                <Input
                  label="DeepInfra Base URL"
                  placeholder="https://api.deepinfra.com/v1"
                  value={draftImage.deepinfraFlux.baseUrl}
                  onChange={(e) => setDraftImage({
                    ...draftImage,
                    deepinfraFlux: { ...draftImage.deepinfraFlux, baseUrl: e.target.value },
                  })}
                />
                <Input
                  label="DeepInfra Model"
                  placeholder="black-forest-labs/FLUX-2-pro"
                  value={draftImage.deepinfraFlux.model}
                  onChange={(e) => setDraftImage({
                    ...draftImage,
                    deepinfraFlux: { ...draftImage.deepinfraFlux, model: e.target.value },
                  })}
                />
                <Input
                  label="DeepInfra API Key"
                  type="password"
                  value={draftImage.deepinfraFlux.apiKey}
                  onChange={(e) => setDraftImage({
                    ...draftImage,
                    deepinfraFlux: { ...draftImage.deepinfraFlux, apiKey: e.target.value },
                  })}
                />
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
                  FLUX-2-pro 第一張參考圖使用 input_image；FLUX-2-klein 第一張使用 input_image_1，後續圖片依序編號。
                </p>
              </>
            ) : draftImage.providerId === 'google-gemini-image' ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="secondary"
                    onClick={() => setDraftImage({
                      ...draftImage,
                      googleGeminiImage: {
                        ...draftImage.googleGeminiImage,
                        apiKey: draftLlm.provider === 'google' ? draftLlm.apiKey : draftImage.googleGeminiImage.apiKey,
                      },
                    })}
                  >
                    從 LLM Google 設定複製 API Key
                  </Button>
                </div>
                <Input
                  label="Google Gemini Base URL"
                  placeholder="https://generativelanguage.googleapis.com/v1"
                  value={draftImage.googleGeminiImage.baseUrl}
                  onChange={(e) => setDraftImage({
                    ...draftImage,
                    googleGeminiImage: { ...draftImage.googleGeminiImage, baseUrl: e.target.value },
                  })}
                />
                <Input
                  label="Google Gemini Image Model"
                  placeholder="gemini-3.1-flash-image"
                  value={draftImage.googleGeminiImage.model}
                  onChange={(e) => setDraftImage({
                    ...draftImage,
                    googleGeminiImage: { ...draftImage.googleGeminiImage, model: e.target.value },
                  })}
                />
                <Input
                  label="Google Gemini API Key"
                  type="password"
                  value={draftImage.googleGeminiImage.apiKey}
                  onChange={(e) => setDraftImage({
                    ...draftImage,
                    googleGeminiImage: { ...draftImage.googleGeminiImage, apiKey: e.target.value },
                  })}
                />
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
                  使用 Google Gemini generateContent 圖片 API。預設模型為 gemini-3.1-flash-image，支援最多 14 張參考圖。
                </p>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="secondary"
                    onClick={() => setDraftImage({
                      ...draftImage,
                      openaiCompatible: {
                        ...draftImage.openaiCompatible,
                        baseUrl: draftLlm.baseUrl,
                        apiKey: draftLlm.apiKey,
                      },
                    })}
                  >
                    從 LLM 設定複製 Base URL / API Key
                  </Button>
                </div>
                <Input
                  label="Image API Base URL"
                  placeholder="https://api.example.com/v1"
                  value={draftImage.openaiCompatible.baseUrl}
                  onChange={(e) => setDraftImage({
                    ...draftImage,
                    openaiCompatible: { ...draftImage.openaiCompatible, baseUrl: e.target.value },
                  })}
                />
                <Input
                  label="Image Model"
                  placeholder="gpt-image-1 / gemini-2.5-flash-image"
                  value={draftImage.openaiCompatible.model}
                  onChange={(e) => setDraftImage({
                    ...draftImage,
                    openaiCompatible: { ...draftImage.openaiCompatible, model: e.target.value },
                  })}
                />
                <Input
                  label="Image API Key"
                  type="password"
                  value={draftImage.openaiCompatible.apiKey}
                  onChange={(e) => setDraftImage({
                    ...draftImage,
                    openaiCompatible: { ...draftImage.openaiCompatible, apiKey: e.target.value },
                  })}
                />
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
                  圖片模型設定和 LLM 文字模型分開保存。可複製相同 Base URL / API Key，但圖片模型名稱仍獨立設定。
                </p>
              </>
            )}
          </div>
        )}

        {/* —— Inline Edit —— */}
        {activePrefsTab === 'inline' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div className="form-label">預設上下文範圍</div>
              <div className="inline-edit-radio-row">
                <label>
                  <input
                    type="radio"
                    checked={draftInline.contextMode === 'window'}
                    onChange={() => setDraftInline({ ...draftInline, contextMode: 'window' as InlineEditContextMode })}
                  />
                  前後固定字數
                </label>
                <label>
                  <input
                    type="radio"
                    checked={draftInline.contextMode === 'full'}
                    onChange={() => setDraftInline({ ...draftInline, contextMode: 'full' as InlineEditContextMode })}
                  />
                  全章
                </label>
              </div>
            </div>
            <div>
              <label className="form-label">前後字數（window 模式）</label>
              <input
                type="number"
                className="form-input"
                min={100}
                max={5000}
                step={100}
                value={draftInline.contextChars}
                onChange={(e) =>
                  setDraftInline({
                    ...draftInline,
                    contextChars: Math.max(100, Math.min(5000, parseInt(e.target.value) || 500)),
                  })
                }
                disabled={draftInline.contextMode !== 'window'}
                style={{ width: 120 }}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
              在章節編輯器中選取文字後右鍵「✨ 調整內容」會以此設定當預設值，但 Modal 內可即時切換。
            </p>
          </div>
        )}

        {/* —— Wiki 設定 —— */}
        {activePrefsTab === 'wiki' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="form-label">
                Wiki 區塊預算佔比：{Math.round(draftWiki.budgetRatio * 100)}%
              </label>
              <input
                type="range"
                min={0.1}
                max={0.5}
                step={0.05}
                value={draftWiki.budgetRatio}
                onChange={(e) => setDraftWiki({ ...draftWiki, budgetRatio: parseFloat(e.target.value) })}
                style={{ width: '100%' }}
              />
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0', lineHeight: 1.6 }}>
                Wiki 條目在每次章節生成 prompt 中可佔的 context 比例（10%–50%，預設 25%）。
              </p>
            </div>

            <div>
              <label className="form-label">連續超預算警告閾值</label>
              <input
                type="number"
                className="form-input"
                min={1}
                max={20}
                value={draftWiki.overflowWarnThreshold}
                onChange={(e) =>
                  setDraftWiki({
                    ...draftWiki,
                    overflowWarnThreshold: Math.max(1, Math.min(20, parseInt(e.target.value) || 3)),
                  })
                }
                style={{ width: 120 }}
              />
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0', lineHeight: 1.6 }}>
                當連續多次生成都超出 Wiki 預算時，建議改用 pick-pages 模式（Phase 2.5）。
              </p>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={draftWiki.enablePickPages}
                  onChange={(e) => setDraftWiki({ ...draftWiki, enablePickPages: e.target.checked })}
                />
                <span>啟用 pick-pages 模式（Phase 2.5 後可用）</span>
              </label>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0 22px', lineHeight: 1.6 }}>
                兩段式 wiki 查詢：先讓 LLM 挑選相關頁，再注入完整內容。目前以 cheap relevance filter 替代。
              </p>
            </div>

            <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
            <h4 style={{ margin: '0 0 8px' }}>Lint（Phase 2.5）</h4>

            <div>
              <label className="form-label">啟用的檢查</label>
              {[
                { k: 'brokenLink', label: 'Broken link（relatedSlugs 指向不存在頁）' },
                { k: 'orphan', label: '孤頁（未被引用、info-only）' },
                { k: 'aliasDup', label: '別名重複' },
                { k: 'summaryMismatch', label: 'Summary 章節對不上（slug ↔ chapter title）' },
                { k: 'unrecorded', label: '未登錄角色（hybrid：pre-filter + 1 LLM call）' },
                { k: 'wikiContradict', label: 'Wiki 內部矛盾（LLM，每 type 1 call）' },
                { k: 'wikiVsChapter', label: 'Wiki vs 章節（LLM，每角色 1 call）' },
              ].map(({ k, label }) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                  <input
                    type="checkbox"
                    checked={draftLint.checks[k as keyof typeof draftLint.checks]}
                    onChange={(e) => setDraftLint({
                      ...draftLint,
                      checks: { ...draftLint.checks, [k]: e.target.checked },
                    })}
                  />
                  <span style={{ fontSize: 13 }}>{label}</span>
                </label>
              ))}
            </div>

            <div>
              <label className="form-label">LLM 上限</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  單類型最多頁數
                  <input
                    type="number" className="form-input" min={1} max={100}
                    value={draftLint.maxPagesPerTypeContradict}
                    onChange={(e) => setDraftLint({
                      ...draftLint,
                      maxPagesPerTypeContradict: Math.max(1, parseInt(e.target.value) || 20),
                    })}
                    style={{ width: 80 }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  最多角色數
                  <input
                    type="number" className="form-input" min={1} max={50}
                    value={draftLint.maxCharactersVsChapter}
                    onChange={(e) => setDraftLint({
                      ...draftLint,
                      maxCharactersVsChapter: Math.max(1, parseInt(e.target.value) || 10),
                    })}
                    style={{ width: 80 }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  每角色章節數
                  <input
                    type="number" className="form-input" min={1} max={10}
                    value={draftLint.maxChapterExcerptsPerChar}
                    onChange={(e) => setDraftLint({
                      ...draftLint,
                      maxChapterExcerptsPerChar: Math.max(1, parseInt(e.target.value) || 3),
                    })}
                    style={{ width: 80 }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  未登錄候選上限
                  <input
                    type="number" className="form-input" min={1} max={100}
                    value={draftLint.maxUnrecordedCandidates}
                    onChange={(e) => setDraftLint({
                      ...draftLint,
                      maxUnrecordedCandidates: Math.max(1, parseInt(e.target.value) || 30),
                    })}
                    style={{ width: 80 }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* —— AI 提示詞 —— */}
        {activePrefsTab === 'ai-prompts' && (
          <AIPromptsTab
            draft={draftPrompts}
            setDraft={setDraftPrompts}
            activeKey={activePromptKey}
            setActiveKey={setActivePromptKey}
            viewMode={promptViewMode}
            setViewMode={setPromptViewMode}
            previewDataSource={previewDataSource}
            setPreviewDataSource={setPreviewDataSource}
          />
        )}
      </Modal>
    </>
  );
}

/* ============================================================
   AI 提示詞分頁（含 5 個 sub-tabs：對應 5 個可編輯的 prompt 設定）
   ============================================================ */
interface PromptEntry {
  key: keyof AIPromptPrefs;
  label: string;
  desc: string;
  defaultValue: string;
}

const PROMPT_ENTRIES: PromptEntry[] = [
  {
    key: 'chapterDraftsTemplate',
    label: '#1 章節骨架',
    desc: '「✨ AI 生成章節」按鈕使用。一次生成多章標題/節拍/要點（不含正文）。',
    defaultValue: DEFAULT_CHAPTER_DRAFTS_TEMPLATE,
  },
  {
    key: 'chapterContinuationRules',
    label: '#1.5 接續硬性規則',
    desc: '當章節列表已有章節時，會被嵌入「章節骨架」prompt 的接續規則區段。可留空。',
    defaultValue: DEFAULT_CHAPTER_CONTINUATION_RULES,
  },
  {
    key: 'chapterContentTemplate',
    label: '#2 章節正文',
    desc: '「✨ 生成本章」/「↩️ 重新生成」按鈕使用。生成單章完整正文。',
    defaultValue: DEFAULT_CHAPTER_CONTENT_TEMPLATE,
  },
  {
    key: 'chapterPointsTemplate',
    label: '#3 章節要點',
    desc: '章節要點 Modal 的「✨ 重新生成」按鈕使用。',
    defaultValue: DEFAULT_CHAPTER_POINTS_TEMPLATE,
  },
  {
    key: 'characterDraftsTemplate',
    label: '#3.5 角色生成',
    desc: '角色面板「✨ AI 生成角色」使用。大型角色名單/世界觀由系統注入。',
    defaultValue: DEFAULT_CHARACTER_DRAFTS_TEMPLATE,
  },
  {
    key: 'inlineAdjustTemplate',
    label: '#4 局部段落改寫',
    desc: '正文選取後右鍵「✨ 調整內容」使用。',
    defaultValue: DEFAULT_INLINE_ADJUST_TEMPLATE,
  },
  {
    key: 'comicStoryboardTemplate',
    label: '#4.5 漫畫分鏡',
    desc: '章節「轉漫畫」的生成/重新生成分鏡使用。章節正文與上一版分鏡摘要由系統注入。',
    defaultValue: DEFAULT_COMIC_STORYBOARD_TEMPLATE,
  },
  {
    key: 'wikiIngestPlanTemplate',
    label: '#5 Wiki Plan',
    desc: '章節「📚 存入 Wiki」第一階段：規劃要新增/更新/刪除哪些 wiki 頁。',
    defaultValue: DEFAULT_WIKI_INGEST_PLAN_TEMPLATE,
  },
  {
    key: 'wikiIngestCreateTemplate',
    label: '#6 Wiki Create',
    desc: 'Wiki ingest 第二階段：為新頁面生成內容。',
    defaultValue: DEFAULT_WIKI_INGEST_CREATE_TEMPLATE,
  },
  {
    key: 'wikiIngestUpdateTemplate',
    label: '#7 Wiki Update',
    desc: 'Wiki ingest 第二階段：更新既有頁面內容。',
    defaultValue: DEFAULT_WIKI_INGEST_UPDATE_TEMPLATE,
  },
  {
    key: 'wikiQueryAnswerTemplate',
    label: '#8 Wiki Query（Phase 2.5）',
    desc: 'Phase 2.5 pick-pages 查詢用，目前未啟用。',
    defaultValue: DEFAULT_WIKI_QUERY_ANSWER_TEMPLATE,
  },
  {
    key: 'lintUnrecordedVerifyTemplate',
    label: '#9 Lint Unrecorded',
    desc: 'Lint 未登錄角色 hybrid 的第二階段：把 pre-filter 候選送 LLM 驗證。',
    defaultValue: DEFAULT_LINT_UNRECORDED_VERIFY_TEMPLATE,
  },
  {
    key: 'lintWikiContradictTemplate',
    label: '#10 Lint 矛盾',
    desc: 'Lint Wiki 內部矛盾：每 page type 一次 LLM call，輸入 digest 清單。',
    defaultValue: DEFAULT_LINT_WIKI_CONTRADICT_TEMPLATE,
  },
  {
    key: 'lintWikiVsChapterTemplate',
    label: '#11 Lint vs章節',
    desc: 'Lint Wiki vs 章節：每主要角色一次 LLM call，比對 wiki 與章節敘述。',
    defaultValue: DEFAULT_LINT_WIKI_VS_CHAPTER_TEMPLATE,
  },
  {
    key: 'lintFixSuggestTemplate',
    label: '#12 Lint 修改建議',
    desc: '使用者按 ✏️ 修改 → ✨ 生成建議修改 時，召喚 LLM 改寫 wiki 頁。',
    defaultValue: DEFAULT_LINT_FIX_SUGGEST_TEMPLATE,
  },
];

export type PreviewDataSource = 'project' | 'sample';

function AIPromptsTab({
  draft, setDraft, activeKey, setActiveKey, viewMode, setViewMode,
  previewDataSource, setPreviewDataSource,
}: {
  draft: AIPromptPrefs;
  setDraft: (d: AIPromptPrefs) => void;
  activeKey: keyof AIPromptPrefs;
  setActiveKey: (k: keyof AIPromptPrefs) => void;
  viewMode: EditPreviewMode;
  setViewMode: (m: EditPreviewMode) => void;
  previewDataSource: PreviewDataSource;
  setPreviewDataSource: (s: PreviewDataSource) => void;
}) {
  const entry = PROMPT_ENTRIES.find((e) => e.key === activeKey)!;
  const value = draft[activeKey];
  const vars = PROMPT_TEMPLATE_VARS[activeKey] ?? [];
  const isPlainText = activeKey === 'chapterContinuationRules';
  const samples = PROMPT_TEMPLATE_SAMPLES[activeKey];

  // 嘗試從當前專案抓真實值；若 dataSource='project' 但沒專案 → 自動 fallback 到 sample
  const liveVars = previewDataSource === 'project'
    ? buildLivePromptVars(activeKey, draft.chapterContinuationRules)
    : null;
  const usedProjectData = liveVars !== null && previewDataSource === 'project';

  // 合併策略：真實值優先，缺漏欄位用 sample 補
  const mergedVars: Record<string, string> = {
    ...(samples ?? {}),
    ...(liveVars ?? {}),
  };

  const previewSource = isPlainText
    ? value
    : renderTemplate(value, mergedVars);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* sub-tabs */}
      <div className="prefs-subtabs">
        {PROMPT_ENTRIES.map((e) => (
          <button
            key={e.key}
            type="button"
            className={`prefs-subtab${activeKey === e.key ? ' active' : ''}`}
            onClick={() => setActiveKey(e.key)}
            title={e.desc}
          >
            {e.label}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
        {entry.desc}
      </p>

      {/* 可用變數提示 */}
      {!isPlainText && vars.length > 0 && (
        <details className="prompt-vars-hint">
          <summary>可用變數（{vars.length}）</summary>
          <table className="prompt-vars-table">
            <tbody>
              {vars.map((v) => (
                <tr key={v.var}>
                  <td><code>{`{{${v.var}}}`}</code></td>
                  <td>{v.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {/* 控制列：編輯/預覽 + 還原預設 */}
      <EditPreviewTabs
        mode={viewMode}
        onChange={setViewMode}
        extra={
          <Button
            variant="text"
            style={{ fontSize: 12, height: 24, padding: '0 8px' }}
            onClick={() => setDraft({ ...draft, [activeKey]: entry.defaultValue })}
          >
            ↺ 還原預設
          </Button>
        }
      />

      {viewMode === 'edit' ? (
        <textarea
          className="form-textarea"
          style={{
            minHeight: 280,
            fontFamily: isPlainText ? 'inherit' : '"Cascadia Code", Consolas, monospace',
            fontSize: 12,
            lineHeight: 1.6,
          }}
          value={value}
          onChange={(e) => setDraft({ ...draft, [activeKey]: e.target.value })}
          placeholder="留空則不附加..."
          spellCheck={false}
        />
      ) : (
        <>
          {!isPlainText && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <span style={{ color: 'var(--text-tertiary)' }}>變數來源：</span>
              <div className="preview-source-toggle">
                <button
                  type="button"
                  className={`preview-source-btn${previewDataSource === 'project' ? ' active' : ''}`}
                  onClick={() => setPreviewDataSource('project')}
                >
                  當前專案
                </button>
                <button
                  type="button"
                  className={`preview-source-btn${previewDataSource === 'sample' ? ' active' : ''}`}
                  onClick={() => setPreviewDataSource('sample')}
                >
                  範例資料
                </button>
              </div>
              <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                {previewDataSource === 'project'
                  ? (usedProjectData
                      ? '✓ 已代入當前專案的真實值（缺漏欄位用範例補）'
                      : '⚠ 目前沒有開啟的專案 / 章節，自動 fallback 到範例資料')
                  : '使用範例資料展示模板效果'}
              </span>
            </div>
          )}
          <div style={{
            minHeight: 280, maxHeight: 420, overflowY: 'auto',
            padding: 14, border: '1px solid var(--border)', borderRadius: 6,
            background: 'var(--bg-secondary)',
          }}>
            <MarkdownView source={previewSource} />
          </div>
        </>
      )}
    </div>
  );
}
