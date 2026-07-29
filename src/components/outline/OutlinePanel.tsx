import { useEffect, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../common/Button';
import { complete, isLLMReady } from '../../lib/llm';
import { useLocalAIActivity } from '../../hooks/useLocalAIActivity';
import { LocalAIActivityCard } from '../common/LocalAIActivityCard';
import { GENRE_PRESETS, STYLE_PRESETS, normalizeGenre, normalizeStyle, resolveGenreLabel, resolveStyleLabel, t } from '../../lib/language-policy';

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
  const [justSaved, setJustSaved] = useState(false);
  const [fullscreen, setFullscreen] = useState<null | 'world' | 'plot'>(null);
  const worldActivity = useLocalAIActivity(locale);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  useEffect(() => {
    if (project) {
      setTitle(project.title);
      setGenre(resolveGenreLabel(project.genre, locale));
      setStyle(resolveStyleLabel(project.style, locale));
      setWorldSetting(project.worldSetting);
      setMainPlot(project.mainPlot);
    }
  }, [project?.id, locale]);

  if (!project) {
    return (
      <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>
        {t('outline.noProject', undefined, locale)}
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
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err) {
      alert(t('outline.saveFailed', { error: (err as Error).message }, locale));
    }
  };

  const generateWorld = async () => {
    if (!genre && !style) {
      alert(t('outline.selectGenreOrStyle', undefined, locale));
      return;
    }
    const signal = worldActivity.start(t('outline.activityMessage', undefined, locale));
    setGenWorldBusy(true);
    try {
      const prompt = project.writingLanguage === 'en'
        ? `Create a world setting and main plot for an English-language ${genre || 'unspecified genre'} novel in a ${style || 'unspecified style'}. Use the exact markers below:

##WORLD_START##
(Write the world setting: geography, world rules, and major factions, within 250 words.)
##WORLD_END##

##PLOT_START##
(Write the main plot structure: core conflict, protagonist goal, three-act turning points, and ending direction, within 250 words.)
##PLOT_END##`
        : `請為一部「${genre || '未指定'}」題材、「${style || '未指定'}」風格的繁體中文小說，依照以下格式輸出，標記不可省略：

##WORLD_START##
（在此撰寫世界觀設定：地域架構、世界規則、主要勢力格局，300字以內）
##WORLD_END##

##PLOT_START##
（在此撰寫主線劇情架構：核心衝突、主角目標、三幕轉折、結局走向，300字以內）
##PLOT_END##`;

      const result = await complete(prompt, { writingLanguage: project.writingLanguage }, signal);

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
      worldActivity.succeed(t('outline.activitySuccess', undefined, locale));
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
          <div className="section-title">{t('outline.basicSettings', undefined, locale)}</div>
          <div className="form-group">
            <label className="form-label">{t('outline.bookTitle', undefined, locale)}</label>
            <input
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={save}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('outline.writingLanguage', undefined, locale)}</label>
            <div className="form-input" style={{ background: 'var(--bg-tertiary, #1f2937)', color: 'var(--text-secondary, #9ca3af)', cursor: 'not-allowed', display: 'flex', alignItems: 'center' }}>
              🔒 {project.writingLanguage === 'en'
                ? t('general.enWriting', undefined, locale)
                : t('general.zhHantWriting', undefined, locale)}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('outline.genre', undefined, locale)}</label>
            <input
              className="form-input"
              list="genre-list"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder={t('common.selectOrType', undefined, locale)}
            />
            <datalist id="genre-list">
              {GENRE_PRESETS.map((g) => (
                <option key={g.code} value={locale === 'en' ? g.labelEn : g.labelZh} />
              ))}
            </datalist>
          </div>
          <div className="form-group">
            <label className="form-label">{t('outline.style', undefined, locale)}</label>
            <input
              className="form-input"
              list="style-list"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder={t('common.selectOrType', undefined, locale)}
            />
            <datalist id="style-list">
              {STYLE_PRESETS.map((s) => (
                <option key={s.code} value={locale === 'en' ? s.labelEn : s.labelZh} />
              ))}
            </datalist>
          </div>
          <Button
            variant="primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={generateWorld}
            disabled={genWorldBusy || !apiReady || (!genre && !style)}
            title={
              !apiReady ? t('outline.apiRequired', undefined, locale)
              : (!genre && !style) ? t('outline.genreOrStyleRequired', undefined, locale)
              : ''
            }
          >
            {genWorldBusy ? t('outline.generateBusy', undefined, locale) : t('outline.generate', undefined, locale)}
          </Button>
          {!apiReady && (
            <p className="outline-api-note">
              {t('outline.apiSetupHint', undefined, locale)}
            </p>
          )}
        </div>
        <div className="outline-save-bar">
          <Button
            variant="secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={save}
            disabled={!isDirty}
            title={!isDirty ? t('outline.noChanges', undefined, locale) : ''}
          >
            {isDirty
              ? (justSaved ? t('outline.saved', undefined, locale) : t('outline.save', undefined, locale))
              : t('outline.saved', undefined, locale)}
          </Button>
        </div>
      </aside>

      <div className={`outline-editors${worldActivity.activity.phase !== 'idle' ? ' has-activity' : ''}`}>
        {worldActivity.activity.phase !== 'idle' && (
          <div className="outline-ai-activity">
            <LocalAIActivityCard
              activity={worldActivity.activity}
              title={t('outline.activityTitle', undefined, locale)}
              message={t('outline.activityMessage', undefined, locale)}
              onCancel={worldActivity.cancel}
              onDismiss={worldActivity.reset}
              compact
            />
          </div>
        )}
        <section className="outline-editor">
          <div className="outline-editor-header">
            <div>
              <div className="section-title">{t('outline.worldTitle', undefined, locale)}</div>
              <p>{t('outline.worldDescription', undefined, locale)}</p>
            </div>
            <button
              type="button"
              onClick={() => setFullscreen('world')}
              title={t('outline.fullscreen', undefined, locale)}
              aria-label={t('outline.fullscreenWorld', undefined, locale)}
            >⛶</button>
          </div>
          <textarea
            className="form-textarea outline-editor-textarea"
            value={worldSetting}
            onChange={(e) => setWorldSetting(e.target.value)}
            placeholder={t('outline.worldPlaceholder', undefined, locale)}
          />
        </section>

        <section className="outline-editor">
          <div className="outline-editor-header">
            <div>
              <div className="section-title">{t('outline.plotTitle', undefined, locale)}</div>
              <p>{t('outline.plotDescription', undefined, locale)}</p>
            </div>
            <button
              type="button"
              onClick={() => setFullscreen('plot')}
              title={t('outline.fullscreen', undefined, locale)}
              aria-label={t('outline.fullscreenPlot', undefined, locale)}
            >⛶</button>
          </div>
          <textarea
            className="form-textarea outline-editor-textarea"
            value={mainPlot}
            onChange={(e) => setMainPlot(e.target.value)}
            placeholder={t('outline.plotPlaceholder', undefined, locale)}
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
              {fullscreen === 'world'
                ? t('outline.worldTitle', undefined, locale)
                : t('outline.plotTitle', undefined, locale)}
            </div>
            <Button variant="secondary" onClick={() => setFullscreen(null)}>
              {t('outline.exitFullscreen', undefined, locale)}
            </Button>
          </div>
          <textarea
            autoFocus
            className="form-textarea"
            value={fullscreen === 'world' ? worldSetting : mainPlot}
            onChange={(e) => (fullscreen === 'world' ? setWorldSetting(e.target.value) : setMainPlot(e.target.value))}
            placeholder={fullscreen === 'world'
              ? t('outline.worldPlaceholder', undefined, locale)
              : t('outline.plotPlaceholder', undefined, locale)}
            style={{ flex: 1, width: '100%', resize: 'none', fontSize: 15, lineHeight: 1.7 }}
          />
        </div>
      )}

    </div>
  );
}
