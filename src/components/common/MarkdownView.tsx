import ReactMarkdown from 'react-markdown';
import { t } from '../../lib/language-policy';
import { useSettingsStore } from '../../stores/settingsStore';

/**
 * 統一的 Markdown 預覽元件。
 * 套用編輯器/設定 Modal 共用的樣式（class="markdown-body"）。
 */
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  const locale = useSettingsStore((state) => state.generalPrefs.interfaceLocale);
  return (
    <div className={`markdown-body${className ? ' ' + className : ''}`}>
      {source.trim()
        ? <ReactMarkdown>{source}</ReactMarkdown>
        : <p className="markdown-empty">{t('editorTabs.empty', undefined, locale)}</p>
      }
    </div>
  );
}
