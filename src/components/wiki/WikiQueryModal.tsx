import { useMemo, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { complete, isLLMReady } from '../../lib/llm';
import { buildWikiQueryPrompt, selectWikiPagesForQuery } from '../../lib/wiki-query';
import type { WikiPage } from '../../types';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  pages: WikiPage[];
}

export function WikiQueryModal({ open, onClose, pages }: Props) {
  const { llmConfig, aiPrompts } = useSettingsStore();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const selectedPages = useMemo(
    () => question.trim() ? selectWikiPagesForQuery({ question, pages, maxPages: 8 }) : [],
    [question, pages],
  );
  const ready = isLLMReady(llmConfig);

  const ask = async () => {
    if (!ready || !question.trim()) return;
    setIsRunning(true);
    setAnswer('');
    setError('');
    try {
      const prompt = buildWikiQueryPrompt({
        question,
        pages: selectedPages,
        template: aiPrompts.wikiQueryAnswerTemplate,
      });
      setAnswer(await complete(prompt, { maxTokens: 1600, temperature: 0.2 }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="問 Wiki" width={720}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <textarea
          className="form-input"
          rows={3}
          placeholder="例如：星塵市的真相在哪幾章被埋伏筆？"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            已選 {selectedPages.length} 頁作為回答依據
          </div>
          <Button variant="primary" onClick={ask} disabled={!ready || !question.trim() || isRunning}>
            {isRunning ? '查詢中...' : '送出'}
          </Button>
        </div>
        {!ready && (
          <div style={{ fontSize: 12, color: 'var(--accent-danger)' }}>
            請先在設定中完成 LLM API 設定。
          </div>
        )}
        {selectedPages.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {selectedPages.map((page) => `${page.type}/${page.slug}`).join('、')}
          </div>
        )}
        {error && <div style={{ color: 'var(--accent-danger)', fontSize: 13 }}>{error}</div>}
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
