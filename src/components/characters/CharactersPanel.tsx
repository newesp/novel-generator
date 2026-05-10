import { useEffect, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Textarea } from '../common/Textarea';
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
  createdAt: 0,
});

export function CharactersPanel() {
  const { project, characters, loadCharacters, createCharacter, updateCharacter, deleteCharacter } = useProjectStore();
  const [editing, setEditing] = useState<Character | null>(null);

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

  return (
    <div className="tab-panel">
      <div className="section">
        <Button
          variant="primary"
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
      </div>
    </Modal>
  );
}
