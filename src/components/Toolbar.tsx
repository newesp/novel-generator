import { useEffect, useRef, useState } from 'react';
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
import { GlobalAgentStatus } from './GlobalAgentStatus';
import { BookExportModal } from './export/BookExportModal';
import type { LLMProfile, LLMProvider, MultiAgentPrefs, MultiAgentRole } from '../types';
import {
  validateCriticThresholds,
  validateCriticWeights,
  clampMaxRevisions,
  getBuiltInAIPrompts,
} from '../stores/settingsStore';

import {
  t,
  setDocumentLocale,
  type GeneralPrefs,
  type InterfaceLocale,
  type WritingLanguage,
} from '../lib/language-policy';

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
type PrefsTab = 'general' | 'llm' | 'multi-agent' | 'image' | 'inline' | 'ai-prompts' | 'wiki';
const PREFS_TABS: { key: PrefsTab; labelKey: string; fallbackLabel: string }[] = [
  { key: 'general',     labelKey: 'prefs.tabGeneral', fallbackLabel: '🌐 一般 / General' },
  { key: 'llm',         labelKey: 'prefs.tabLlm',     fallbackLabel: '🔑 LLM API' },
  { key: 'multi-agent', labelKey: 'prefs.tabAgent',   fallbackLabel: '🤖 Agent 設定' },
  { key: 'image',       labelKey: 'prefs.tabImage',   fallbackLabel: '🖼 圖片生成' },
  { key: 'inline',      labelKey: 'prefs.tabInline',  fallbackLabel: '🎛 上下文範圍' },
  { key: 'ai-prompts',  labelKey: 'prefs.tabPrompts', fallbackLabel: '📜 AI 提示詞' },
  { key: 'wiki',        labelKey: 'prefs.tabWiki',    fallbackLabel: '📚 Wiki 設定' },
];

interface ToolbarProps {
  variant?: 'classic' | 'workspace';
}

