export type EditPreviewMode = 'edit' | 'preview';

interface Props {
  mode: EditPreviewMode;
  onChange: (mode: EditPreviewMode) => void;
  /** 額外的右側元素（例如字數統計） */
  extra?: React.ReactNode;
  className?: string;
}

/**
 * 小型的「編輯 / 預覽」切換 tabs。
 * 套樣式 .edit-preview-tabs / .edit-preview-tab(.active)，於 index.css 定義。
 */
export function EditPreviewTabs({ mode, onChange, extra, className }: Props) {
  return (
    <div className={`edit-preview-tabs${className ? ' ' + className : ''}`}>
      <button
        type="button"
        className={`edit-preview-tab${mode === 'edit' ? ' active' : ''}`}
        onClick={() => onChange('edit')}
      >
        ✏️ 編輯
      </button>
      <button
        type="button"
        className={`edit-preview-tab${mode === 'preview' ? ' active' : ''}`}
        onClick={() => onChange('preview')}
      >
        👁 預覽
      </button>
      {extra && <div className="edit-preview-extra">{extra}</div>}
    </div>
  );
}
