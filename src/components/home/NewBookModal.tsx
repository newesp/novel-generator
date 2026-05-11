import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

const GENRES = ['玄幻', '都市', '仙俠', '科幻', '言情', '懸疑', '自定義'];
const STYLES = ['輕鬆', '沉重', '黑暗', '熱血', '幽默', '爽文', '自定義'];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, genre: string, style: string) => Promise<void>;
}

export function NewBookModal({ open, onClose, onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [style, setStyle] = useState('');
  const [loading, setLoading] = useState(false);
  const [titleError, setTitleError] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    setTitleError(false);
    setLoading(true);
    try {
      await onCreate(title.trim(), genre, style);
      // reset form (component may be unmounted by here — that's fine)
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
      title="新增書本"
      width={440}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>取消</Button>
          <Button variant="primary" onClick={handleCreate} disabled={loading}>
            {loading ? '建立中...' : '建立'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 書名 */}
        <div>
          <label className="form-label">書名<span style={{ color: '#f87171', marginLeft: 2 }}>*</span></label>
          <input
            className="form-input"
            placeholder="輸入書名（必填）"
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
            <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>請輸入書名</div>
          )}
        </div>

        {/* 題材 */}
        <div>
          <label className="form-label">題材</label>
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
          <label className="form-label">風格</label>
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