export function Toolbar({ variant = 'classic' }: ToolbarProps) {
  const { project, chapters } = useProjectStore();
  const { view, setView, settingsFocusTab, settingsFocusVersion } = useUIStore();
  const {
    generalPrefs, llmConfig, llmProfiles, activeProfileId, inlineEdit, aiPrompts, wikiPrefs, imageGenerationPrefs, lintPrefs, multiAgentPrefs,
    setGeneralPrefs, setLlmProfiles, setInlineEdit, setAiPrompts, setWikiPrefs, setImageGenerationPrefs, setLintPrefs, setMultiAgentPrefs,
  } = useSettingsStore();
  const [showPrefsModal, setShowPrefsModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [activePrefsTab, setActivePrefsTab] = useState<PrefsTab>('general');
  const [draftGeneral, setDraftGeneral] = useState<GeneralPrefs>(generalPrefs);
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

  const openPrefs = (initialTab: PrefsTab = 'general') => {
    const store = useSettingsStore.getState();
    setDraftGeneral(store.generalPrefs);
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
    setActivePrefsTab(initialTab);
    setActivePromptKey('chapterDraftsTemplate');
    setPromptViewMode('edit');
    setPreviewDataSource('project');
    setIncludeApiKeysInPrefsExport(false);
    setPrefsMsg(null);
    setShowPrefsModal(true);
  };

  useEffect(() => {
    if (settingsFocusVersion > 0) openPrefs(settingsFocusTab);
  }, [settingsFocusTab, settingsFocusVersion]);

  const savePrefs = () => {
    const threshVal = validateCriticThresholds(
      draftMultiAgent.criticThresholds.humanReviewFloor,
      draftMultiAgent.criticThresholds.passScore,
      generalPrefs.interfaceLocale,
    );
    if (!threshVal.valid) {
      setPrefsMsg({ kind: 'err', text: t('prefs.saveFailed', { message: threshVal.message ?? '' }, generalPrefs.interfaceLocale) });
      setActivePrefsTab('multi-agent');
      return;
    }

    const weightVal = validateCriticWeights(draftMultiAgent.criticRubricWeights, generalPrefs.interfaceLocale);
    if (!weightVal.valid) {
      setPrefsMsg({ kind: 'err', text: t('prefs.saveFailed', { message: weightVal.message ?? '' }, generalPrefs.interfaceLocale) });
      setActivePrefsTab('multi-agent');
      return;
    }

    setGeneralPrefs(draftGeneral);
    setDocumentLocale(draftGeneral.interfaceLocale, t('common.appTitle', undefined, draftGeneral.interfaceLocale));
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
    setDraftGeneral(next.generalPrefs);
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
        pickerTitle: t('prefs.pickerTitle', undefined, generalPrefs.interfaceLocale),
      });
      if (result.status === 'cancelled') {
        setPrefsMsg({ kind: 'info', text: t('prefs.exportCancelled', undefined, generalPrefs.interfaceLocale) });
      } else if (result.path) {
        setPrefsMsg({ kind: 'ok', text: t('prefs.exportPath', { path: result.path }, generalPrefs.interfaceLocale) });
      } else {
        setPrefsMsg({ kind: 'ok', text: t('prefs.exportDownload', undefined, generalPrefs.interfaceLocale) });
      }
    } catch (err) {
      setPrefsMsg({ kind: 'err', text: t('prefs.exportFailed', { error: errorMessage(err) }, generalPrefs.interfaceLocale) });
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
      const { generalPrefs: { interfaceLocale } } = useSettingsStore.getState();
      const snapshot = await readSettingsSnapshotFromFile(file, interfaceLocale);
      const description = describeSettingsSnapshot(snapshot, interfaceLocale);
      const apiKeyNotice = snapshot.includesApiKeys
        ? t('prefs.importWithKeysNotice', undefined, interfaceLocale)
        : t('prefs.importWithoutKeysNotice', undefined, interfaceLocale);
      if (!confirm(t('prefs.importConfirm', { description, apiKeyNotice }, interfaceLocale))) {
        setPrefsMsg({ kind: 'info', text: t('prefs.importCancelled', undefined, interfaceLocale) });
        return;
      }
      importSettingsSnapshot(snapshot, interfaceLocale);
      refreshPrefsDraftsFromStore();
      setPrefsMsg({ kind: 'ok', text: t('prefs.importSuccess', { description }, interfaceLocale) });
    } catch (err) {
      setPrefsMsg({ kind: 'err', text: t('prefs.importFailed', { error: errorMessage(err) }, generalPrefs.interfaceLocale) });
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
        <span>{t('prefs.includeApiKeys', undefined, generalPrefs.interfaceLocale)}</span>
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={handleExportSettings} disabled={prefsBusy}>
          {t('prefs.exportSettings', undefined, generalPrefs.interfaceLocale)}
        </Button>
        <Button variant="secondary" onClick={handleImportSettingsClick} disabled={prefsBusy}>
          {t('prefs.importSettings', undefined, generalPrefs.interfaceLocale)}
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
            title={t('toolbar.backToHome', undefined, generalPrefs.interfaceLocale)}
          >
            📖 {t('common.appTitle', undefined, generalPrefs.interfaceLocale)}
          </span>
        ) : (
          <button type="button" className="v2-breadcrumb-back" onClick={goHome} title={t('toolbar.backToHome', undefined, generalPrefs.interfaceLocale)}>
            <ArrowLeft size={16} />
            <span>{t('toolbar.library', undefined, generalPrefs.interfaceLocale)}</span>
          </button>
        )}

        {view === 'editor' && (
          <>
            {variant === 'classic' && (
              <Button variant="text" onClick={goHome} style={{ fontSize: 12, height: 28 }}>
                ← {t('toolbar.library', undefined, generalPrefs.interfaceLocale)}
              </Button>
            )}
            {project && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={variant === 'workspace' ? 'v2-project-title' : undefined} style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {project.title}
                </span>
                <span style={{
                  fontSize: 10, padding: '2px 4px', borderRadius: 4,
                  background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)',
                  userSelect: 'none', border: '1px solid var(--border)'
                }} title={t('home.writingLanguageHelp', undefined, generalPrefs.interfaceLocale)}>
                  {project.writingLanguage === 'en'
                    ? t('toolbar.languageEnShort', undefined, generalPrefs.interfaceLocale)
                    : t('toolbar.languageZhShort', undefined, generalPrefs.interfaceLocale)}
                </span>
              </div>
            )}
          </>
        )}

        <div className="toolbar-spacer" />
        {view === 'editor' && project && <GlobalAgentStatus />}
        {view === 'editor' && project && storage.search && (
          <Button variant="secondary" onClick={() => setShowSearchModal(true)}>
            {variant === 'workspace' && <Search size={15} />}
            {variant === 'workspace'
              ? t('toolbar.search', undefined, generalPrefs.interfaceLocale)
              : `🔎 ${t('toolbar.search', undefined, generalPrefs.interfaceLocale)}`}
          </Button>
        )}
        {view === 'editor' && project && (
          <Button variant="secondary" onClick={() => setShowExportModal(true)}>
            {variant === 'workspace' && <Upload size={15} />}
            {variant === 'workspace'
              ? t('common.export', undefined, generalPrefs.interfaceLocale)
              : `📤 ${t('common.export', undefined, generalPrefs.interfaceLocale)}`}
          </Button>
        )}
        <Button variant="secondary" onClick={() => setShowBackupModal(true)}>
          {variant === 'workspace' && <Archive size={15} />}
          {variant === 'workspace' ? t('toolbar.backupShort', undefined, generalPrefs.interfaceLocale) : `💾 ${t('toolbar.backupShort', undefined, generalPrefs.interfaceLocale)}`}
        </Button>
        <Button variant="secondary" onClick={() => openPrefs()}>
          {variant === 'workspace' && <Settings size={15} />}
          {variant === 'workspace' ? t('toolbar.settingsShort', undefined, generalPrefs.interfaceLocale) : `⚙️ ${t('toolbar.settingsShort', undefined, generalPrefs.interfaceLocale)}`}
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
        title={t('prefs.title', undefined, draftGeneral.interfaceLocale)}
        headerExtra={prefsHeaderExtra}
        width="70vw"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPrefsModal(false)}>
              {t('common.cancel', undefined, draftGeneral.interfaceLocale)}
            </Button>
            <Button variant="primary" onClick={savePrefs}>
              {t('common.save', undefined, draftGeneral.interfaceLocale)}
            </Button>
          </>
        }
      >
        {/* —— 分頁列 —— */}
        <div className="prefs-tabs">
          {PREFS_TABS.map((tabItem) => (
            <button
              key={tabItem.key}
              type="button"
              className={`prefs-tab${activePrefsTab === tabItem.key ? ' active' : ''}`}
              onClick={() => setActivePrefsTab(tabItem.key)}
            >
              {t(tabItem.labelKey, undefined, draftGeneral.interfaceLocale) || tabItem.fallbackLabel}
            </button>
          ))}
        </div>

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

        {/* —— General / 一般設定 —— */}
        {activePrefsTab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="form-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
                {t('general.interfaceLocale', undefined, draftGeneral.interfaceLocale)}
                <HelpIcon tooltip={t('general.interfaceLocaleHelp', undefined, draftGeneral.interfaceLocale)} />
              </label>
              <select
                className="form-input"
                value={draftGeneral.interfaceLocale}
                onChange={(e) => {
                  const nextLocale = e.target.value as InterfaceLocale;
                  setDraftGeneral({
                    ...draftGeneral,
                    interfaceLocale: nextLocale,
                  });
                }}
              >
                <option value="zh-TW">{t('general.zhTW', undefined, draftGeneral.interfaceLocale)}</option>
                <option value="en">{t('general.en', undefined, draftGeneral.interfaceLocale)}</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="form-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
                {t('general.defaultWritingLanguage', undefined, draftGeneral.interfaceLocale)}
                <HelpIcon tooltip={t('general.defaultWritingLanguageHelp', undefined, draftGeneral.interfaceLocale)} />
              </label>
              <select
                className="form-input"
                value={draftGeneral.defaultWritingLanguage}
                onChange={(e) => {
                  setDraftGeneral({
                    ...draftGeneral,
                    defaultWritingLanguage: e.target.value as WritingLanguage,
                  });
                }}
              >
                <option value="zh-Hant">{t('general.zhHantWriting', undefined, draftGeneral.interfaceLocale)}</option>
                <option value="en">{t('general.enWriting', undefined, draftGeneral.interfaceLocale)}</option>
              </select>
            </div>
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
              alert(t('prefsLlm.profileInUse', { name: selectedProfile.name }, generalPrefs.interfaceLocale));
              return;
            }
            if (!confirm(t('prefsLlm.deleteConfirm', { name: selectedProfile.name }, generalPrefs.interfaceLocale))) return;
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
              const res = await verifyLLMProfile(selectedProfile, generalPrefs.interfaceLocale);
              setVerifyResult({ ok: res.ok, message: res.message });
            } catch (err) {
              setVerifyResult({ ok: false, message: t('prefsLlm.verifyFailed', { error: errorMessage(err) }, generalPrefs.interfaceLocale) });
            } finally {
              setVerifyingProfile(false);
            }
          };

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Profile Selector Row */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="form-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {t('prefsLlm.sectionTitle', undefined, generalPrefs.interfaceLocale)}
                  <HelpIcon tooltip={t('prefsLlm.sectionHelp', undefined, generalPrefs.interfaceLocale)} />
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
                        {p.name} ({LLM_PROVIDER_LABELS[p.provider]}){p.id === draftActiveId ? t('prefsLlm.defaultSuffix', undefined, generalPrefs.interfaceLocale) : ''}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="secondary" onClick={handleAddProfile}>
                    {t('prefsLlm.addProfile', undefined, generalPrefs.interfaceLocale)}
                  </Button>
                </div>
              </div>

              {/* Profile Action Bar */}
              {selectedProfile && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-tertiary, #1f2937)', padding: '8px 12px', borderRadius: 6 }}>
                  <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{t('prefsLlm.editing', { name: selectedProfile.name }, generalPrefs.interfaceLocale)}</span>
                    {selectedProfile.id === draftActiveId ? (
                      <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--accent-primary, #3b82f6)', color: '#fff', borderRadius: 4 }}>
                        {t('prefsLlm.active', undefined, generalPrefs.interfaceLocale)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary, #9ca3af)' }}>
                        {t('prefsLlm.inactive', undefined, generalPrefs.interfaceLocale)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {selectedProfile.id !== draftActiveId && (
                      <Button size="sm" variant="secondary" onClick={handleSetDefault}>
                        {t('prefsLlm.setDefault', undefined, generalPrefs.interfaceLocale)}
                      </Button>
                    )}
                    {draftProfiles.length > 1 && (
                      <Button size="sm" variant="secondary" onClick={handleDeleteProfile}>
                        {t('common.delete', undefined, generalPrefs.interfaceLocale)}
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
                      {t('prefsLlm.provider', undefined, generalPrefs.interfaceLocale)}
                      <HelpIcon tooltip={t('prefsLlm.providerHelp', undefined, generalPrefs.interfaceLocale)} />
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
                    label={t('prefsLlm.profileName', undefined, generalPrefs.interfaceLocale)}
                    value={selectedProfile.name}
                    onChange={(e) => updateSelectedProfile({ name: e.target.value })}
                  />

                  <Input
                    label={
                      selectedProfile.provider === 'custom'
                        ? t('prefsLlm.baseUrl', undefined, generalPrefs.interfaceLocale)
                        : t('prefsLlm.baseUrlOptional', undefined, generalPrefs.interfaceLocale)
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
                    label={t('prefsLlm.model', undefined, generalPrefs.interfaceLocale)}
                    placeholder={LLM_PROVIDER_DEFAULTS[selectedProfile.provider].model}
                    value={selectedProfile.model}
                    onChange={(e) => updateSelectedProfile({ model: e.target.value })}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <Input
                      label={
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {t('prefsLlm.temperature', undefined, generalPrefs.interfaceLocale)}
                          <HelpIcon tooltip={t('prefsLlm.temperatureHelp', undefined, generalPrefs.interfaceLocale)} />
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
                          {t('prefsLlm.maxTokens', undefined, generalPrefs.interfaceLocale)}
                          <HelpIcon tooltip={t('prefsLlm.maxTokensHelp', undefined, generalPrefs.interfaceLocale)} />
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
                          {t('prefsLlm.timeout', undefined, generalPrefs.interfaceLocale)}
                          <HelpIcon tooltip={t('prefsLlm.timeoutHelp', undefined, generalPrefs.interfaceLocale)} />
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
                      ? t('prefsLlm.geminiHint', undefined, generalPrefs.interfaceLocale)
                      : selectedProfile.provider === 'grok'
                      ? t('prefsLlm.grokHint', undefined, generalPrefs.interfaceLocale)
                      : selectedProfile.provider === 'anthropic'
                      ? t('prefsLlm.anthropicHint', undefined, generalPrefs.interfaceLocale)
                      : t('prefsLlm.openAiHint', undefined, generalPrefs.interfaceLocale)}
                  </p>

                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={verifyingProfile}
                      onClick={handleVerify}
                    >
                      {verifyingProfile
                        ? t('prefsLlm.verifying', undefined, generalPrefs.interfaceLocale)
                        : t('prefsLlm.verify', undefined, generalPrefs.interfaceLocale)}
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
            { key: 'planner', label: t('prefsAgent.plannerLabel', undefined, generalPrefs.interfaceLocale), desc: t('prefsAgent.plannerDesc', undefined, generalPrefs.interfaceLocale), accentColor: '#3b82f6' },
            { key: 'writer', label: t('prefsAgent.writerLabel', undefined, generalPrefs.interfaceLocale), desc: t('prefsAgent.writerDesc', undefined, generalPrefs.interfaceLocale), accentColor: '#10b981' },
            { key: 'critic', label: t('prefsAgent.criticLabel', undefined, generalPrefs.interfaceLocale), desc: t('prefsAgent.criticDesc', undefined, generalPrefs.interfaceLocale), accentColor: '#f59e0b' },
            { key: 'editor', label: t('prefsAgent.editorLabel', undefined, generalPrefs.interfaceLocale), desc: t('prefsAgent.editorDesc', undefined, generalPrefs.interfaceLocale), accentColor: '#8b5cf6' },
          ];

          const totalWeight = Object.values(draftMultiAgent.criticRubricWeights).reduce((sum, v) => sum + (Number(v) || 0), 0);
          const isWeightValid = totalWeight === 100 && Object.values(draftMultiAgent.criticRubricWeights).every((v) => typeof v === 'number' && v >= 0);
          const isThreshValid = validateCriticThresholds(
            draftMultiAgent.criticThresholds.humanReviewFloor,
            draftMultiAgent.criticThresholds.passScore,
            generalPrefs.interfaceLocale,
          ).valid;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Section 1: Agent Roles Configuration */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {t('prefsAgent.rolesTitle', undefined, generalPrefs.interfaceLocale)}
                </h4>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {t('prefsAgent.rolesDesc', undefined, generalPrefs.interfaceLocale)}
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
                            {t('prefsAgent.assignedProfile', undefined, generalPrefs.interfaceLocale)}
                            <HelpIcon tooltip={t('prefsAgent.assignedProfileHelp', undefined, generalPrefs.interfaceLocale)} />
                          </label>
                          <select
                            className="form-input"
                            value={cfg.profileId || ''}
                            onChange={(e) => updateRole({ profileId: e.target.value || null })}
                          >
                            <option value="">{t('prefsAgent.useDefaultProfile', undefined, generalPrefs.interfaceLocale)}</option>
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
                              {t('prefsAgent.modelOverride', undefined, generalPrefs.interfaceLocale)}
                              <HelpIcon tooltip={t('prefsAgent.modelOverrideHelp', undefined, generalPrefs.interfaceLocale)} />
                            </span>
                          }
                          placeholder={t('prefsAgent.followProfileDefault', undefined, generalPrefs.interfaceLocale)}
                          value={cfg.modelOverride || ''}
                          onChange={(e) => updateRole({ modelOverride: e.target.value || undefined })}
                        />
                        <Input
                          label={
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                              {t('prefsAgent.temperature', undefined, generalPrefs.interfaceLocale)}
                              <HelpIcon tooltip={t('prefsAgent.temperatureHelp', undefined, generalPrefs.interfaceLocale)} />
                            </span>
                          }
                          type="number"
                          step="0.1"
                          min="0"
                          max="2"
                          placeholder={t('prefsAgent.followProfile', undefined, generalPrefs.interfaceLocale)}
                          value={cfg.temperatureOverride !== undefined ? String(cfg.temperatureOverride) : ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateRole({ temperatureOverride: val !== '' ? Number(val) : undefined });
                          }}
                        />
                        <Input
                          label={
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                              {t('prefsAgent.maxTokens', undefined, generalPrefs.interfaceLocale)}
                              <HelpIcon tooltip={t('prefsAgent.maxTokensHelp', undefined, generalPrefs.interfaceLocale)} />
                            </span>
                          }
                          type="number"
                          step="256"
                          placeholder={t('prefsAgent.followProfile', undefined, generalPrefs.interfaceLocale)}
                          value={cfg.maxTokensOverride !== undefined ? String(cfg.maxTokensOverride) : ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateRole({ maxTokensOverride: val !== '' ? Number(val) : undefined });
                          }}
                        />
                      </div>

                      <div>
                        <label className="form-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {t('prefsAgent.roleGuidance', undefined, generalPrefs.interfaceLocale)}
                          <HelpIcon tooltip={t('prefsAgent.roleGuidanceHelp', undefined, generalPrefs.interfaceLocale)} />
                        </label>
                        <textarea
                          className="form-input"
                          rows={2}
                          style={{ width: '100%', resize: 'vertical' }}
                          value={cfg.roleGuidance}
                          onChange={(e) => updateRole({ roleGuidance: e.target.value })}
                        />
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '4px 0 0 0' }}>
                          {t('prefsAgent.systemContractNote', undefined, generalPrefs.interfaceLocale)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Section 2: Revisions & Thresholds */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {t('prefsAgent.thresholdsTitle', undefined, generalPrefs.interfaceLocale)}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <Input
                    label={
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {t('prefsAgent.maxRevisions', undefined, generalPrefs.interfaceLocale)}
                        <HelpIcon tooltip={t('prefsAgent.maxRevisionsHelp', undefined, generalPrefs.interfaceLocale)} />
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
                        {t('prefsAgent.humanReviewFloor', undefined, generalPrefs.interfaceLocale)}
                        <HelpIcon tooltip={t('prefsAgent.humanReviewFloorHelp', undefined, generalPrefs.interfaceLocale)} />
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
                        {t('prefsAgent.passScore', undefined, generalPrefs.interfaceLocale)}
                        <HelpIcon tooltip={t('prefsAgent.passScoreHelp', undefined, generalPrefs.interfaceLocale)} />
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
                    {t('prefsAgent.invalidThresholds', undefined, generalPrefs.interfaceLocale)}
                  </p>
                )}
              </div>

              {/* Section 3: Critic Six-Dimension Rubric Weights */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {t('prefsAgent.rubricTitle', undefined, generalPrefs.interfaceLocale)}
                  </h4>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: isWeightValid ? 'var(--accent-green, #52c41a)' : 'var(--accent-red, #ff4d4f)',
                    }}
                  >
                    {t('prefsAgent.rubricTotal', { total: totalWeight }, generalPrefs.interfaceLocale)}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <Input
                    label={t('prefsAgent.rubricInstruction', undefined, generalPrefs.interfaceLocale)}
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
                    label={t('prefsAgent.rubricPlot', undefined, generalPrefs.interfaceLocale)}
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
                    label={t('prefsAgent.rubricCharacter', undefined, generalPrefs.interfaceLocale)}
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
                    label={t('prefsAgent.rubricContinuity', undefined, generalPrefs.interfaceLocale)}
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
                    label={t('prefsAgent.rubricStyle', undefined, generalPrefs.interfaceLocale)}
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
                    label={t('prefsAgent.rubricPacing', undefined, generalPrefs.interfaceLocale)}
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
                    {t('prefsAgent.invalidRubric', undefined, generalPrefs.interfaceLocale)}
                  </p>
                )}
              </div>

              {/* Section 4: Cost Estimation & Token Display */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {t('prefsAgent.costTitle', undefined, generalPrefs.interfaceLocale)}
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
                  <span>{t('prefsAgent.showCost', undefined, generalPrefs.interfaceLocale)}</span>
                </label>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
                  {t('prefsAgent.showCostNote', undefined, generalPrefs.interfaceLocale)}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 4 }}>
                  <Input
                    label={t('prefsAgent.inputPrice', undefined, generalPrefs.interfaceLocale)}
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
                    label={t('prefsAgent.outputPrice', undefined, generalPrefs.interfaceLocale)}
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
                    label={t('prefsAgent.currency', undefined, generalPrefs.interfaceLocale)}
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
              <label className="form-label">{t('prefsImage.provider', undefined, generalPrefs.interfaceLocale)}</label>
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
                label={t('prefsImage.width', undefined, generalPrefs.interfaceLocale)}
                type="number"
                value={String(draftImage.width)}
                onChange={(e) => setDraftImage({ ...draftImage, width: Number(e.target.value) || 1024 })}
              />
              <Input
                label={t('prefsImage.height', undefined, generalPrefs.interfaceLocale)}
                type="number"
                value={String(draftImage.height)}
                onChange={(e) => setDraftImage({ ...draftImage, height: Number(e.target.value) || 1024 })}
              />
            </div>

            <Input
              label={t('prefsImage.style', undefined, generalPrefs.interfaceLocale)}
              value={draftImage.stylePreset}
              onChange={(e) => setDraftImage({ ...draftImage, stylePreset: e.target.value })}
            />

            <Input
              label={t('prefsImage.panelCount', undefined, generalPrefs.interfaceLocale)}
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
                    placeholder={t('prefsImage.workflowPlaceholder', undefined, generalPrefs.interfaceLocale)}
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
                  {t('prefsImage.fluxHint', undefined, generalPrefs.interfaceLocale)}
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
                    {t('prefsImage.copyGoogleKey', undefined, generalPrefs.interfaceLocale)}
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
                  {t('prefsImage.geminiHint', undefined, generalPrefs.interfaceLocale)}
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
                    {t('prefsImage.copyLlmCredentials', undefined, generalPrefs.interfaceLocale)}
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
                  {t('prefsImage.separateModelHint', undefined, generalPrefs.interfaceLocale)}
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
                {t('prefsInline.contextRange', undefined, generalPrefs.interfaceLocale)}
                <HelpIcon tooltip={t('prefsInline.contextRangeHelp', undefined, generalPrefs.interfaceLocale)} />
              </div>
              <div className="inline-edit-radio-row">
                <label>
                  <input
                    type="radio"
                    checked={draftInline.contextMode === 'window'}
                    onChange={() => setDraftInline({ ...draftInline, contextMode: 'window' as InlineEditContextMode })}
                  />
                  {t('prefsInline.window', undefined, generalPrefs.interfaceLocale)}
                </label>
                <label>
                  <input
                    type="radio"
                    checked={draftInline.contextMode === 'full'}
                    onChange={() => setDraftInline({ ...draftInline, contextMode: 'full' as InlineEditContextMode })}
                  />
                  {t('prefsInline.full', undefined, generalPrefs.interfaceLocale)}
                </label>
              </div>
            </div>
            <div>
              <label className="form-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
                {t('prefsInline.contextChars', undefined, generalPrefs.interfaceLocale)}
                <HelpIcon tooltip={t('prefsInline.contextCharsHelp', undefined, generalPrefs.interfaceLocale)} />
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
              {t('prefsInline.note', undefined, generalPrefs.interfaceLocale)}
            </p>
          </div>
        )}

        {/* —— Wiki 設定 —— */}
        {activePrefsTab === 'wiki' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="form-label">
                {t('prefsWiki.budgetRatio', { percent: Math.round(draftWiki.budgetRatio * 100) }, generalPrefs.interfaceLocale)}
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
                {t('prefsWiki.budgetRatioHelp', undefined, generalPrefs.interfaceLocale)}
              </p>
            </div>

            <div>
              <label className="form-label">{t('prefsWiki.overflowThreshold', undefined, generalPrefs.interfaceLocale)}</label>
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
                {t('prefsWiki.overflowHelp', undefined, generalPrefs.interfaceLocale)}
              </p>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={draftWiki.enablePickPages}
                  onChange={(e) => setDraftWiki({ ...draftWiki, enablePickPages: e.target.checked })}
                />
                <span>{t('prefsWiki.pickPages', undefined, generalPrefs.interfaceLocale)}</span>
              </label>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0 22px', lineHeight: 1.6 }}>
                {t('prefsWiki.pickPagesHelp', undefined, generalPrefs.interfaceLocale)}
              </p>
            </div>

            <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
            <h4 style={{ margin: '0 0 8px' }}>Lint</h4>

            <div>
              <label className="form-label">{t('prefsWiki.enabledChecks', undefined, generalPrefs.interfaceLocale)}</label>
              {[
                { k: 'brokenLink', label: t('prefsWiki.checkBrokenLink', undefined, generalPrefs.interfaceLocale) },
                { k: 'orphan', label: t('prefsWiki.checkOrphan', undefined, generalPrefs.interfaceLocale) },
                { k: 'aliasDup', label: t('prefsWiki.checkAliasDup', undefined, generalPrefs.interfaceLocale) },
                { k: 'summaryMismatch', label: t('prefsWiki.checkSummaryMismatch', undefined, generalPrefs.interfaceLocale) },
                { k: 'unrecorded', label: t('prefsWiki.checkUnrecorded', undefined, generalPrefs.interfaceLocale) },
                { k: 'wikiContradict', label: t('prefsWiki.checkWikiContradict', undefined, generalPrefs.interfaceLocale) },
                { k: 'wikiVsChapter', label: t('prefsWiki.checkWikiVsChapter', undefined, generalPrefs.interfaceLocale) },
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
              <label className="form-label">{t('prefsWiki.llmLimits', undefined, generalPrefs.interfaceLocale)}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {t('prefsWiki.maxPages', undefined, generalPrefs.interfaceLocale)}
                    <HelpIcon tooltip={t('prefsWiki.maxPagesHelp', undefined, generalPrefs.interfaceLocale)} />
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
                    {t('prefsWiki.maxCharacters', undefined, generalPrefs.interfaceLocale)}
                    <HelpIcon tooltip={t('prefsWiki.maxCharactersHelp', undefined, generalPrefs.interfaceLocale)} />
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
                    {t('prefsWiki.chaptersPerCharacter', undefined, generalPrefs.interfaceLocale)}
                    <HelpIcon tooltip={t('prefsWiki.chaptersPerCharacterHelp', undefined, generalPrefs.interfaceLocale)} />
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
                    {t('prefsWiki.unrecordedLimit', undefined, generalPrefs.interfaceLocale)}
                    <HelpIcon tooltip={t('prefsWiki.unrecordedLimitHelp', undefined, generalPrefs.interfaceLocale)} />
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
            interfaceLocale={draftGeneral.interfaceLocale}
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
  labelKey: string;
  descKey: string;
  defaultValue: string;
}

const PROMPT_ENTRIES: PromptEntry[] = [
  {
    key: 'chapterDraftsTemplate',
    labelKey: 'prefsPrompts.chapterDraftsLabel',
    descKey: 'prefsPrompts.chapterDraftsDesc',
    defaultValue: DEFAULT_CHAPTER_DRAFTS_TEMPLATE,
  },
  {
    key: 'chapterContinuationRules',
    labelKey: 'prefsPrompts.continuationLabel',
    descKey: 'prefsPrompts.continuationDesc',
    defaultValue: DEFAULT_CHAPTER_CONTINUATION_RULES,
  },
  {
    key: 'chapterContentTemplate',
    labelKey: 'prefsPrompts.contentLabel',
    descKey: 'prefsPrompts.contentDesc',
    defaultValue: DEFAULT_CHAPTER_CONTENT_TEMPLATE,
  },
  {
    key: 'chapterPointsTemplate',
    labelKey: 'prefsPrompts.pointsLabel',
    descKey: 'prefsPrompts.pointsDesc',
    defaultValue: DEFAULT_CHAPTER_POINTS_TEMPLATE,
  },
  {
    key: 'characterDraftsTemplate',
    labelKey: 'prefsPrompts.charactersLabel',
    descKey: 'prefsPrompts.charactersDesc',
    defaultValue: DEFAULT_CHARACTER_DRAFTS_TEMPLATE,
  },
  {
    key: 'inlineAdjustTemplate',
    labelKey: 'prefsPrompts.inlineLabel',
    descKey: 'prefsPrompts.inlineDesc',
    defaultValue: DEFAULT_INLINE_ADJUST_TEMPLATE,
  },
  {
    key: 'comicStoryboardTemplate',
    labelKey: 'prefsPrompts.comicLabel',
    descKey: 'prefsPrompts.comicDesc',
    defaultValue: DEFAULT_COMIC_STORYBOARD_TEMPLATE,
  },
  {
    key: 'wikiIngestPlanTemplate',
    labelKey: 'prefsPrompts.wikiPlanLabel',
    descKey: 'prefsPrompts.wikiPlanDesc',
    defaultValue: DEFAULT_WIKI_INGEST_PLAN_TEMPLATE,
  },
  {
    key: 'wikiIngestCreateTemplate',
    labelKey: 'prefsPrompts.wikiCreateLabel',
    descKey: 'prefsPrompts.wikiCreateDesc',
    defaultValue: DEFAULT_WIKI_INGEST_CREATE_TEMPLATE,
  },
  {
    key: 'wikiIngestUpdateTemplate',
    labelKey: 'prefsPrompts.wikiUpdateLabel',
    descKey: 'prefsPrompts.wikiUpdateDesc',
    defaultValue: DEFAULT_WIKI_INGEST_UPDATE_TEMPLATE,
  },
  {
    key: 'wikiQueryAnswerTemplate',
    labelKey: 'prefsPrompts.wikiQueryLabel',
    descKey: 'prefsPrompts.wikiQueryDesc',
    defaultValue: DEFAULT_WIKI_QUERY_ANSWER_TEMPLATE,
  },
  {
    key: 'lintUnrecordedVerifyTemplate',
    labelKey: 'prefsPrompts.lintUnrecordedLabel',
    descKey: 'prefsPrompts.lintUnrecordedDesc',
    defaultValue: DEFAULT_LINT_UNRECORDED_VERIFY_TEMPLATE,
  },
  {
    key: 'lintWikiContradictTemplate',
    labelKey: 'prefsPrompts.lintContradictLabel',
    descKey: 'prefsPrompts.lintContradictDesc',
    defaultValue: DEFAULT_LINT_WIKI_CONTRADICT_TEMPLATE,
  },
  {
    key: 'lintWikiVsChapterTemplate',
    labelKey: 'prefsPrompts.lintVsChapterLabel',
    descKey: 'prefsPrompts.lintVsChapterDesc',
    defaultValue: DEFAULT_LINT_WIKI_VS_CHAPTER_TEMPLATE,
  },
  {
    key: 'lintFixSuggestTemplate',
    labelKey: 'prefsPrompts.lintFixLabel',
    descKey: 'prefsPrompts.lintFixDesc',
    defaultValue: DEFAULT_LINT_FIX_SUGGEST_TEMPLATE,
  },
];

export type PreviewDataSource = 'project' | 'sample';

function promptVariableDescription(
  variableName: string,
  fallback: string,
  locale: 'zh-TW' | 'en',
): string {
  if (locale !== 'en') return fallback;
  const descriptions: Record<string, string> = {
    taskIntro: 'Generation task and continuation context',
    worldSetting: 'Book world setting',
    mainPlot: 'Main plot',
    charactersSection: 'Existing character context',
    existingChaptersSection: 'Existing chapter summaries',
    continuationRulesSection: 'Continuation constraints',
    count: 'Requested item count',
    beatList: 'Allowed story beats',
    pointsExtraHint: 'Additional key-point constraints',
    chapterTitle: 'Chapter title',
    beat: 'Chapter beat',
    points: 'Chapter key points',
    targetWords: 'Target length',
    referenceSection: 'Reference chapter context',
    olderSummarySection: 'Earlier chapter summaries',
    wikiSection: 'Selected Wiki context',
    selectedText: 'Selected passage',
    beforeContext: 'Context before the selection',
    afterContext: 'Context after the selection',
    adjustInstruction: 'User rewrite instruction',
    chapterContent: 'Chapter prose',
  };
  return descriptions[variableName]
    ?? variableName.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase());
}

function AIPromptsTab({
  draft, setDraft, activeKey, setActiveKey, viewMode, setViewMode,
  previewDataSource, setPreviewDataSource, interfaceLocale
}: {
  draft: AIPromptPrefs;
  setDraft: (d: AIPromptPrefs) => void;
  activeKey: keyof AIPromptPrefs;
  setActiveKey: (k: keyof AIPromptPrefs) => void;
  viewMode: EditPreviewMode;
  setViewMode: (m: EditPreviewMode) => void;
  previewDataSource: PreviewDataSource;
  setPreviewDataSource: (s: PreviewDataSource) => void;
  interfaceLocale: 'zh-TW' | 'en';
}) {
  const entry = PROMPT_ENTRIES.find((e) => e.key === activeKey)!;
  const value = (draft[activeKey as keyof AIPromptPrefs] as string) || '';
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
            title={t(e.descKey, undefined, interfaceLocale)}
          >
            {t(e.labelKey, undefined, interfaceLocale)}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>
        {t(entry.descKey, undefined, interfaceLocale)}
      </p>

      {/* 可用變數提示 */}
      {!isPlainText && vars.length > 0 && (
        <details className="prompt-vars-hint">
          <summary>{t('prefsPrompts.variables', { count: vars.length }, interfaceLocale)}</summary>
          <table className="prompt-vars-table">
            <tbody>
              {vars.map((v) => (
                <tr key={v.var}>
                  <td><code>{`{{${v.var}}}`}</code></td>
                  <td>{promptVariableDescription(v.var, v.desc, interfaceLocale)}</td>
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
            onClick={() => {
              const builtIn = getBuiltInAIPrompts(interfaceLocale);
              setDraft({ ...draft, [activeKey]: builtIn[activeKey] });
            }}
          >
            {t('prefsPrompts.reset', undefined, interfaceLocale)}
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
          placeholder={t('prefsPrompts.emptyPlaceholder', undefined, interfaceLocale)}
          spellCheck={false}
        />
      ) : (
        <>
          {!isPlainText && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <span style={{ color: 'var(--text-tertiary)' }}>{t('prefsPrompts.variableSource', undefined, interfaceLocale)}</span>
              <div className="preview-source-toggle">
                <button
                  type="button"
                  className={`preview-source-btn${previewDataSource === 'project' ? ' active' : ''}`}
                  onClick={() => setPreviewDataSource('project')}
                >
                  {t('prefsPrompts.currentProject', undefined, interfaceLocale)}
                </button>
                <button
                  type="button"
                  className={`preview-source-btn${previewDataSource === 'sample' ? ' active' : ''}`}
                  onClick={() => setPreviewDataSource('sample')}
                >
                  {t('prefsPrompts.sampleData', undefined, interfaceLocale)}
                </button>
              </div>
              <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                {previewDataSource === 'project'
                  ? (usedProjectData
                      ? t('prefsPrompts.usingProject', undefined, interfaceLocale)
                      : t('prefsPrompts.projectUnavailable', undefined, interfaceLocale))
                  : t('prefsPrompts.usingSample', undefined, interfaceLocale)}
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
