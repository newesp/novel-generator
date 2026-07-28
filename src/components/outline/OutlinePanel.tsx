import { useEffect, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../common/Button';
import { complete, isLLMReady } from '../../lib/llm';
import { useLocalAIActivity } from '../../hooks/useLocalAIActivity';
import { LocalAIActivityCard } from '../common/LocalAIActivityCard';
import {
  GENRE_PRESETS,
  STYLE_PRESETS,
  normalizeGenre,
  normalizeStyle,
} from '../../lib/language-policy';

export function OutlinePanel() {
  const { project, updateProject } = useProjectStore();
  const { generalPrefs, llmConfig } = useSettingsStore();
  const locale = generalPrefs.interfaceLocale;

  const [genre, setGenre] = useState('');
  const [style, setStyle] = useState('');
  const [title, setTitle] = useState('');
  const [worldSetting, setWorldSetting] = useState('');
  const [mainPlot, setMainPlot] = useState('');
  const [genWorldBusy, setGenWorldBusy] = useState(false);
  const [saveLabel, setSaveLabel] = useState('💾 儲存大綱');
  const [fullscreen, setFullscreen] = useState<null | 'world' | 'plot'>(null);
  const worldActivity = useLocalAIActivity();

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  useEffect(() => {
    if (project) {
      setTitle(project.title);
      setGenre(normalizeGenre(project.genre));
      setStyle(normalizeStyle(project.style));
      setWorldSetting(project.worldSetting);
      setMainPlot(project.mainPlot);
    }
  }, [project?.id]);

  if (!project) {
    return (
      <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>
        請先在工具列點擊「新建專案」開始
      </div>
    );
  }

  const apiReady = isLLMReady(llmConfig);

  // 是否有未儲存的變更（任一欄位與 DB 中的值不同）
  const isDirty =
    title !== project.title ||
    normalizeGenre(genre) !== normalizeGenre(project.genre) ||
    normalizeStyle(style) !== normalizeStyle(project.style) ||
    worldSetting !== project.worldSetting ||
    mainPlot !== project.mainPlot;

  const save = async () => {
    try {
      const normalizedG = normalizeGenre(genre);
      const normalizedS = normalizeStyle(style);
      await updateProject(project.id, { 
        title, 
        genre: normalizedG, 
        style: normalizedS, 
        worldSetting, 
        mainPlot 
      });
      setSaveLabel('✅ 已儲存');
      setTimeout(() => setSaveLabel('💾 儲存大綱'), 2000);
    } catch (err) {
      alert(`儲存失敗：${(err as Error).message}`);
    }
  };

  const generateWorld = async () => {
    if (!genre && !style) {
      alert('請先選擇題材或風格');
      return;
    }
    const signal = worldActivity.start('依題材與風格整理世界規則、主要勢力與三幕主線…');
    setGenWorldBusy(true);
    try {
      const prompt = `請為一部「${genre || '未指定'}」題材、「${style || '未指定'}」風格的中文小說，依照以下格式輸出，標記不可省略：

##WORLD_START##
（在此撰寫世界觀設定：地域架構、世界規則、主要勢力格局，300字以內）
##WORLD_END##

##PLOT_START##
（在此撰寫主線劇情架構：核心衝突、主角目標、三幕轉折、結局走向，300字以內）
##PLOT_END##`;

      const result = await complete(prompt, undefined, signal);

      const worldMatch = result.match(/##WORLD_START##([\s\S]*?)##WORLD_END##/);
      const plotMatch  = result.match(/##PLOT_START##([\s\S]*?)##PLOT_END##/);

      const worldPart = worldMatch?.[1]?.trim() ?? '';
      const plotPart  = plotMatch?.[1]?.trim() ?? '';

      if (worldPart) setWorldSetting(worldPart);
      if (plotPart)  setMainPlot(plotPart);

      await updateProject(project.id, {
        worldSetting: worldPart || worldSetting,
        mainPlot:     plotPart  || mainPlot,
      });
      worldActivity.succeed('世界觀與主線劇情已更新');
    } catch (err) {
      worldActivity.fail(err);
    } finally {
      setGenWorldBusy(false);
    }
  };

  return (
    <div className="outline-workspace">
      <aside className="outline-basics">
        <div className="outline-basics-content">
          <div className="section-title">基本設定</div>
          <div className="form-group">
            <label className="form-label">書名</label>
            <input
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={save}
            />
          </div>
          <div className="form-group">
            <label className="form-label">創作語言（建書後不可變更）</label>
            <div className="form-input" style={{ background: 'var(--bg-tertiary, #1f2937)', color: 'var(--text-secondary, #9ca3af)', cursor: 'not-allowed', display: 'flex', alignItems: 'center' }}>
              🔒 {project.writingLanguage === 'en' ? 'English (英文)' : '繁體中文 (Traditional Chinese)'}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">題材</label>
            <input
              className="form-input"
              list="genre-list"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="點擊選擇或輸入..."
            />
            <datalist id="genre-list">
              {GENRE_PRESETS.map((g) => (
                <option key={g.code} value={g.code}>
                  {locale === 'en' ? g.labelEn : g.labelZh}
                </option>
              ))}
            </datalist>
          </div>
          <div className="form-group">
            <label className="form-label">風格</label>
            <input
              className="form-input"
              list="style-list"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="點擊選擇或輸入..."
            />
            <datalist id="style-list">
              {STYLE_PRESETS.map((s) => (
                <option key={s.code} value={s.code}>
                  {locale === 'en' ? s.labelEn : s.labelZh}
                </option>
              ))}
            </datalist>
          </div>
          <Button
            variant="primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={generateWorld}
            disabled={genWorldBusy || !apiReady || (!genre && !style)}
            title={
              !apiReady ? '請先設定 API'
              : (!genre && !style) ? '請先填寫題材或風格'
              : ''
            }
          >
            {genWorldBusy ? '✨ 生成中...' : '✨ AI 生成世界觀 / 主線劇情'}
          </Button>
          {!apiReady && (
            <p className="outline-api-note">
              請先在工具列「🔑 API 設定」中設定 LLM endpoint 與 API Key
            </p>
          )}
        </div>
        <div className="outline-save-bar">
          <Button
            variant="secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={save}
            disabled={!isDirty}
            title={!isDirty ? '無變更' : ''}
          >
            {isDirty ? saveLabel : '✅ 已儲存'}
          </Button>
        </div>
      </aside>

      <div className={`outline-editors${worldActivity.activity.phase !== 'idle' ? ' has-activity' : ''}`}>
        {worldActivity.activity.phase !== 'idle' && (
          <div className="outline-ai-activity">
            <LocalAIActivityCard
              activity={worldActivity.activity}
              title="AI 助理生成世界觀與主線"
              message="依題材與風格整理世界規則、主要勢力與三幕主線…"
              onCancel={worldActivity.cancel}
              onDismiss={worldActivity.reset}
              compact
            />
          </div>
        )}
        <section className="outline-editor">
          <div className="outline-editor-header">
            <div>
              <div className="section-title">世界觀設定</div>
              <p>時空背景、制度、規則與世界運作方式</p>
            </div>
            <button
              type="button"
              onClick={() => setFullscreen('world')}
              title="展開全螢幕編輯"
              aria-label="展開世界觀全螢幕編輯"
            >⛶</button>
          </div>
          <textarea
            className="form-textarea outline-editor-textarea"
            value={worldSetting}
            onChange={(e) => setWorldSetting(e.target.value)}
            placeholder="描述故事發生的世界、規則、勢力格局..."
          />
        </section>

        <section className="outline-editor">
          <div className="outline-editor-header">
            <div>
              <div className="section-title">主線劇情架構</div>
              <p>主要衝突、角色目標與故事發展方向</p>
            </div>
            <button
              type="button"
              onClick={() => setFullscreen('plot')}
              title="展開全螢幕編輯"
              aria-label="展開主線劇情全螢幕編輯"
            >⛶</button>
          </div>
          <textarea
            className="form-textarea outline-editor-textarea"
            value={mainPlot}
            onChange={(e) => setMainPlot(e.target.value)}
            placeholder="概述故事主線走向與核心衝突..."
          />
        </section>
      </div>

      {fullscreen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'var(--bg-primary)',
            display: 'flex', flexDirection: 'column', padding: 24, gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>
              {fullscreen === 'world' ? '世界觀設定' : '主線劇情架構'}
            </div>
            <Button variant="secondary" onClick={() => setFullscreen(null)}>✕ 收起 (Esc)</Button>
          </div>
          <textarea
            autoFocus
            className="form-textarea"
            value={fullscreen === 'world' ? worldSetting : mainPlot}
            onChange={(e) => (fullscreen === 'world' ? setWorldSetting(e.target.value) : setMainPlot(e.target.value))}
            placeholder={fullscreen === 'world' ? '描述故事發生的世界、規則、勢力格局...' : '概述故事主線走向與核心衝突...'}
            style={{ flex: 1, width: '100%', resize: 'none', fontSize: 15, lineHeight: 1.7 }}
          />
        </div>
      )}

    </div>
  );
}
