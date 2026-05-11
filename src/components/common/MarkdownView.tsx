import ReactMarkdown from 'react-markdown';

/**
 * 統一的 Markdown 預覽元件。
 * 套用編輯器/設定 Modal 共用的樣式（class="markdown-body"）。
 */
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  return (
    <div className={`markdown-body${className ? ' ' + className : ''}`}>
      {source.trim()
        ? <ReactMarkdown>{source}</ReactMarkdown>
        : <p className="markdown-empty">（空白）</p>
      }
    </div>
  );
}
