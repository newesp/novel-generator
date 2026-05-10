import { useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useSettingsStore, type InlineEditContextMode } from '../stores/settingsStore';
import { Button } from './common/Button';
import { Modal } from './common/Modal';
import { Input } from './common/Input';

export function Toolbar() {
  const { project, createProject } = useProjectStore();
  const { llmConfig, inlineEdit, setLlmConfig, setInlineEdit } = useSettingsStore();
  const [showPrefsModal, setShowPrefsModal] = useState(false);
  const [draftLlm, setDraftLlm] = useState(llmConfig);
  const [draftInline, setDraftInline] = useState(inlineEdit);

  const handleNewProject = async () => {
    await createProject({
      title: '新專案',
      genre: '',
      style: '',
      worldSetting: '',
      mainPlot: '',
      chapterOutline: '',
    });
  };

  const openPrefs = () => {
    setDraftLlm(llmConfig);
    setDraftInline(inlineEdit);
    setShowPrefsModal(true);
  };

  const savePrefs = () => {
    setLlmConfig(draftLlm);
    setInlineEdit(draftInline);
    setShowPrefsModal(false);
  };

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-logo">📖 小說產生器</span>
        <Button variant="secondary" onClick={handleNewProject}>新建專案</Button>
        {project && (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{project.title}</span>
        )}
        <div className="toolbar-spacer" />
        <Button variant="secondary" disabled>導出</Button>
        <Button variant="secondary" onClick={openPrefs}>⚙️ 偏好設定</Button>
      </div>

      <Modal
        open={showPrefsModal}
        onClose={() => setShowPrefsModal(false)}
        title="⚙️ 偏好設定"
        width={520}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPrefsModal(false)}>取消</Button>
            <Button variant="primary" onClick={savePrefs}>儲存</Button>
          </>
        }
      >
        {/* —— LLM API —— */}
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
          🔑 LLM API
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Input
            label="顯示名稱"
            value={draftLlm.name}
            onChange={(e) => setDraftLlm({ ...draftLlm, name: e.target.value })}
          />
          <Input
            label="API 端點 (Base URL)"
            placeholder="https://api.openai.com/v1"
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
            placeholder="gpt-4o"
            value={draftLlm.model}
            onChange={(e) => setDraftLlm({ ...draftLlm, model: e.target.value })}
          />
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0' }}>
            支援 OpenAI-compatible API（OpenAI、NVIDIA、本機 Ollama 等）。
          </p>
        </div>

        {/* —— Inline Edit —— */}
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          margin: '20px 0 8px', borderTop: '1px solid var(--border)', paddingTop: 16,
        }}>
          ✨ 選取調整內容
        </div>
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
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0' }}>
            在章節編輯器中選取文字後右鍵「✨ 調整內容」會以此設定當預設值，但 Modal 內可即時切換。
          </p>
        </div>
      </Modal>
    </>
  );
}
