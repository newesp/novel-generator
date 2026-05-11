import { useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { useSettingsStore, type InlineEditContextMode, type AIPromptPrefs } from '../stores/settingsStore';
import {
  DEFAULT_CHAPTER_DRAFTS_TEMPLATE,
  DEFAULT_CHAPTER_CONTINUATION_RULES,
  DEFAULT_CHAPTER_CONTENT_TEMPLATE,
  DEFAULT_CHAPTER_POINTS_TEMPLATE,
  DEFAULT_INLINE_ADJUST_TEMPLATE,
  PROMPT_TEMPLATE_VARS,
  PROMPT_TEMPLATE_SAMPLES,
} from '../lib/prompt-defaults';
import { renderTemplate } from '../lib/prompt-template';
import { buildLivePromptVars } from '../lib/prompt-preview';
import { Button } from './common/Button';
import { Modal } from './common/Modal';
import { Input } from './common/Input';
import { EditPreviewTabs, type EditPreviewMode } from './common/EditPreviewTabs';
import { MarkdownView } from './common/MarkdownView';
import type { LLMProvider } from '../types';

/** 各 provider 的預設值，切換 provider 時自動套用（若使用者未填） */
const PROVIDER_DEFAULTS: Record<LLMProvider, { name: string; baseUrl: string; model: string }> = {
  custom: { name: 'My API', baseUrl: '', model: 'gpt-4o' },
  google: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
  },
  grok: {
    name: 'Grok (xAI)',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-2-latest',
  },
};

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  custom: '自定義（OpenAI-compatible）',
  google: 'Google Gemini',
  grok: 'Grok (xAI)',
};

/** 偏好設定 Modal 的分頁 */
type PrefsTab = 'llm' | 'inline' | 'ai-prompts';
const PREFS_TABS: { key: PrefsTab; label: string }[] = [
  { key: 'llm',        label: '🔑 LLM API' },
  { key: 'inline',     label: '✨ 選取調整' },
  { key: 'ai-prompts', label: '📜 AI 提示詞' },
];

export function Toolbar() {
  const { project } = useProjectStore();
  const { view, setView } = useUIStore();
  const { llmConfig, inlineEdit, aiPrompts, setLlmConfig, setInlineEdit, setAiPrompts } = useSettingsStore();
  const [showPrefsModal, setShowPrefsModal] = useState(false);
  const [activePrefsTab, setActivePrefsTab] = useState<PrefsTab>('llm');
  const [draftLlm, setDraftLlm] = useState(llmConfig);
  const [draftInline, setDraftInline] = useState(inlineEdit);
  const [draftPrompts, setDraftPrompts] = useState(aiPrompts);
  const [activePromptKey, setActivePromptKey] = useState<keyof AIPromptPrefs>('chapterDraftsTemplate');
  const [promptViewMode, setPromptViewMode] = useState<EditPreviewMode>('edit');
  const [previewDataSource, setPreviewDataSource] = useState<PreviewDataSource>('project');

  const goHome = () => setView('home');

  const openPrefs = () => {
    setDraftLlm(llmConfig);
    setDraftInline(inlineEdit);
    setDraftPrompts(aiPrompts);
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
        <Button variant="secondary" disabled>導出</Button>
        <Button variant="secondary" onClick={openPrefs}>⚙️ 偏好設定</Button>
      </div>

      <Modal
        open={showPrefsModal}
        onClose={() => setShowPrefsModal(false)}
        title="⚙️ 偏好設定"
        width={580}
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
                  const defs = PROVIDER_DEFAULTS[next];
                  // 切換 provider 時：若使用者的目前值是任何 provider 的預設值（或空白），就套上新預設
                  const allDefaultNames = Object.values(PROVIDER_DEFAULTS).map((d) => d.name);
                  const allDefaultModels = Object.values(PROVIDER_DEFAULTS).map((d) => d.model);
                  setDraftLlm({
                    ...draftLlm,
                    provider: next,
                    name: !draftLlm.name || allDefaultNames.includes(draftLlm.name) ? defs.name : draftLlm.name,
                    baseUrl: !draftLlm.baseUrl
                      ? defs.baseUrl
                      : next === 'custom' ? draftLlm.baseUrl : (draftLlm.baseUrl || defs.baseUrl),
                    model: !draftLlm.model || allDefaultModels.includes(draftLlm.model) ? defs.model : draftLlm.model,
                  });
                }}
              >
                {(['custom', 'google', 'grok'] as LLMProvider[]).map((p) => (
                  <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
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
              placeholder={PROVIDER_DEFAULTS[draftLlm.provider].baseUrl || 'https://api.openai.com/v1'}
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
              placeholder={PROVIDER_DEFAULTS[draftLlm.provider].model}
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
    key: 'inlineAdjustTemplate',
    label: '#4 局部段落改寫',
    desc: '正文選取後右鍵「✨ 調整內容」使用。',
    defaultValue: DEFAULT_INLINE_ADJUST_TEMPLATE,
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
