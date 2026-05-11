import { useEffect, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Textarea } from '../common/Textarea';
import { generateCharacterDrafts } from '../../lib/ai-tasks';
import { isLLMReady } from '../../lib/llm';
import type { Character } from '../../types';

const EMPTY_CHARACTER = (projectId: string): Character => ({
  id: '',
  projectId,
  name: '',
  gender: '',
  age: '',
  race: '',
  personality: '',
  background: '',
  appearance: '',
  abilities: '',
  relations: '',
  arc: '',
  createdAt: 0,
});

export function CharactersPanel() {
  const { project, characters, loadCharacters, createCharacter, updateCharacter, deleteCharacter } = useProjectStore();
  const { llmConfig } = useSettingsStore();
  const [editing, setEditing] = useState<Character | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiCount, setAiCount] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (project) loadCharacters(project.id);
  }, [project?.id]);

  if (!project) {
    return (
      <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>
        請先建立專案
      </div>
    );
  }

  const handleSave = async (data: Omit<Character, 'id' | 'projectId' | 'createdAt'>) => {
    if (!editing) return;
    if (editing.id) {
      await updateCharacter(editing.id, data);
    } else {
      await createCharacter(project.id, data);
    }
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!editing?.id) return;
    if (!confirm(`刪除角色「${editing.name}」？`)) return;
    await deleteCharacter(editing.id);
    setEditing(null);
  };

  const apiReady = isLLMReady(llmConfig);
  const outlineReady = !!(project.worldSetting || project.mainPlot);

  const handleAIGenerate = async () => {
    setIsGenerating(true);
    try {
      const drafts = await generateCharacterDrafts({
        count: aiCount,
        worldSetting: project.worldSetting,
        mainPlot: project.mainPlot,
        existingNames: characters.map((c) => c.name).filter(Boolean),
      });

      if (drafts.length === 0) {
        alert('AI 未產出任何角色，請檢查 LLM 是否回傳預期格式');
        return;
      }

      for (const draft of drafts) {
        await createCharacter(project.id, draft);
      }
      setShowAIModal(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="tab-panel">
      <div className="section">
        <Button
          variant="primary"
          style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
          onClick={() => setShowAIModal(true)}
          disabled={!apiReady || !outlineReady}
          title={
            !apiReady ? '請先設定 API'
            : !outlineReady ? '請先在大綱頁填寫世界觀或主線劇情'
            : ''
          }
        >
          ✨ AI 生成角色
        </Button>
        <Button
          variant="secondary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => setEditing(EMPTY_CHARACTER(project.id))}
        >
          ➕ 新增角色
        </Button>
      </div>

      <div className="section">
        <div className="section-title">角色列表（{characters.length}）</div>
        {characters.map((char) => (
          <div
            key={char.id}
            className="char-item"
            onClick={() => setEditing(char)}
          >
            <div className="char-item-name">{char.name || '(未命名)'}</div>
            <div className="char-item-meta">
              {[char.gender, char.age && `${char.age}歲`, char.race && `種族：${char.race}`]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        ))}
        {characters.length === 0 && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '8px 0' }}>
            尚未建立角色，點擊上方按鈕新增
          </div>
        )}
      </div>

      {editing && (
        <CharacterEditorModal
          character={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onDelete={editing.id ? handleDelete : undefined}
        />
      )}

      <Modal
        open={showAIModal}
        onClose={() => !isGenerating && setShowAIModal(false)}
        title="✨ AI 生成角色"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAIModal(false)} disabled={isGenerating}>
              取消
            </Button>
            <Button variant="primary" onClick={handleAIGenerate} disabled={isGenerating || aiCount < 1}>
              {isGenerating ? '生成中...' : `生成 ${aiCount} 個角色`}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
          AI 將根據世界觀與主線劇情，自動產生角色設定（含姓名、性格、背景、能力、關係、<strong>成長弧線</strong>等）。
          <br />
          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            ⓘ 主線劇情中出現的所有角色名字皆會被建立；主角的成長弧線會與主線劇情相呼應。
            最終生成數量可能超過下方設定（為了不遺漏主線中提到的人物）。
          </span>
          {characters.length > 0 && (
            <><br /><span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>已存在的角色會作為上下文，避免重複。</span></>
          )}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13 }}>角色數量（最少）：</label>
          <input
            type="number"
            className="form-input"
            min={1}
            max={10}
            value={aiCount}
            onChange={(e) => setAiCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
            style={{ width: 80 }}
            disabled={isGenerating}
          />
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>（建議 2 - 5 個）</span>
        </div>
      </Modal>
    </div>
  );
}

interface ModalProps {
  character: Character;
  onClose: () => void;
  onSave: (data: Omit<Character, 'id' | 'projectId' | 'createdAt'>) => void;
  onDelete?: () => void;
}

function CharacterEditorModal({ character, onClose, onSave, onDelete }: ModalProps) {
  const [form, setForm] = useState({
    name: character.name,
    gender: character.gender,
    age: character.age,
    race: character.race,
    personality: character.personality,
    background: character.background,
    appearance: character.appearance,
    abilities: character.abilities,
    relations: character.relations,
    arc: character.arc ?? '',
  });

  const update = <K extends keyof typeof form>(key: K, val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  return (
    <Modal
      open
      onClose={onClose}
      title={character.id ? '編輯角色' : '新增角色'}
      footer={
        <>
          {onDelete && (
            <Button variant="ghost" onClick={onDelete} style={{ color: 'var(--accent)' }}>
              刪除
            </Button>
          )}
          <div style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => onSave(form)}>儲存</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Input label="姓名" value={form.name} onChange={(e) => update('name', e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Input label="性別" value={form.gender} onChange={(e) => update('gender', e.target.value)} />
          <Input label="年齡" value={form.age} onChange={(e) => update('age', e.target.value)} />
        </div>
        <Input label="種族" value={form.race} onChange={(e) => update('race', e.target.value)} />
        <Input label="性格" value={form.personality} onChange={(e) => update('personality', e.target.value)} />
        <Textarea label="背景" value={form.background} onChange={(e) => update('background', e.target.value)} />
        <Textarea label="外貌" value={form.appearance} onChange={(e) => update('appearance', e.target.value)} />
        <Textarea label="能力" value={form.abilities} onChange={(e) => update('abilities', e.target.value)} />
        <Textarea label="關係" value={form.relations} onChange={(e) => update('relations', e.target.value)} />
        <Textarea
          label="成長弧線"
          value={form.arc}
          onChange={(e) => update('arc', e.target.value)}
          placeholder="從故事開頭到結局，此角色的內在轉變（與主線劇情相呼應）..."
        />
      </div>
    </Modal>
  );
}
