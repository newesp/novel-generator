import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { highlightSnippet } from './highlight';

function renderText(node: React.ReactNode): string {
  return renderToString(<>{node}</>);
}

describe('highlightSnippet', () => {
  it('passes plain text through unchanged', () => {
    const out = renderText(highlightSnippet('沒有標記的純文字'));
    expect(out).toBe('沒有標記的純文字');
  });

  it('wraps single <<<x>>> as <mark>', () => {
    const out = renderText(highlightSnippet('前文<<<老王>>>後文'));
    expect(out).toBe('前文<mark>老王</mark>後文');
  });

  it('handles multiple marks', () => {
    const out = renderText(highlightSnippet('A<<<x>>>B<<<y>>>C'));
    expect(out).toBe('A<mark>x</mark>B<mark>y</mark>C');
  });

  it('escapes HTML special chars in surrounding text', () => {
    const out = renderText(highlightSnippet('<script>'));
    // renderToString 自動 escape
    expect(out).toBe('&lt;script&gt;');
  });

  it('handles ellipsis from SQLite snippet()', () => {
    const out = renderText(highlightSnippet('…前段<<<關鍵>>>後段…'));
    expect(out).toBe('…前段<mark>關鍵</mark>後段…');
  });

  it('empty string yields empty node', () => {
    const out = renderText(highlightSnippet(''));
    expect(out).toBe('');
  });
});
