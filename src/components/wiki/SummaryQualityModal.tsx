import { useMemo, useState } from 'react';
import type { Chapter, Character, WikiPage } from '../../types';
import { buildSummaryRebuildPlan, type SummaryRebuildPlanItem } from '../../lib/wiki-summary-quality';
import { rebuildChapterSummary } from '../../lib/wiki-summary-rebuild';
import { isLLMReady } from '../../lib/llm';
import { useSettingsStore } from '../../stores/settingsStore';
import { t } from '../../lib/language-policy';
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

const getReasonLabel = (reason: string, locale: string): string => {
  const map: Record<string, string> = {
    'missing-summary': t('reason.missingSummary', undefined, locale),
    'slug-mismatch': t('reason.slugMismatch', undefined, locale),
    'title-mismatch': t('reason.titleMismatch', undefined, locale),
    'too-short': t('reason.tooShort', undefined, locale),
    'weak-story-signals': t('reason.weakStorySignals', undefined, locale),
  };
  return map[reason] ?? reason;
};

export function SummaryQualityModal({ open, onClose, chapters, characters, pages, onChanged }: Props) {
  const { llmConfig, generalPrefs } = useSettingsStore();
  const locale = generalPrefs.interfaceLocale;
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
      setMessage(t('wiki.summaryQualityRebuildSuccessItem', { slug: item.slug }, locale));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setRunningId(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('wiki.summaryQualityTitle', undefined, locale)} width={760}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {t('wiki.summaryQualityDesc', undefined, locale)}
        </div>
        {!ready && (
          <div style={{ fontSize: 12, color: 'var(--accent-danger)' }}>
            {t('wiki.summaryQualityLlmNote', undefined, locale)}
          </div>
        )}
        {message && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{message}</div>}
        {plan.length === 0 ? (
          <div style={{ padding: 16, color: 'var(--text-tertiary)', border: '1px solid var(--border)', borderRadius: 6 }}>
            {t('wiki.summaryQualityAllGood', undefined, locale)}
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
                    {t('wiki.chapterLabel', { order: item.chapter.order + 1, title: item.chapter.title }, locale)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>
                    summary/{item.slug} · {item.quality.status}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.5 }}>
                    {item.quality.reasons.map((reason) => getReasonLabel(reason, locale)).join('、')}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => rebuild(item)}
                  disabled={!ready || runningId !== null}
                >
                  {runningId === item.chapter.id ? t('wiki.summaryQualityRebuildingItem', undefined, locale) : t('wiki.summaryQualityRebuildItem', undefined, locale)}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
