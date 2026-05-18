/**
 * 把 loadWikiForGeneration 的結果格式化為 prompt 的 `{{wikiSection}}` 字串
 *
 * 規範：spec §5.4 輸出格式
 */
import type { WikiLoadResult } from './wiki-loader';

const TYPE_LABEL: Record<string, string> = {
  entity: '角色',
  concept: '概念',
  summary: '章節摘要',
  compare: '對比',
  synthesis: '綜述',
};

export function formatWikiSection(result: WikiLoadResult): string {
  if (result.loadedPages === 0) return '';
  const head = '\n\n### 相關 Wiki 條目\n（以下為本書知識庫，撰寫時請保持一致）\n';
  const body = result.pages.map((p) => {
    const label = TYPE_LABEL[p.type] ?? p.type;
    const aliasNote = p.aliases.length > 0 ? `（別名：${p.aliases.join('、')}）` : '';
    return `\n#### ${label}：${p.title}${aliasNote}\n${p.contentMd}\n`;
  }).join('');
  const warn = result.status === 'ok'
    ? ''
    : `\n\n> ⚠️ 本書 Wiki 規模超出載入預算，已截斷 ${result.truncatedPages} 頁。`
      + (result.status === 'red-truncated'
        ? '請至偏好設定啟用 pick-pages 模式或換用更大 context 的模型。'
        : '若一致性出問題，請至偏好設定啟用 pick-pages 模式。');
  return head + body + warn;
}
