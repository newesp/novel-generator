import { useMemo, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { complete, isLLMReady } from '../../lib/llm';
import { buildWikiQueryPrompt, selectWikiPagesForQuery } from '../../lib/wiki-query';
import { t } from '../../lib/language-policy';
import type { WikiPage } from '../../types';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useLocalAIActivity } from '../../hooks/useLocalAIActivity';
import { LocalAIActivityCard } from '../common/LocalAIActivityCard';

interface Props {
  open: boolean;
  onClose: () => void;
  pages: WikiPage[];
}

export function WikiQueryModal({ open, onClose, pages }: Props) {
  const { llmConfig, aiPrompts, generalPrefs } = useSettingsStore();
  const locale = generalPrefs.interfaceLocale;
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const queryActivity = useLocalAIActivity(locale);
  const selectedPages = useMemo(
    () => question.trim() ? selectWikiPagesForQuery({ question, pages, maxPages: 8 }) : [],
    [question, pages],
  );
  const ready = isLLMReady(llmConfig);

  const ask = async () => {
    if (!ready || !question.trim()) return;
    const signal = queryActivity.start(t('wiki.queryActivityStart', { count: selectedPages.length }, locale));
    setIsRunning(true);
    setAnswer('');
    try {
      const prompt = buildWikiQueryPrompt({
        question,
        pages: selectedPages,
        template: aiPrompts.wikiQueryAnswerTemplate,
      });
      setAnswer(await complete(prompt, { maxTokens: 1600, temperature: 0.2 }, signal));
      queryActivity.succeed(t('wiki.queryActivitySuccess', { count: selectedPages.length }, locale));
    } catch (e) {
      queryActivity.fail(e);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (isRunning) queryActivity.cancel();
        else queryActivity.reset();
        onClose();
      }}
      title={t('wiki.queryTitle', undefined, locale)}
      width={720}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <textarea
          className="form-input"
          rows={3}
          placeholder={t('wiki.queryPlaceholder', undefined, locale)}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {queryActivity.activity.phase !== 'idle' && (
          <LocalAIActivityCard
            activity={queryActivity.activity}
            title={t('wiki.queryActivityTitle', undefined, locale)}
            message={t('wiki.queryActivityStart', { count: selectedPages.length }, locale)}
            onCancel={queryActivity.cancel}
            onDismiss={queryActivity.reset}
            compact
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {t('wiki.querySelectedPages', { count: selectedPages.length }, locale)}
          </div>
          <Button variant="primary" onClick={ask} disabled={!ready || !question.trim() || isRunning}>
            {isRunning ? t('wiki.queryThinking', undefined, locale) : t('wiki.queryButton', undefined, locale)}
          </Button>
        </div>
        {!ready && (
          <div style={{ fontSize: 12, color: 'var(--accent-danger)' }}>
            {t('wiki.queryLlmNotReady', undefined, locale)}
          </div>
        )}
        {selectedPages.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {selectedPages.map((page) => `${page.type}/${page.slug}`).join('、')}
          </div>
        )}
        {answer && (
          <div style={{
            whiteSpace: 'pre-wrap',
            lineHeight: 1.7,
            padding: 12,
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--bg-tertiary)',
          }}>
            {answer}
          </div>
        )}
      </div>
    </Modal>
  );
}
