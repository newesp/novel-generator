import { useRef, useState } from 'react';
import { ArrowLeft, Archive, Search, Settings, Upload } from 'lucide-react';
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
import { isLLMProfileReferencedByActiveRun } from '../lib/multi-agent/run-manager';
import { buildLivePromptVars } from '../lib/prompt-preview';
import { storage } from '../lib/storage';
import { errorMessage } from '../lib/error-message';
import { saveJsonFile } from '../lib/file-export';
import {
  describeSettingsSnapshot,
  exportSettingsSnapshot,
  importSettingsSnapshot,
  readSettingsSnapshotFromFile,
} from '../lib/settings-backup';
import {
  applyLlmProviderDefaults,
  createLLMProfile,
  LLM_PROVIDER_DEFAULTS,
  LLM_PROVIDER_LABELS,
} from '../lib/llm-provider-defaults';
import { verifyLLMProfile } from '../lib/llm';
import { Button } from './common/Button';
import { Modal } from './common/Modal';
import { Input } from './common/Input';
import { EditPreviewTabs, type EditPreviewMode } from './common/EditPreviewTabs';
import { MarkdownView } from './common/MarkdownView';
import { BackupModal } from './BackupModal';
import { GlobalSearchModal } from './search/GlobalSearchModal';
import { BookExportModal } from './export/BookExportModal';
import type { LLMProfile, LLMProvider, MultiAgentPrefs, MultiAgentRole } from '../types';
import { validateCriticThresholds, validateCriticWeights, clampMaxRevisions } from '../stores/settingsStore';

function HelpIcon({ tooltip }: { tooltip: string }) {
  return (
    <span
      title={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.15)',
        color: 'var(--text-secondary, #9ca3af)',
        fontSize: 10,
        fontWeight: 'bold',
        cursor: 'help',
        marginLeft: 4,
      }}
    >
      ?
    </span>
  );
}

/** 偏好設定 Modal 的分頁 */
type PrefsTab = 'llm' | 'multi-agent' | 'image' | 'inline' | 'ai-prompts' | 'wiki';
const PREFS_TABS: { key: PrefsTab; label: string }[] = [
  { key: 'llm',         label: '🔑 LLM API' },
  { key: 'multi-agent', label: '🤖 Agent 設定' },
  { key: 'image',       label: '🖼 圖片生成' },
  { key: 'inline',      label: '🎛 上下文範圍' },
  { key: 'ai-prompts',  label: '📜 AI 提示詞' },
  { key: 'wiki',        label: '📚 Wiki 設定' },
];

interface ToolbarProps {
  variant?: 'classic' | 'workspace';
}

