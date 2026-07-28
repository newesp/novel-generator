import { useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useProjectStore } from '../../stores/projectStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { storage } from '../../lib/storage';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Textarea } from '../common/Textarea';
import { CharacterGraphView } from './CharacterGraphView';
import { generateCharacterDrafts, completeCharacterFields, filterNewCharacterDrafts } from '../../lib/ai-tasks';
import { isLLMReady } from '../../lib/llm';
import type { Character, MediaAsset } from '../../types';
import { useLocalAIActivity } from '../../hooks/useLocalAIActivity';
import { LocalAIActivityCard } from '../common/LocalAIActivityCard';

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
  visualNegativePrompt: '',
  referenceAssetIds: [],
  createdAt: 0,
});

export function CharactersPanel() {
  const { project, characters, loadCharacters, createCharacter, updateCharacter, deleteCharacter } = useProjectStore();
  const { llmConfig } = useSettingsStore();
  const [editing, setEditing] = useState<Character | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiCount, setAiCount] = useState<number | ''>(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const characterDraftActivity = useLocalAIActivity();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (project) loadCharacters(project.id);
  }, [project, loadCharacters]);

  const selectedCharacterIds = useMemo(() => {
    const ids = new Set(characters.map((c) => c.id));
    return new Set([...selected].filter((id) => ids.has(id)));
  }, [characters, selected]);

  const filteredCharacters = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return characters;
    return characters.filter((character) =>
      [character.name, character.gender, character.race, character.personality]
        .some((value) => value?.toLocaleLowerCase().includes(query)),
    );
  }, [characters, search]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allChecked = characters.length > 0 && selectedCharacterIds.size === characters.length;
  const someChecked = selectedCharacterIds.size > 0 && !allChecked;

  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(characters.map((c) => c.id)));
  };

  const handleDeleteSelected = async () => {
    if (selectedCharacterIds.size === 0) return;
    if (!confirm(`刪除已勾選的 ${selectedCharacterIds.size} 個角色？此操作無法復原。`)) return;
    for (const id of selectedCharacterIds) {
      await deleteCharacter(id);
    }
    setSelected(new Set());
  };

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
    const requestedCount = typeof aiCount === 'number' ? aiCount : 1;
    const signal = characterDraftActivity.start(
      `依世界觀與主線設計至少 ${requestedCount} 位角色，既有角色會用來避免重複…`,
    );
    setIsGenerating(true);
    try {
      const drafts = await generateCharacterDrafts({
        count: requestedCount,
        worldSetting: project.worldSetting,
        mainPlot: project.mainPlot,
        existingNames: characters.map((c) => c.name).filter(Boolean),
        writingLanguage: project.writingLanguage,
      }, signal);

      if (drafts.length === 0) {
        throw new Error('AI 未產出任何角色，請檢查 LLM 是否回傳預期格式');
      }

      const newDrafts = filterNewCharacterDrafts(drafts, characters.map((c) => c.name));
      if (newDrafts.length === 0) {
        throw new Error('AI 產出的角色都已存在，沒有新增角色');
      }

      for (const draft of newDrafts) {
        await createCharacter(project.id, draft);
      }
      characterDraftActivity.succeed(`已新增 ${newDrafts.length} 位角色`);
      setShowAIModal(false);
    } catch (err) {
      characterDraftActivity.fail(err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="characters-workspace">
      <aside className="character-browser">
        <header className="character-browser-header">
          <div>
            <h2>角色</h2>
            <span>{characters.length} 位角色</span>
          </div>
          <div className="character-view-toggle" aria-label="角色檢視模式">
            {([
              ['list', '列表'],
              ['graph', '關係圖'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={viewMode === mode ? 'active' : ''}
                onClick={() => setViewMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="character-browser-actions">
          <Button
            variant="primary"
            onClick={() => setShowAIModal(true)}
            disabled={!apiReady || !outlineReady}
            title={
              !apiReady ? '請先設定 API'
              : !outlineReady ? '請先在大綱頁填寫世界觀或主線劇情'
              : ''
            }
          >
            ✨ AI 生成
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setViewMode('list');
              setEditing(EMPTY_CHARACTER(project.id));
            }}
          >
            ＋ 新增角色
          </Button>
        </div>

        <input
          className="form-input character-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜尋姓名、種族或性格"
        />

        {characters.length > 0 && (
          <div className="character-batch-bar">
            <label>
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => { if (el) el.indeterminate = someChecked; }}
                onChange={toggleAll}
              />
              全選
            </label>
            <span>已選 {selectedCharacterIds.size}</span>
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={selectedCharacterIds.size === 0}
            >
              刪除
            </button>
          </div>
        )}

        <div className="character-list">
          {filteredCharacters.map((char) => (
            <div
              key={char.id}
              className={`char-item${editing?.id === char.id ? ' active' : ''}`}
              onClick={() => {
                setViewMode('list');
                setEditing(char);
              }}
            >
              <input
                type="checkbox"
                checked={selectedCharacterIds.has(char.id)}
                onClick={(event) => event.stopPropagation()}
                onChange={() => toggleOne(char.id)}
              />
              <div>
                <div className="char-item-name">{char.name || '(未命名)'}</div>
                <div className="char-item-meta">
                  {[char.gender, char.age && `${char.age}歲`, char.race && `種族：${char.race}`]
                    .filter(Boolean)
                    .join(' · ') || '尚無基本資料'}
                </div>
              </div>
            </div>
          ))}
          {characters.length === 0 && (
            <div className="character-list-empty">尚未建立角色</div>
          )}
          {characters.length > 0 && filteredCharacters.length === 0 && (
            <div className="character-list-empty">找不到符合的角色</div>
          )}
        </div>
      </aside>

      <section className="character-detail">
        {viewMode === 'graph' ? (
          <div className="character-graph-workspace">
            <CharacterGraphView
              characters={characters}
              onSelectCharacter={(character) => {
                setEditing(character);
                setViewMode('list');
              }}
            />
          </div>
        ) : editing ? (
          <CharacterEditor
            key={editing.id || 'new-character'}
            character={editing}
            onClose={() => setEditing(null)}
            onSave={handleSave}
            onDelete={editing.id ? handleDelete : undefined}
            worldSetting={project.worldSetting || ''}
            mainPlot={project.mainPlot || ''}
            otherCharacters={characters.filter((c) => c.id !== editing.id).map((c) => ({ name: c.name, personality: c.personality, background: c.background }))}
            llmReady={isLLMReady(llmConfig)}
          />
        ) : (
          <div className="character-detail-empty">
            <strong>選擇角色開始編輯</strong>
            <span>也可以新增角色，或切換到關係圖檢視。</span>
          </div>
        )}
      </section>

      <Modal
        open={showAIModal}
        onClose={() => {
          if (!isGenerating) {
            setShowAIModal(false);
            characterDraftActivity.reset();
          }
        }}
        title="✨ AI 生成角色"
        footer={
          <>
            <Button variant="secondary" onClick={() => {
              setShowAIModal(false);
              characterDraftActivity.reset();
            }} disabled={isGenerating}>
              取消
            </Button>
            <Button variant="primary" onClick={handleAIGenerate} disabled={isGenerating || typeof aiCount !== 'number' || aiCount < 1}>
              {isGenerating ? '生成中...' : `生成 ${aiCount} 個角色`}
            </Button>
          </>
        }
      >
        {characterDraftActivity.activity.phase !== 'idle' && (
          <LocalAIActivityCard
            activity={characterDraftActivity.activity}
            title={`AI 助理設計 ${typeof aiCount === 'number' ? aiCount : 1} 位角色`}
            message="依世界觀與主線補齊性格、背景、能力、關係與成長弧線…"
            onCancel={characterDraftActivity.cancel}
            onDismiss={characterDraftActivity.reset}
            compact
          />
        )}
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
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') { setAiCount(''); return; }
              const n = parseInt(v, 10);
              if (!isNaN(n)) setAiCount(Math.min(10, n));
            }}
            onBlur={() => {
              const n = typeof aiCount === 'number' ? aiCount : parseInt(String(aiCount), 10);
              setAiCount(isNaN(n) ? 1 : Math.max(1, Math.min(10, n)));
            }}
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
  worldSetting: string;
  mainPlot: string;
  otherCharacters: { name: string; personality?: string; background?: string }[];
  llmReady: boolean;
}

function CharacterEditor({ character, onClose, onSave, onDelete, worldSetting, mainPlot, otherCharacters, llmReady }: ModalProps) {
  const [aiFilling, setAiFilling] = useState(false);
  const fillActivity = useLocalAIActivity();
  const [activeTab, setActiveTab] = useState<'basic' | 'story' | 'visual'>('basic');
  const [form, setForm] = useState({
    name: character.name,
    gender: character.gender,
    age: character.age,
    race: character.race,
    personality: character.personality,
    background: character.background,
    appearance: character.appearance || legacyVisualPrompt(character),
    abilities: character.abilities,
    relations: character.relations,
    arc: character.arc ?? '',
    visualNegativePrompt: character.visualNegativePrompt ?? '',
    referenceAssetIds: character.referenceAssetIds ?? [],
  });
  const [referenceAssets, setReferenceAssets] = useState<MediaAsset[]>([]);

  const update = <K extends keyof typeof form>(key: K, val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  useEffect(() => {
    let cancelled = false;
    const ids = form.referenceAssetIds ?? [];
    if (!ids.length) {
      queueMicrotask(() => {
        if (!cancelled) setReferenceAssets([]);
      });
      return () => {
        cancelled = true;
      };
    }
    void Promise.all(ids.map((id) => storage.mediaAssets.get(id))).then((assets) => {
      if (cancelled) return;
      setReferenceAssets(assets.filter((asset): asset is MediaAsset => Boolean(asset)));
    });
    return () => {
      cancelled = true;
    };
  }, [form.referenceAssetIds]);

  const handleReferenceUpload = async (files: FileList | null) => {
    if (!files?.length || !character.id) return;
    const uploaded: MediaAsset[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const url = await readFileAsDataUrl(file);
      const asset: MediaAsset = {
        id: uuid(),
        projectId: character.projectId,
        kind: 'character_reference_image',
        url,
        mimeType: file.type,
        sizeBytes: file.size,
        createdAt: Date.now(),
      };
      await storage.mediaAssets.add(asset);
      uploaded.push(asset);
    }
    if (!uploaded.length) return;
    setReferenceAssets((current) => [...current, ...uploaded]);
    setForm((current) => ({
      ...current,
      referenceAssetIds: [...(current.referenceAssetIds ?? []), ...uploaded.map((asset) => asset.id)],
    }));
  };

  const removeReferenceAsset = (assetId: string) => {
    setReferenceAssets((current) => current.filter((asset) => asset.id !== assetId));
    setForm((current) => ({
      ...current,
      referenceAssetIds: (current.referenceAssetIds ?? []).filter((id) => id !== assetId),
    }));
  };

  const handleAIFill = async () => {
    const signal = fillActivity.start('只補目前仍為空白的欄位，既有內容不會覆寫…');
    setAiFilling(true);
    try {
      const filled = await completeCharacterFields({
        current: form,
        worldSetting,
        mainPlot,
        otherCharacters,
      }, signal);
      if (Object.keys(filled).length === 0) {
        throw new Error('AI 沒有回傳任何欄位內容，請檢查 LLM 設定或回應格式');
      }
      setForm((f) => {
        const next = { ...f };
        const textFields = next as unknown as Record<keyof typeof filled, string>;
        for (const [k, v] of Object.entries(filled)) {
          const key = k as keyof typeof filled;
          if (v && !textFields[key]?.trim()) {
            textFields[key] = v;
          }
        }
        return next;
      });
      fillActivity.succeed('空白角色欄位已補齊，請檢查後儲存');
    } catch (e) {
      fillActivity.fail(e);
    } finally {
      setAiFilling(false);
    }
  };

  return (
    <div className="character-editor">
      <header className="character-editor-header">
        <div>
          <h2>{character.id ? (form.name || '未命名角色') : '新增角色'}</h2>
          <span>{character.id ? '編輯角色設定' : '填寫基本資料後儲存角色'}</span>
        </div>
        <div className="character-editor-actions">
          {onDelete && (
            <Button variant="ghost" onClick={onDelete} style={{ color: 'var(--danger, #e03131)' }}>
              刪除
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={handleAIFill}
            disabled={aiFilling || !llmReady}
            title={!llmReady ? '請先到偏好設定填寫 LLM provider 與 API Key' : '根據已填寫的欄位，AI 補完其餘空白欄位'}
          >
            {aiFilling ? '生成中...' : '✨ AI 填寫內容'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={aiFilling}>取消</Button>
          <Button variant="primary" onClick={() => onSave(form)} disabled={aiFilling}>儲存</Button>
        </div>
      </header>

      <nav className="character-editor-tabs" aria-label="角色設定分類">
        {([
          ['basic', '基本資料'],
          ['story', '故事設定'],
          ['visual', '漫畫視覺'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="character-editor-content">
        {fillActivity.activity.phase !== 'idle' && (
          <LocalAIActivityCard
            activity={fillActivity.activity}
            title="AI 助理補完角色欄位"
            message="只補目前仍為空白的欄位，既有內容不會覆寫…"
            onCancel={fillActivity.cancel}
            onDismiss={fillActivity.reset}
            compact
          />
        )}

        {activeTab === 'basic' && (
          <div className="character-form-grid character-basic-form">
            <Input label="姓名" value={form.name} onChange={(e) => update('name', e.target.value)} />
            <Input label="種族" value={form.race} onChange={(e) => update('race', e.target.value)} />
            <Input label="性別" value={form.gender} onChange={(e) => update('gender', e.target.value)} />
            <Input label="年齡" value={form.age} onChange={(e) => update('age', e.target.value)} />
            <div className="character-form-wide">
              <Textarea label="性格" value={form.personality} onChange={(e) => update('personality', e.target.value)} />
            </div>
          </div>
        )}

        {activeTab === 'story' && (
          <div className="character-form-grid character-story-form">
            <Textarea label="背景" value={form.background} onChange={(e) => update('background', e.target.value)} />
            <Textarea label="能力" value={form.abilities} onChange={(e) => update('abilities', e.target.value)} />
            <Textarea label="關係" value={form.relations} onChange={(e) => update('relations', e.target.value)} />
            <Textarea
              label="成長弧線"
              value={form.arc}
              onChange={(e) => update('arc', e.target.value)}
              placeholder="從故事開頭到結局，此角色的內在轉變（與主線劇情相呼應）..."
            />
          </div>
        )}

        {activeTab === 'visual' && (
          <div className="character-visual-layout">
            <section className="character-visual-fields">
              <Textarea
                label="外貌"
                value={form.appearance}
                onChange={(e) => update('appearance', e.target.value)}
                placeholder="固定髮型、臉部特徵、體型、服裝與標誌物..."
              />
              <Textarea
                label="角色 Negative Prompt"
                value={form.visualNegativePrompt}
                onChange={(e) => update('visualNegativePrompt', e.target.value)}
                placeholder="只填要排除的錯誤外觀..."
              />
              <p className="character-visual-note">故事生成與漫畫生圖都會使用外貌欄位；漫畫生圖會將它作為角色視覺 prompt。</p>
            </section>
            <section className="character-reference-panel">
              <div>
                <strong>角色參考圖</strong>
                <span>{referenceAssets.length} 張圖片</span>
              </div>
              {character.id ? (
                <>
                  <input
                    className="form-input"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => void handleReferenceUpload(event.target.files)}
                  />
                  <div className="character-reference-grid">
                    {referenceAssets.map((asset, index) => (
                      <figure className="character-reference-card" key={asset.id}>
                        {asset.url && <img src={asset.url} alt={`${form.name || '角色'}參考圖 ${index + 1}`} />}
                        <figcaption>
                          <span>{index === 0 ? '主參考' : `參考 ${index + 1}`}</span>
                          <button type="button" onClick={() => removeReferenceAsset(asset.id)}>移除</button>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                  {referenceAssets.length === 0 && (
                    <div className="character-reference-empty">尚未加入角色參考圖</div>
                  )}
                </>
              ) : (
                <div className="character-reference-empty">先儲存新角色，再加入參考圖。</div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('讀取圖片失敗'));
    reader.readAsDataURL(file);
  });
}

function legacyVisualPrompt(character: Character): string {
  return typeof (character as { visualPrompt?: unknown }).visualPrompt === 'string'
    ? ((character as { visualPrompt?: string }).visualPrompt ?? '')
    : '';
}
