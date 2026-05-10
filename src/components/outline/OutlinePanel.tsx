import { useEffect, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../common/Button';
import { complete } from '../../lib/llm';

const GENRES = ['玄幻', '都市', '仙俠', '科幻', '言情', '懸疑', '自定義'];
const STYLES = ['輕鬆', '沉重', '黑暗', '熱血', '幽默', '爽文', '自定義'];

export function OutlinePanel() {
  const { project, updateProject } = useProjectStore();
  const { llmConfig } = useSettingsStore();
  const [genre, setGenre] = useState('');
  const [style, setStyle] = useState('');
  const [title, setTitle] = useState('');
  const [worldSetting, setWorldSetting] = useState('');
  const [mainPlot, setMainPlot] = useState('');
  const [genWorldBusy, setGenWorldBusy] = useState(false);
  const [saveLabel, setSaveLabel] = useState('💾 儲存大綱');

  useEffect(() => {
    if (project) {
      setTitle(project.title);
      setGenre(project.genre);
      setStyle(project.style);
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

  const apiReady = !!(llmConfig.apiKey && llmConfig.baseUrl);

  // 是否有未儲存的變更（任一欄位與 DB 中的值不同）
  const isDirty =
    title !== project.title ||
    genre !== project.genre ||
    style !== project.style ||
    worldSetting !== project.worldSetting ||
    mainPlot !== project.mainPlot;

  const save = async () => {
    try {
      await updateProject(project.id, { title, genre, style, worldSetting, mainPlot });
      setSaveLabel('✅ 已儲存');
      setTimeout(() => setSaveLabel('💾 儲存大綱'), 1500);
    } catch (err) {
      alert(`儲存失敗：${(err as Error).message}`);
    }
  };

  const generateWorld = async () => {
    if (!genre && !style) {
      alert('請先選擇題材或風格');
      return;
    }
    setGenWorldBusy(true);
    try {
      const prompt = `請為一部「${genre || '未指定'}」題材、「${style || '未指定'}」風格的中文小說，依照以下格式輸出，標記不可省略：

##WORLD_START##
（在此撰寫世界觀設定：地域架構、世界規則、主要勢力格局，300字以內）
##WORLD_END##

##PLOT_START##
（在此撰寫主線劇情架構：核心衝突、主角目標、三幕轉折、結局走向，300字以內）
##PLOT_END##`;

      const result = await complete(prompt);

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
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setGenWorldBusy(false);
    }
  };

  return (
    <div className="tab-panel">
      <div className="section">
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
          <label className="form-label">題材</label>
          <input
            className="form-input"
            list="genre-list"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            placeholder="點擊選擇或輸入..."
          />
          <datalist id="genre-list">
            {GENRES.map((g) => <option key={g} value={g} />)}
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
            {STYLES.map((s) => <option key={s} value={s} />)}
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
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '6px 0 0' }}>
            請先在工具列「🔑 API 設定」中設定 LLM endpoint 與 API Key
          </p>
        )}
      </div>

      <div className="section">
        <div className="section-title">世界觀設定</div>
        <textarea
          className="form-textarea"
          value={worldSetting}
          onChange={(e) => setWorldSetting(e.target.value)}
          placeholder="描述故事發生的世界、規則、勢力格局..."
          style={{ minHeight: 100 }}
        />
      </div>

      <div className="section">
        <div className="section-title">主線劇情架構</div>
        <textarea
          className="form-textarea"
          value={mainPlot}
          onChange={(e) => setMainPlot(e.target.value)}
          placeholder="概述故事主線走向與核心衝突..."
          style={{ minHeight: 100 }}
        />
      </div>

      <div className="section" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
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
    </div>
  );
}