export function Toolbar({ variant = 'classic' }: ToolbarProps) {
  const { project, chapters } = useProjectStore();
  const { view, setView } = useUIStore();
  const {
    llmConfig, llmProfiles, activeProfileId, inlineEdit, aiPrompts, wikiPrefs, imageGenerationPrefs, lintPrefs, multiAgentPrefs,
    setLlmProfiles, setInlineEdit, setAiPrompts, setWikiPrefs, setImageGenerationPrefs, setLintPrefs, setMultiAgentPrefs,
  } = useSettingsStore();
  const [showPrefsModal, setShowPrefsModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [activePrefsTab, setActivePrefsTab] = useState<PrefsTab>('llm');
  const [draftProfiles, setDraftProfiles] = useState<LLMProfile[]>(llmProfiles);
  const [draftActiveId, setDraftActiveId] = useState<string>(activeProfileId);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(activeProfileId);
  const [verifyingProfile, setVerifyingProfile] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [draftLlm, setDraftLlm] = useState(llmConfig);
  const [draftInline, setDraftInline] = useState(inlineEdit);
  const [draftPrompts, setDraftPrompts] = useState(aiPrompts);
  const [draftWiki, setDraftWiki] = useState(wikiPrefs);
  const [draftImage, setDraftImage] = useState(imageGenerationPrefs);
  const [draftLint, setDraftLint] = useState(lintPrefs);
  const [draftMultiAgent, setDraftMultiAgent] = useState<MultiAgentPrefs>(multiAgentPrefs);
  const [includeApiKeysInPrefsExport, setIncludeApiKeysInPrefsExport] = useState(false);
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [prefsMsg, setPrefsMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [activePromptKey, setActivePromptKey] = useState<keyof AIPromptPrefs>('chapterDraftsTemplate');
  const [promptViewMode, setPromptViewMode] = useState<EditPreviewMode>('edit');
  const [previewDataSource, setPreviewDataSource] = useState<PreviewDataSource>('project');
  const settingsImportInputRef = useRef<HTMLInputElement>(null);

  const goHome = () => setView('home');

  const openPrefs = () => {
    const store = useSettingsStore.getState();
    setDraftProfiles(store.llmProfiles);
    setDraftActiveId(store.activeProfileId);
    setSelectedProfileId(store.activeProfileId);
    setVerifyResult(null);
    setDraftLlm(llmConfig);
    setDraftInline(inlineEdit);
    setDraftPrompts(aiPrompts);
    setDraftWiki(wikiPrefs);
    setDraftImage(imageGenerationPrefs);
    setDraftLint(lintPrefs);
    setDraftMultiAgent(store.multiAgentPrefs);
    setActivePrefsTab('llm');
    setActivePromptKey('chapterDraftsTemplate');
    setPromptViewMode('edit');
    setPreviewDataSource('project');
    setIncludeApiKeysInPrefsExport(false);
    setPrefsMsg(null);
    setShowPrefsModal(true);
  };

  const savePrefs = () => {
    const threshVal = validateCriticThresholds(
      draftMultiAgent.criticThresholds.humanReviewFloor,
      draftMultiAgent.criticThresholds.passScore,
    );
    if (!threshVal.valid) {
      setPrefsMsg({ kind: 'err', text: `儲存失敗：${threshVal.message}` });
      setActivePrefsTab('multi-agent');
      return;
    }

    const weightVal = validateCriticWeights(draftMultiAgent.criticRubricWeights);
    if (!weightVal.valid) {
      setPrefsMsg({ kind: 'err', text: `儲存失敗：${weightVal.message}` });
      setActivePrefsTab('multi-agent');
      return;
    }

    setLlmProfiles(draftProfiles, draftActiveId);
    setInlineEdit(draftInline);
    setAiPrompts(draftPrompts);
    setWikiPrefs(draftWiki);
    setImageGenerationPrefs(draftImage);
    setLintPrefs(draftLint);
    setMultiAgentPrefs(draftMultiAgent);
    setShowPrefsModal(false);
  };

  const refreshPrefsDraftsFromStore = () => {
    const next = useSettingsStore.getState();
    setDraftProfiles(next.llmProfiles);
    setDraftActiveId(next.activeProfileId);
    setSelectedProfileId(next.activeProfileId);
    setDraftLlm(next.llmConfig);
    setDraftInline(next.inlineEdit);
    setDraftPrompts(next.aiPrompts);
    setDraftWiki(next.wikiPrefs);
    setDraftImage(next.imageGenerationPrefs);
    setDraftLint(next.lintPrefs);
    setDraftMultiAgent(next.multiAgentPrefs);
  };


  const handleExportSettings = async () => {
    setPrefsBusy(true);
    setPrefsMsg(null);
    try {
      const snapshot = exportSettingsSnapshot(includeApiKeysInPrefsExport);
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const result = await saveJsonFile({
        filename: `novel-generator-settings-${ts}.json`,
        content: JSON.stringify(snapshot, null, 2),
        pickerTitle: '選擇偏好設定匯出資料夾',
      });
      if (result.status === 'cancelled') {
        setPrefsMsg({ kind: 'info', text: '已取消匯出設定' });
      } else if (result.path) {
        setPrefsMsg({ kind: 'ok', text: `已匯出設定至 ${result.path}` });
      } else {
        setPrefsMsg({ kind: 'ok', text: '已開始下載偏好設定 JSON' });
      }
    } catch (err) {
      setPrefsMsg({ kind: 'err', text: `匯出設定失敗：${errorMessage(err)}` });
    } finally {
      setPrefsBusy(false);
    }
  };

  const handleImportSettingsClick = () => settingsImportInputRef.current?.click();

  const handleImportSettingsFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPrefsBusy(true);
    setPrefsMsg(null);
    try {
      const snapshot = await readSettingsSnapshotFromFile(file);
      const description = describeSettingsSnapshot(snapshot);
      const apiKeyNotice = snapshot.includesApiKeys
        ? '\n\n此檔案包含 API Key，匯入後會覆蓋目前對應的 API Key。'
        : '\n\n此檔案不包含 API Key，匯入時會保留目前已設定的 API Key。';
      if (!confirm(`匯入偏好設定會覆蓋目前所有偏好設定草稿。\n\n${description}${apiKeyNotice}\n\n確定要繼續？`)) {
        setPrefsMsg({ kind: 'info', text: '已取消匯入設定' });
        return;
      }
      importSettingsSnapshot(snapshot);
      refreshPrefsDraftsFromStore();
      setPrefsMsg({ kind: 'ok', text: `已匯入設定：${description}` });
    } catch (err) {
      setPrefsMsg({ kind: 'err', text: `匯入設定失敗：${errorMessage(err)}` });
    } finally {
      setPrefsBusy(false);
    }
  };

  const prefsHeaderExtra = (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 10,
      flexWrap: 'wrap',
    }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>
        <input
          type="checkbox"
          checked={includeApiKeysInPrefsExport}
          onChange={(e) => setIncludeApiKeysInPrefsExport(e.target.checked)}
          disabled={prefsBusy}
        />
        <span>匯出時包含 API Key</span>
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={handleExportSettings} disabled={prefsBusy}>
          匯出設定
        </Button>
        <Button variant="secondary" onClick={handleImportSettingsClick} disabled={prefsBusy}>
          匯入設定
        </Button>
        <input
          ref={settingsImportInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={handleImportSettingsFile}
        />
      </div>
    </div>
  );

  return (
    <>
      <div className={`toolbar${variant === 'workspace' ? ' v2-workspace-toolbar' : ''}`}>
        {variant === 'classic' ? (
          <span
            className="toolbar-logo"
            style={{ cursor: 'pointer' }}
            onClick={goHome}
            title="返回書庫"
          >
            📖 小說產生器
          </span>
        ) : (
          <button type="button" className="v2-breadcrumb-back" onClick={goHome} title="返回書庫">
            <ArrowLeft size={16} />
            <span>書庫</span>
          </button>
        )}

        {view === 'editor' && (
          <>
            {variant === 'classic' && (
              <Button variant="text" onClick={goHome} style={{ fontSize: 12, height: 28 }}>
                ← 書庫
              </Button>
            )}
            {project && (
              <span className={variant === 'workspace' ? 'v2-project-title' : undefined} style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {project.title}
              </span>
            )}
          </>
        )}

        <div className="toolbar-spacer" />
        {view === 'editor' && project && storage.search && (
          <Button variant="secondary" onClick={() => setShowSearchModal(true)}>
            {variant === 'workspace' && <Search size={15} />}
            {variant === 'workspace' ? '全文搜尋' : '🔎 全文搜尋'}
          </Button>
        )}
        {view === 'editor' && project && (
          <Button variant="secondary" onClick={() => setShowExportModal(true)}>
            {variant === 'workspace' && <Upload size={15} />}
            {variant === 'workspace' ? '匯出' : '📤 匯出'}
          </Button>
        )}
        <Button variant="secondary" onClick={() => setShowBackupModal(true)}>
          {variant === 'workspace' && <Archive size={15} />}
          {variant === 'workspace' ? '備份' : '💾 備份'}
        </Button>
        <Button variant="secondary" onClick={openPrefs}>
          {variant === 'workspace' && <Settings size={15} />}
          {variant === 'workspace' ? '偏好設定' : '⚙️ 偏好設定'}
        </Button>
      </div>

      <BackupModal open={showBackupModal} onClose={() => setShowBackupModal(false)} />
      <GlobalSearchModal open={showSearchModal} onClose={() => setShowSearchModal(false)} />
      {project && (
        <BookExportModal
          open={showExportModal}
          onClose={() => setShowExportModal(false)}
          project={project}
          chapters={chapters}
        />
      )}

      <Modal
        open={showPrefsModal}
        onClose={() => setShowPrefsModal(false)}
        title="⚙️ 偏好設定"
        headerExtra={prefsHeaderExtra}
        width="70vw"
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
        {prefsMsg && (
          <div style={{
            margin: '0 0 12px',
            fontSize: 12,
            color:
              prefsMsg.kind === 'ok' ? '#22c55e' :
              prefsMsg.kind === 'err' ? '#f87171' :
              'var(--text-secondary)',
          }}>
            {prefsMsg.text}
          </div>
        )}

        {activePrefsTab === 'llm' && (() => {
          const selectedProfile =
            draftProfiles.find((p) => p.id === selectedProfileId) || draftProfiles[0];

          const updateSelectedProfile = (patch: Partial<LLMProfile>) => {
            if (!selectedProfile) return;
            const updated = { ...selectedProfile, ...patch };
            setDraftProfiles(draftProfiles.map((p) => (p.id === selectedProfile.id ? updated : p)));
          };

          const handleAddProfile = () => {
            const newProf = createLLMProfile('custom', { name: `API Profile ${draftProfiles.length + 1}` });
            setDraftProfiles([...draftProfiles, newProf]);
            setSelectedProfileId(newProf.id);
            setVerifyResult(null);
          };

          const handleDeleteProfile = async () => {
            if (draftProfiles.length <= 1 || !selectedProfile) return;
            const isLocked = await isLLMProfileReferencedByActiveRun(selectedProfile.id);
            if (isLocked) {
              alert(`Profile「${selectedProfile.name}」已被未完成的高品質 Multi-Agent 生成 Run 引用，在 Run 結束前不可刪除。`);
              return;
            }
            if (!confirm(`確定要刪除 Profile「${selectedProfile.name}」？`)) return;
            const nextProfiles = draftProfiles.filter((p) => p.id !== selectedProfile.id);
            setDraftProfiles(nextProfiles);
            const nextSelId = nextProfiles[0].id;
            setSelectedProfileId(nextSelId);
            if (draftActiveId === selectedProfile.id) {
              setDraftActiveId(nextSelId);
            }
            setVerifyResult(null);
          };

          const handleSetDefault = () => {
            if (selectedProfile) {
              setDraftActiveId(selectedProfile.id);
            }
          };

          const handleVerify = async () => {
            if (!selectedProfile) return;
            setVerifyingProfile(true);
            setVerifyResult(null);
            try {
              const res = await verifyLLMProfile(selectedProfile);
              setVerifyResult({ ok: res.ok, message: res.message });
            } catch (err) {
              setVerifyResult({ ok: false, message: `驗證失敗：${errorMessage(err)}` });
            } finally {
              setVerifyingProfile(false);
            }
          };

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Profile Selector Row */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="form-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  LLM 連線設定檔 (Connection Profile) 選擇與管理
                  <HelpIcon tooltip="管理多個 LLM API 連線與模型設定檔，可針對不同 Agent 角色指定專屬 Profile。" />
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    className="form-input"
                    style={{ flex: 1 }}
                    value={selectedProfileId}
                    onChange={(e) => {
                      setSelectedProfileId(e.target.value);
                      setVerifyResult(null);
                    }}
                  >
                    {draftProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({LLM_PROVIDER_LABELS[p.provider]}){p.id === draftActiveId ? ' [★預設]' : ''}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="secondary" onClick={handleAddProfile}>
                    + 新增 Profile
                  </Button>
                </div>
              </div>

              {/* Profile Action Bar */}
              {selectedProfile && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-tertiary, #1f2937)', padding: '8px 12px', borderRadius: 6 }}>
                  <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>目前編輯：<strong>{selectedProfile.name}</strong></span>
                    {selectedProfile.id === draftActiveId ? (
                      <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--accent-primary, #3b82f6)', color: '#fff', borderRadius: 4 }}>
                        預設 / 使用中
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary, #9ca3af)' }}>
                        非預設
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {selectedProfile.id !== draftActiveId && (
                      <Button size="sm" variant="secondary" onClick={handleSetDefault}>
                        設為預設 Profile
                      </Button>
                    )}
                    {draftProfiles.length > 1 && (
                      <Button size="sm" variant="secondary" onClick={handleDeleteProfile}>
                        刪除
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Selected Profile Edit Form */}
              {selectedProfile && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label className="form-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
                      服務提供商 (Provider)
                      <HelpIcon tooltip="選擇 LLM 服務提供者，如 Google Gemini、Grok、Anthropic 或 OpenAI 相容 API。" />
                    </label>
                    <select
                      className="form-input"
                      value={selectedProfile.provider}
                      onChange={(e) => {
                        const nextProvider = e.target.value as LLMProvider;
                        updateSelectedProfile(applyLlmProviderDefaults(selectedProfile, nextProvider));
                      }}
                    >
                      {(['custom', 'google', 'grok', 'anthropic'] as LLMProvider[]).map((p) => (
                        <option key={p} value={p}>{LLM_PROVIDER_LABELS[p]}</option>
                      ))}
                    </select>
                  </div>

                  <Input
                    label="Profile 顯示名稱"
                    value={selectedProfile.name}
                    onChange={(e) => updateSelectedProfile({ name: e.target.value })}
                  />

                  <Input
                    label={
                      selectedProfile.provider === 'custom'
                        ? 'API 端點 (Base URL)'
                        : 'API 端點 (Base URL，選填)'
                    }
                    placeholder={LLM_PROVIDER_DEFAULTS[selectedProfile.provider].baseUrl || 'https://api.openai.com/v1'}
                    value={selectedProfile.baseUrl}
                    onChange={(e) => updateSelectedProfile({ baseUrl: e.target.value })}
                  />

                  <Input
                    label="API Key"
                    type="password"
                    value={selectedProfile.apiKey}
                    onChange={(e) => updateSelectedProfile({ apiKey: e.target.value })}
                  />

                  <Input
                    label="模型名稱"
                    placeholder={LLM_PROVIDER_DEFAULTS[selectedProfile.provider].model}
                    value={selectedProfile.model}
                    onChange={(e) => updateSelectedProfile({ model: e.target.value })}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <Input
                      label={
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          發散度 (Temperature 0.0–2.0)
                          <HelpIcon tooltip="控制 LLM 輸出的隨機與創造性。數值越低（如 0.2）輸出越精確穩定；數值越高（如 0.8）輸出越具創造性與多樣性。" />
                        </span>
                      }
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={String(selectedProfile.temperature ?? 0.7)}
                      onChange={(e) => updateSelectedProfile({ temperature: Math.max(0, Math.min(2, Number(e.target.value) || 0.7)) })}
                    />
                    <Input
                      label={
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          最大輸出長度 (Max Tokens)
                          <HelpIcon tooltip="限制單次 LLM 生成回應的最大 Token 數量上限（1 Token 約為 0.75 個英文字或 0.5 個中文字）。" />
                        </span>
                      }
                      type="number"
                      step="256"
                      min="1"
                      max="128000"
                      value={String(selectedProfile.maxTokens ?? 4096)}
                      onChange={(e) => updateSelectedProfile({ maxTokens: Math.max(1, Number(e.target.value) || 4096) })}
                    />
                    <Input
                      label={
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          連線逾時時間 (Timeout 秒數)
                          <HelpIcon tooltip="等待 LLM API 回傳回應的最大秒數上限。超過此時間若未獲得回應將視為請求逾時。" />
                        </span>
                      }
                      type="number"
                      step="10"
                      min="30"
                      max="3600"
                      value={String(selectedProfile.timeoutSec ?? 120)}
                      onChange={(e) => updateSelectedProfile({ timeoutSec: Math.max(30, Math.min(3600, Number(e.target.value) || 120)) })}
                    />
                  </div>

                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
                    {selectedProfile.provider === 'google'
                      ? '從 Google AI Studio 取得 API Key。常用模型：gemini-2.0-flash、gemini-1.5-pro、gemini-1.5-flash。'
                      : selectedProfile.provider === 'grok'
                      ? '從 console.x.ai 取得 API Key。常用模型：grok-2-latest、grok-2-1212、grok-beta。Grok 走 OpenAI-compatible 介面。'
                      : selectedProfile.provider === 'anthropic'
                      ? '從 console.anthropic.com 取得 API Key。常用模型：claude-3-5-sonnet-20241022、claude-3-5-haiku-20241022、claude-3-opus-20240229。'
                      : '支援 OpenAI-compatible API（OpenAI、NVIDIA、本機 Ollama 等）。'}
                  </p>

                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={verifyingProfile}
                      onClick={handleVerify}
                    >
                      {verifyingProfile ? '連線測試中...' : '🔌 測試與驗證此 Profile 連線'}
                    </Button>
                    {verifyResult && (
                      <div
                        style={{
                          padding: '8px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          lineHeight: 1.5,
                          background: verifyResult.ok ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: verifyResult.ok ? '#4ade80' : '#f87171',
                          border: `1px solid ${verifyResult.ok ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                        }}
                      >
                        {verifyResult.message}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* —— Multi-Agent 策略 —— */}
        {activePrefsTab === 'multi-agent' && (() => {
          const roles: { key: MultiAgentRole; label: string; desc: string; accentColor: string }[] = [
            { key: 'planner', label: 'Planner (大綱規劃 Agent)', desc: '根據章節節拍、要點、上下文與知識資料產生細綱', accentColor: '#3b82f6' },
            { key: 'writer', label: 'Writer (初稿寫作 Agent)', desc: '依核准的細綱撰寫第一份候選草稿', accentColor: '#10b981' },
            { key: 'critic', label: 'Critic (品質評審 Agent)', desc: '依 Rubric 評分、判定重大缺陷並給出修訂要求', accentColor: '#f59e0b' },
            { key: 'editor', label: 'Editor (潤色修訂 Agent)', desc: '依候選草稿與 Critic feedback 進行修訂', accentColor: '#8b5cf6' },
          ];

          const totalWeight = Object.values(draftMultiAgent.criticRubricWeights).reduce((sum, v) => sum + (Number(v) || 0), 0);
          const isWeightValid = totalWeight === 100 && Object.values(draftMultiAgent.criticRubricWeights).every((v) => typeof v === 'number' && v >= 0);
          const isThreshValid = validateCriticThresholds(draftMultiAgent.criticThresholds.humanReviewFloor, draftMultiAgent.criticThresholds.passScore).valid;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Section 1: Agent Roles Configuration */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  🤖 Agent 角色與 Connection Profiles 設定
                </h4>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
                  為四個專責 Agent 指定預設 Connection Profile 或特定模型參數。未指定時預設使用系統啟用中 Profile。
                </p>

                {roles.map(({ key: roleKey, label, desc, accentColor }) => {
                  const cfg = draftMultiAgent.agents[roleKey];
                  const updateRole = (patch: Partial<typeof cfg>) => {
                    setDraftMultiAgent({
                      ...draftMultiAgent,
                      agents: {
                        ...draftMultiAgent.agents,
                        [roleKey]: { ...cfg, ...patch },
                      },
                    });
                  };

                  return (
                    <div
                      key={roleKey}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 8,
                        border: '1px solid var(--border-color, #374151)',
                        borderLeft: `4px solid ${accentColor}`,
                        background: 'var(--bg-tertiary, #1f2937)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{label}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{desc}</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                        <div>
                          <label className="form-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
                            指定 Profile
                            <HelpIcon tooltip="為此 Agent 角色指定專屬的 LLM 連線設定檔。未指定時預設使用系統啟用中 Profile。" />
                          </label>
                          <select
                            className="form-input"
                            value={cfg.profileId || ''}
                            onChange={(e) => updateRole({ profileId: e.target.value || null })}
                          >
                            <option value="">(使用預設 Profile)</option>
                            {draftProfiles.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({LLM_PROVIDER_LABELS[p.provider]})
                              </option>
                            ))}
                          </select>
                        </div>
                        <Input
                          label={
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                              模型覆寫 (選填)
                              <HelpIcon tooltip="為此 Agent 覆寫特定模型名稱（如 gpt-4o 或 gemini-2.0-flash）。空白時使用 Profile 預設模型。" />
                            </span>
                          }
                          placeholder="跟隨 Profile 預設"
                          value={cfg.modelOverride || ''}
                          onChange={(e) => updateRole({ modelOverride: e.target.value || undefined })}
                        />
                        <Input
                          label={
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                              發散度 (Temperature)
                              <HelpIcon tooltip="為此 Agent 覆寫特定的 Temperature 隨機度（0.0–2.0）。空白時跟隨 Profile 預設值。" />
                            </span>
                          }
                          type="number"
                          step="0.1"
                          min="0"
                          max="2"
                          placeholder="跟隨 Profile"
                          value={cfg.temperatureOverride !== undefined ? String(cfg.temperatureOverride) : ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateRole({ temperatureOverride: val !== '' ? Number(val) : undefined });
                          }}
                        />
                        <Input
                          label={
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                              最大長度 (Max Tokens)
                              <HelpIcon tooltip="為此 Agent 覆寫單次回應最大 Token 上限。空白時跟隨 Profile 預設值。" />
                            </span>
                          }
                          type="number"
                          step="256"
                          placeholder="跟隨 Profile"
                          value={cfg.maxTokensOverride !== undefined ? String(cfg.maxTokensOverride) : ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateRole({ maxTokensOverride: val !== '' ? Number(val) : undefined });
                          }}
                        />
                      </div>

                      <div>
                        <label className="form-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
                          角色指引 (Role Guidance)
                          <HelpIcon tooltip="自訂此 Agent 專屬的行為指引與補充指導語。App 會自動為其注入系統契約與結構規範。" />
                        </label>
                        <textarea
                          className="form-input"
                          rows={2}
                          style={{ width: '100%', resize: 'vertical' }}
                          value={cfg.roleGuidance}
                          onChange={(e) => updateRole({ roleGuidance: e.target.value })}
                        />
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '4px 0 0 0' }}>
                          ℹ️ 固定系統契約 (System Contract) 與結構化 Schema 由 App 自動追加，不可在此處編輯。
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Section 2: Revisions & Thresholds */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  ⚙️ 修訂上限與 Critic 門檻
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <Input
                    label={
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        最大 Editor 修訂次數 (1–5)
                        <HelpIcon tooltip="當 Critic 審核未達自動通過標準時，允許 Editor 進行自動針對性修訂的最大次數上限。" />
                      </span>
                    }
                    type="number"
                    min="1"
                    max="5"
                    value={String(draftMultiAgent.maxRevisions)}
                    onChange={(e) =>
                      setDraftMultiAgent({
                        ...draftMultiAgent,
                        maxRevisions: clampMaxRevisions(Number(e.target.value)),
                      })
                    }
                  />
                  <Input
                    label={
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        人工審核門檻 (humanReviewFloor)
                        <HelpIcon tooltip="當 Critic 評分介於此門檻與通過門檻之間時，會暫停自動流程並進入人工審核決策。" />
                      </span>
                    }
                    type="number"
                    min="0"
                    max="100"
                    value={String(draftMultiAgent.criticThresholds.humanReviewFloor)}
                    onChange={(e) =>
                      setDraftMultiAgent({
                        ...draftMultiAgent,
                        criticThresholds: {
                          ...draftMultiAgent.criticThresholds,
                          humanReviewFloor: Number(e.target.value) || 0,
                        },
                      })
                    }
                  />
                  <Input
                    label={
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        自動通過門檻 (passScore)
                        <HelpIcon tooltip="當 Critic 總分高於或等於此分數且無重大缺陷時，會自動通過並採用正文。" />
                      </span>
                    }
                    type="number"
                    min="0"
                    max="100"
                    value={String(draftMultiAgent.criticThresholds.passScore)}
                    onChange={(e) =>
                      setDraftMultiAgent({
                        ...draftMultiAgent,
                        criticThresholds: {
                          ...draftMultiAgent.criticThresholds,
                          passScore: Number(e.target.value) || 0,
                        },
                      })
                    }
                  />
                </div>
                {!isThreshValid && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--accent-red, #ff4d4f)' }}>
                    ⚠️ 門檻無效：必須符合 0 ≤ 人工審核門檻 &lt; 自動通過門檻 ≤ 100。
                  </p>
                )}
              </div>

              {/* Section 3: Critic Six-Dimension Rubric Weights */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    📊 Critic 六維度評分配分
                  </h4>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: isWeightValid ? 'var(--accent-green, #52c41a)' : 'var(--accent-red, #ff4d4f)',
                    }}
                  >
                    配分總和: {totalWeight} / 100
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <Input
                    label="1. 指令與章節目標 (預設 20)"
                    type="number"
                    min="0"
                    max="100"
                    value={String(draftMultiAgent.criticRubricWeights.instructionAndBeat)}
                    onChange={(e) =>
                      setDraftMultiAgent({
                        ...draftMultiAgent,
                        criticRubricWeights: {
                          ...draftMultiAgent.criticRubricWeights,
                          instructionAndBeat: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                  />
                  <Input
                    label="2. 劇情邏輯與因果 (預設 20)"
                    type="number"
                    min="0"
                    max="100"
                    value={String(draftMultiAgent.criticRubricWeights.plotLogic)}
                    onChange={(e) =>
                      setDraftMultiAgent({
                        ...draftMultiAgent,
                        criticRubricWeights: {
                          ...draftMultiAgent.criticRubricWeights,
                          plotLogic: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                  />
                  <Input
                    label="3. 角色一致性與成長 (預設 20)"
                    type="number"
                    min="0"
                    max="100"
                    value={String(draftMultiAgent.criticRubricWeights.characterConsistency)}
                    onChange={(e) =>
                      setDraftMultiAgent({
                        ...draftMultiAgent,
                        criticRubricWeights: {
                          ...draftMultiAgent.criticRubricWeights,
                          characterConsistency: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                  />
                  <Input
                    label="4. 前文與世界觀連貫 (預設 15)"
                    type="number"
                    min="0"
                    max="100"
                    value={String(draftMultiAgent.criticRubricWeights.contextAndWorld)}
                    onChange={(e) =>
                      setDraftMultiAgent({
                        ...draftMultiAgent,
                        criticRubricWeights: {
                          ...draftMultiAgent.criticRubricWeights,
                          contextAndWorld: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                  />
                  <Input
                    label="5. 文風與敘事品質 (預設 15)"
                    type="number"
                    min="0"
                    max="100"
                    value={String(draftMultiAgent.criticRubricWeights.styleAndQuality)}
                    onChange={(e) =>
                      setDraftMultiAgent({
                        ...draftMultiAgent,
                        criticRubricWeights: {
                          ...draftMultiAgent.criticRubricWeights,
                          styleAndQuality: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                  />
                  <Input
                    label="6. 節奏結構與伏筆 (預設 10)"
                    type="number"
                    min="0"
                    max="100"
                    value={String(draftMultiAgent.criticRubricWeights.pacingAndStructure)}
                    onChange={(e) =>
                      setDraftMultiAgent({
                        ...draftMultiAgent,
                        criticRubricWeights: {
                          ...draftMultiAgent.criticRubricWeights,
                          pacingAndStructure: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                  />
                </div>
                {!isWeightValid && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--accent-red, #ff4d4f)' }}>
                    ⚠️ 配分無效：所有數值必須為非負數且總和必須剛好等於 100。
                  </p>
                )}
              </div>

              {/* Section 4: Cost Estimation & Token Display */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  💰 Token 與成本顯示
                </h4>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={draftMultiAgent.costEstimate.showTokenAndCost}
                    onChange={(e) =>
                      setDraftMultiAgent({
                        ...draftMultiAgent,
                        costEstimate: {
                          ...draftMultiAgent.costEstimate,
                          showTokenAndCost: e.target.checked,
                        },
                      })
                    }
                  />
                  <span>估算、彙總及顯示 Token 與成本預估</span>
                </label>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
                  ℹ️ 關閉顯示不影響 Provider 實際回傳之 Token Usage 保存至執行軌跡。
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 4 }}>
                  <Input
                    label="每百萬 Input Token 單價"
                    type="number"
                    step="0.01"
                    min="0"
                    value={String(draftMultiAgent.costEstimate.inputCostPerMillion)}
                    onChange={(e) =>
                      setDraftMultiAgent({
                        ...draftMultiAgent,
                        costEstimate: {
                          ...draftMultiAgent.costEstimate,
                          inputCostPerMillion: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                  />
                  <Input
                    label="每百萬 Output Token 單價"
                    type="number"
                    step="0.01"
                    min="0"
                    value={String(draftMultiAgent.costEstimate.outputCostPerMillion)}
                    onChange={(e) =>
                      setDraftMultiAgent({
                        ...draftMultiAgent,
                        costEstimate: {
                          ...draftMultiAgent.costEstimate,
                          outputCostPerMillion: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                  />
                  <Input
                    label="顯示幣別"
                    value={draftMultiAgent.costEstimate.currency}
                    onChange={(e) =>
                      setDraftMultiAgent({
                        ...draftMultiAgent,
                        costEstimate: {
                          ...draftMultiAgent.costEstimate,
                          currency: e.target.value.toUpperCase() || 'USD',
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          );
        })()}


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

        {/* —— 上下文範圍 —— */}
        {activePrefsTab === 'inline' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div className="form-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
                預設上下文範圍
                <HelpIcon tooltip="在章節編輯器中選取文字進行「調整內容」時，提供給 LLM 作為參考參考內容的周圍上下文範圍模式。" />
              </div>
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
              <label className="form-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
                前後字數 (Window 模式)
                <HelpIcon tooltip="當選擇 Window 模式時，在被選取的段落前後截取作為上下文參考的固定字數長度。" />
              </label>
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    單類型最多頁數
                    <HelpIcon tooltip="進行 Wiki 內部矛盾檢查時，同一類型（如人物、設定、地理）最多抽取的 Wiki 頁數上限，防止超出 LLM 上下文與 Token 預算。" />
                  </span>
                  <input
                    type="number" className="form-input" min={1} max={100}
                    value={draftLint.maxPagesPerTypeContradict}
                    onChange={(e) => setDraftLint({
                      ...draftLint,
                      maxPagesPerTypeContradict: Math.max(1, parseInt(e.target.value) || 20),
                    })}
                    style={{ width: 90 }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    最多角色數
                    <HelpIcon tooltip="進行 Wiki 與章節連貫性檢查時，最多同時進行比對與檢查的核心角色數量上限。" />
                  </span>
                  <input
                    type="number" className="form-input" min={1} max={50}
                    value={draftLint.maxCharactersVsChapter}
                    onChange={(e) => setDraftLint({
                      ...draftLint,
                      maxCharactersVsChapter: Math.max(1, parseInt(e.target.value) || 10),
                    })}
                    style={{ width: 90 }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    每角色章節數
                    <HelpIcon tooltip="檢查每個角色的章節連貫性時，為該角色抽取的最近最新章節內文摘要數量上限。" />
                  </span>
                  <input
                    type="number" className="form-input" min={1} max={10}
                    value={draftLint.maxChapterExcerptsPerChar}
                    onChange={(e) => setDraftLint({
                      ...draftLint,
                      maxChapterExcerptsPerChar: Math.max(1, parseInt(e.target.value) || 3),
                    })}
                    style={{ width: 90 }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    未登錄候選上限
                    <HelpIcon tooltip="掃描未登錄角色與專有名詞時，Pre-filter 預先篩選並送交 LLM 驗證的最多候選名稱數量。" />
                  </span>
                  <input
                    type="number" className="form-input" min={1} max={100}
                    value={draftLint.maxUnrecordedCandidates}
                    onChange={(e) => setDraftLint({
                      ...draftLint,
                      maxUnrecordedCandidates: Math.max(1, parseInt(e.target.value) || 30),
                    })}
                    style={{ width: 90 }}
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
