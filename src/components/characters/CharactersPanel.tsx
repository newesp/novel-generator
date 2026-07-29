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
import { t } from '../../lib/language-policy';

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
  const { llmConfig, generalPrefs } = useSettingsStore();
  const locale = generalPrefs.interfaceLocale;
  const [editing, setEditing] = useState<Character | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiCount, setAiCount] = useState<number | ''>(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const characterDraftActivity = useLocalAIActivity(locale);
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
    if (!confirm(t('characters.deleteSelectedConfirm', { count: selectedCharacterIds.size }, locale))) return;
    for (const id of selectedCharacterIds) {
      await deleteCharacter(id);
    }
    setSelected(new Set());
  };

  if (!project) {
    return (
      <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>
        {t('characters.noProject', undefined, locale)}
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
    if (!confirm(t('characters.deleteOneConfirm', { name: editing.name }, locale))) return;
    await deleteCharacter(editing.id);
    setEditing(null);
  };

  const apiReady = isLLMReady(llmConfig);
  const outlineReady = !!(project.worldSetting || project.mainPlot);

  const handleAIGenerate = async () => {
    const requestedCount = typeof aiCount === 'number' ? aiCount : 1;
    const signal = characterDraftActivity.start(
      t('characters.designActivityMessage', undefined, locale),
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
        throw new Error(t('characters.generatedEmpty', undefined, locale));
      }

      const newDrafts = filterNewCharacterDrafts(drafts, characters.map((c) => c.name));
      if (newDrafts.length === 0) {
        throw new Error(t('characters.generatedDuplicate', undefined, locale));
      }

      for (const draft of newDrafts) {
        await createCharacter(project.id, draft);
      }
      characterDraftActivity.succeed(t('characters.generatedSuccess', { count: newDrafts.length }, locale));
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
            <h2>{t('characters.title', undefined, locale)}</h2>
            <span>{t('characters.count', { count: characters.length }, locale)}</span>
          </div>
          <div className="character-view-toggle" aria-label={t('characters.viewMode', undefined, locale)}>
            {([
              ['list', t('characters.list', undefined, locale)],
              ['graph', t('characters.graph', undefined, locale)],
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
              !apiReady ? t('characters.apiRequired', undefined, locale)
              : !outlineReady ? t('characters.outlineRequired', undefined, locale)
              : ''
            }
          >
            {t('characters.aiGenerate', undefined, locale)}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setViewMode('list');
              setEditing(EMPTY_CHARACTER(project.id));
            }}
          >
            {t('characters.add', undefined, locale)}
          </Button>
        </div>

        <input
          className="form-input character-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('characters.searchPlaceholder', undefined, locale)}
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
              {t('characters.selectAll', undefined, locale)}
            </label>
            <span>{t('characters.selected', { count: selectedCharacterIds.size }, locale)}</span>
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={selectedCharacterIds.size === 0}
            >
              {t('common.delete', undefined, locale)}
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
                <div className="char-item-name">{char.name || t('characters.unnamed', undefined, locale)}</div>
                <div className="char-item-meta">
                  {[char.gender, char.age && t('characters.age', { age: char.age }, locale), char.race && t('characters.race', { race: char.race }, locale)]
                    .filter(Boolean)
                    .join(' · ') || t('characters.noBasicInfo', undefined, locale)}
                </div>
              </div>
            </div>
          ))}
          {characters.length === 0 && (
            <div className="character-list-empty">{t('characters.empty', undefined, locale)}</div>
          )}
          {characters.length > 0 && filteredCharacters.length === 0 && (
            <div className="character-list-empty">{t('characters.noMatch', undefined, locale)}</div>
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
            <strong>{t('characters.selectToEdit', undefined, locale)}</strong>
            <span>{t('characters.selectToEditHelp', undefined, locale)}</span>
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
        title={t('characters.generateTitle', undefined, locale)}
        footer={
          <>
            <Button variant="secondary" onClick={() => {
              setShowAIModal(false);
              characterDraftActivity.reset();
            }} disabled={isGenerating}>
              {t('common.cancel', undefined, locale)}
            </Button>
            <Button variant="primary" onClick={handleAIGenerate} disabled={isGenerating || typeof aiCount !== 'number' || aiCount < 1}>
              {isGenerating
                ? t('characters.generateBusy', undefined, locale)
                : t('characters.generateCount', { count: aiCount || 1 }, locale)}
            </Button>
          </>
        }
      >
        {characterDraftActivity.activity.phase !== 'idle' && (
          <LocalAIActivityCard
            activity={characterDraftActivity.activity}
            title={t('characters.designActivityTitle', { count: typeof aiCount === 'number' ? aiCount : 1 }, locale)}
            message={t('characters.designActivityMessage', undefined, locale)}
            onCancel={characterDraftActivity.cancel}
            onDismiss={characterDraftActivity.reset}
            compact
          />
        )}
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
          {t('characters.generationIntro', undefined, locale)}
          <br />
          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            {t('characters.generationDetail', undefined, locale)}
          </span>
          {characters.length > 0 && (
            <><br /><span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{t('characters.existingContext', undefined, locale)}</span></>
          )}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13 }}>{t('characters.minimumCount', undefined, locale)}</label>
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
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('characters.countRecommendation', undefined, locale)}</span>
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
  const locale = useSettingsStore((state) => state.generalPrefs.interfaceLocale);
  const writingLanguage = useProjectStore((state) => state.project?.writingLanguage ?? 'zh-Hant');
  const [aiFilling, setAiFilling] = useState(false);
  const fillActivity = useLocalAIActivity(locale);
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
      const url = await readFileAsDataUrl(file, t('characters.imageReadFailed', undefined, locale));
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
    const signal = fillActivity.start(t('characters.aiFillActivityMessage', undefined, locale));
    setAiFilling(true);
    try {
      const filled = await completeCharacterFields({
        current: form,
        worldSetting,
        mainPlot,
        otherCharacters,
        writingLanguage,
      }, signal);
      if (Object.keys(filled).length === 0) {
        throw new Error(t('characters.aiFillEmpty', undefined, locale));
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
      fillActivity.succeed(t('characters.aiFillSuccess', undefined, locale));
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
          <h2>{character.id ? (form.name || t('characters.unnamed', undefined, locale)) : t('characters.newCharacter', undefined, locale)}</h2>
          <span>{character.id ? t('characters.editSubtitle', undefined, locale) : t('characters.newSubtitle', undefined, locale)}</span>
        </div>
        <div className="character-editor-actions">
          {onDelete && (
            <Button variant="ghost" onClick={onDelete} style={{ color: 'var(--danger, #e03131)' }}>
              {t('common.delete', undefined, locale)}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={handleAIFill}
            disabled={aiFilling || !llmReady}
            title={!llmReady
              ? t('characters.aiFillRequired', undefined, locale)
              : t('characters.aiFillHelp', undefined, locale)}
          >
            {aiFilling ? t('characters.aiFillBusy', undefined, locale) : t('characters.aiFill', undefined, locale)}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={aiFilling}>{t('common.cancel', undefined, locale)}</Button>
          <Button variant="primary" onClick={() => onSave(form)} disabled={aiFilling}>{t('common.save', undefined, locale)}</Button>
        </div>
      </header>

      <nav className="character-editor-tabs" aria-label={t('characters.tabsLabel', undefined, locale)}>
        {([
          ['basic', t('characters.tabBasic', undefined, locale)],
          ['story', t('characters.tabStory', undefined, locale)],
          ['visual', t('characters.tabVisual', undefined, locale)],
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
            title={t('characters.aiFillActivityTitle', undefined, locale)}
            message={t('characters.aiFillActivityMessage', undefined, locale)}
            onCancel={fillActivity.cancel}
            onDismiss={fillActivity.reset}
            compact
          />
        )}

        {activeTab === 'basic' && (
          <div className="character-form-grid character-basic-form">
            <Input label={t('characters.name', undefined, locale)} value={form.name} onChange={(e) => update('name', e.target.value)} />
            <Input label={t('characters.raceLabel', undefined, locale)} value={form.race} onChange={(e) => update('race', e.target.value)} />
            <Input label={t('characters.gender', undefined, locale)} value={form.gender} onChange={(e) => update('gender', e.target.value)} />
            <Input label={t('characters.ageLabel', undefined, locale)} value={form.age} onChange={(e) => update('age', e.target.value)} />
            <div className="character-form-wide">
              <Textarea label={t('characters.personality', undefined, locale)} value={form.personality} onChange={(e) => update('personality', e.target.value)} />
            </div>
          </div>
        )}

        {activeTab === 'story' && (
          <div className="character-form-grid character-story-form">
            <Textarea label={t('characters.background', undefined, locale)} value={form.background} onChange={(e) => update('background', e.target.value)} />
            <Textarea label={t('characters.abilities', undefined, locale)} value={form.abilities} onChange={(e) => update('abilities', e.target.value)} />
            <Textarea label={t('characters.relations', undefined, locale)} value={form.relations} onChange={(e) => update('relations', e.target.value)} />
            <Textarea
              label={t('characters.arc', undefined, locale)}
              value={form.arc}
              onChange={(e) => update('arc', e.target.value)}
              placeholder={t('characters.arcPlaceholder', undefined, locale)}
            />
          </div>
        )}

        {activeTab === 'visual' && (
          <div className="character-visual-layout">
            <section className="character-visual-fields">
              <Textarea
                label={t('characters.appearance', undefined, locale)}
                value={form.appearance}
                onChange={(e) => update('appearance', e.target.value)}
                placeholder={t('characters.appearancePlaceholder', undefined, locale)}
              />
              <Textarea
                label={t('characters.negativePrompt', undefined, locale)}
                value={form.visualNegativePrompt}
                onChange={(e) => update('visualNegativePrompt', e.target.value)}
                placeholder={t('characters.negativePromptPlaceholder', undefined, locale)}
              />
              <p className="character-visual-note">{t('characters.visualNote', undefined, locale)}</p>
            </section>
            <section className="character-reference-panel">
              <div>
                <strong>{t('characters.references', undefined, locale)}</strong>
                <span>{t('characters.referenceCount', { count: referenceAssets.length }, locale)}</span>
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
                        {asset.url && <img src={asset.url} alt={t('characters.referenceAlt', {
                          name: form.name || t('characters.title', undefined, locale),
                          index: index + 1,
                        }, locale)} />}
                        <figcaption>
                          <span>{index === 0
                            ? t('characters.primaryReference', undefined, locale)
                            : t('characters.reference', { index: index + 1 }, locale)}</span>
                          <button type="button" onClick={() => removeReferenceAsset(asset.id)}>{t('characters.remove', undefined, locale)}</button>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                  {referenceAssets.length === 0 && (
                    <div className="character-reference-empty">{t('characters.noReferences', undefined, locale)}</div>
                  )}
                </>
              ) : (
                <div className="character-reference-empty">{t('characters.saveBeforeReferences', undefined, locale)}</div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File, errorMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error(errorMessage));
    reader.readAsDataURL(file);
  });
}

function legacyVisualPrompt(character: Character): string {
  return typeof (character as { visualPrompt?: unknown }).visualPrompt === 'string'
    ? ((character as { visualPrompt?: string }).visualPrompt ?? '')
    : '';
}
