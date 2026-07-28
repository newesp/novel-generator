import { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useSettingsStore } from '../../stores/settingsStore';
import { t, type WritingLanguage } from '../../lib/language-policy';

const GENRES = ['玄幻', '都市', '仙俠', '科幻', '言情', '懸疑', '自定義'];
const STYLES = ['輕鬆', '沉重', '黑暗', '熱血', '幽默', '爽文', '自定義'];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, genre: string, style: string, writingLanguage: WritingLanguage) => Promise<void>;
}

export function NewBookModal({ open, onClose, onCreate }: Props) {
  const { generalPrefs } = useSettingsStore();
  const locale = generalPrefs.interfaceLocale;

  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [style, setStyle] = useState('');
  const [writingLanguage, setWritingLanguage] = useState<WritingLanguage>(generalPrefs.defaultWritingLanguage || 'zh-Hant');
  const [loading, setLoading] = useState(false);
  const [titleError, setTitleError] = useState(false);

  useEffect(() => {
    if (open) {
      setWritingLanguage(generalPrefs.defaultWritingLanguage || 'zh-Hant');
    }
  }, [open, generalPrefs.defaultWritingLanguage]);

  const handleCreate = async () => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    setTitleError(false);
    setLoading(true);
    try {
      await onCreate(title.trim(), genre, style, writingLanguage);
      setTitle('');
      setGenre('');
      setStyle('');
    } catch (err) {
      alert(`建立失敗：${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setGenre('');
    setStyle('');
    setTitleError(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('home.createTitle', undefined, locale)}
      width={460}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            {t('common.cancel', undefined, locale)}
          </Button>
          <Button variant="primary" onClick={handleCreate} disabled={loading}>
            {loading ? t('common.loading', undefined, locale) : t('common.create', undefined, locale)}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 書名 */}
        <div>
          <label className="form-label">
            {t('home.bookTitlePlaceholder', undefined, locale).replace('...', '')}
            <span style={{ color: '#f87171', marginLeft: 2 }}>*</span>
          </label>
          <input
            className="form-input"
            placeholder={t('home.bookTitlePlaceholder', undefined, locale)}
            value={title}
            autoFocus
            style={titleError ? { borderColor: '#f87171' } : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              if (e.target.value.trim()) setTitleError(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          {titleError && (
            <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>
              {t('home.bookTitlePlaceholder', undefined, locale)}
            </div>
          )}
        </div>

        {/* 創作語言 Writing Language */}
        <div>
          <label className="form-label">{t('home.writingLanguageLabel', undefined, locale)}</label>
          <select
            className="form-input"
            value={writingLanguage}
            onChange={(e) => setWritingLanguage(e.target.value as WritingLanguage)}
          >
            <option value="zh-Hant">{t('general.zhHantWriting', undefined, locale)}</option>
            <option value="en">{t('general.enWriting', undefined, locale)}</option>
          </select>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {t('home.writingLanguageHelp', undefined, locale)}
          </div>
        </div>

        {/* 題材 */}
        <div>
          <label className="form-label">{t('home.genre', undefined, locale)}</label>
          <input
            list="genre-list"
            className="form-input"
            placeholder="點擊選擇或輸入自定義..."
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
          />
          <datalist id="genre-list">
            {GENRES.map((g) => <option key={g} value={g} />)}
          </datalist>
        </div>

        {/* 風格 */}
        <div>
          <label className="form-label">{t('home.style', undefined, locale)}</label>
          <input
            list="style-list"
            className="form-input"
            placeholder="點擊選擇或輸入自定義..."
            value={style}
            onChange={(e) => setStyle(e.target.value)}
          />
          <datalist id="style-list">
            {STYLES.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
      </div>
    </Modal>
  );
}
