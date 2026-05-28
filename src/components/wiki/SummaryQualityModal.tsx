import { useMemo, useState } from 'react';
import type { Chapter, Character, WikiPage } from '../../types';
import { buildSummaryRebuildPlan, type SummaryRebuildPlanItem } from '../../lib/wiki-summary-quality';
import { rebuildChapterSummary } from '../../lib/wiki-summary-rebuild';
import { isLLMReady } from '../../lib/llm';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  chapters: Chapter[];
  characters: Character[];
  pages: WikiPage[];
  onChanged: () => Promise<void>;
}

const REASON_LABEL: Record<string, string> = {
  'missing-summary': '缺少摘要',
  'slug-mismatch': 'slug 與章節序不一致',
  'title-mismatch': '標題與章節不一致',
  'too-short': '內容過短',
  'weak-story-signals': '缺少事件/伏筆訊號',
};

export function SummaryQualityModal({ open, onClose, chapters, characters, pages, onChanged }: Props) {
  const { llmConfig } = useSettingsStore();
  const [runningId, setRunningId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const ready = isLLMReady(llmConfig);
  const plan = useMemo(
    () => buildSummaryRebuildPlan({
      chapters,
      summaryPages: pages.filter((page) => page.type === 'summary'),
    }),
    [chapters, pages],
  );

  const rebuild = async (item: SummaryRebuildPlanItem) => {
    if (!ready) return;
    setRunningId(item.chapter.id);
    setMessage('');
    try {
      await rebuildChapterSummary({ chapter: item.chapter, characters });
      await onChanged();
      setMessage(`已重建 summary/${item.slug}`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setRunningId(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="摘要品質檢查" width={760}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          檢查 Wiki summary/ch-N 是否缺失、過短或與章節標題不一致。重建會更新 Wiki summary page，並寫入 wiki_log。
        </div>
        {!ready && (
          <div style={{ fontSize: 12, color: 'var(--accent-danger)' }}>
            重建需要 LLM API 設定；品質檢查可離線使用。
          </div>
        )}
        {message && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{message}</div>}
        {plan.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--text-tertiary)', border: '1px solid var(--border)', borderRadius: 6 }}>
            目前沒有需要重建的摘要。
          </div>
        ) : (
          <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
            {plan.map((item) => (
              <div
                key={item.chapter.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 12,
                  padding: 10,
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    第 {item.chapter.order + 1} 章｜{item.chapter.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>
                    summary/{item.slug} · {item.quality.status}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.5 }}>
                    {item.quality.reasons.map((reason) => REASON_LABEL[reason] ?? reason).join('、')}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => rebuild(item)}
                  disabled={!ready || runningId !== null}
                >
                  {runningId === item.chapter.id ? '重建中...' : '重建'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
