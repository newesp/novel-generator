import { useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useSettingsStore } from '../stores/settingsStore';
import { Button } from './common/Button';
import { Modal } from './common/Modal';
import { Input } from './common/Input';

export function Toolbar() {
  const { project, createProject } = useProjectStore();
  const { llmConfig, setLlmConfig } = useSettingsStore();
  const [showApiModal, setShowApiModal] = useState(false);
  const [draftConfig, setDraftConfig] = useState(llmConfig);

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

  const openApiModal = () => {
    setDraftConfig(llmConfig);
    setShowApiModal(true);
  };

  const saveApiConfig = () => {
    setLlmConfig(draftConfig);
    setShowApiModal(false);
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
        <Button variant="secondary" onClick={openApiModal}>🔑 API 設定</Button>
        <Button variant="secondary" disabled>導出</Button>
        <Button variant="ghost" disabled>⚙️</Button>
      </div>

      <Modal
        open={showApiModal}
        onClose={() => setShowApiModal(false)}
        title="LLM API 設定"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowApiModal(false)}>取消</Button>
            <Button variant="primary" onClick={saveApiConfig}>儲存</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Input
            label="顯示名稱"
            value={draftConfig.name}
            onChange={(e) => setDraftConfig({ ...draftConfig, name: e.target.value })}
          />
          <Input
            label="API 端點 (Base URL)"
            placeholder="https://api.openai.com/v1"
            value={draftConfig.baseUrl}
            onChange={(e) => setDraftConfig({ ...draftConfig, baseUrl: e.target.value })}
          />
          <Input
            label="API Key"
            type="password"
            value={draftConfig.apiKey}
            onChange={(e) => setDraftConfig({ ...draftConfig, apiKey: e.target.value })}
          />
          <Input
            label="模型名稱"
            placeholder="gpt-4o"
            value={draftConfig.model}
            onChange={(e) => setDraftConfig({ ...draftConfig, model: e.target.value })}
          />
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            支援 OpenAI-compatible API（OpenAI、NVIDIA、本機 Ollama 等）。
          </p>
        </div>
      </Modal>
    </>
  );
}
