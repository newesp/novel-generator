import { useEffect, useState, type ReactNode } from 'react';
import { Bot } from 'lucide-react';
import type { GenerationStepRole } from '../../types';
import type { ActivityTone } from '../../lib/multi-agent/presentation';
import { Button } from './Button';

type ActivityRole = GenerationStepRole | 'assistant';

export interface AIActivityCardAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface AIActivityCardProps {
  role?: ActivityRole;
  title: string;
  message?: string;
  startedAt?: number;
  tone?: ActivityTone;
  running?: boolean;
  compact?: boolean;
  steps?: ReactNode;
  primaryAction?: AIActivityCardAction;
  secondaryAction?: AIActivityCardAction;
  errorMessage?: string;
}

function formatElapsed(startedAt?: number): string | null {
  if (!startedAt) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0
    ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`;
}

export function AIActivityCard({
  role = 'assistant',
  title,
  message,
  startedAt,
  tone = 'active',
  running = false,
  compact = false,
  steps,
  primaryAction,
  secondaryAction,
  errorMessage,
}: AIActivityCardProps) {
  const [, setClock] = useState(0);

  useEffect(() => {
    if (!running || !startedAt) return;
    const timer = window.setInterval(() => setClock((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running, startedAt]);

  const elapsed = formatElapsed(startedAt);
  const statusRole = tone === 'danger' ? 'alert' : 'status';

  return (
    <section
      className={`ai-activity-card tone-${tone}${compact ? ' compact' : ''}`}
      role={statusRole}
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
    >
      <div className={`ai-activity-avatar role-${role}${running ? ' is-running' : ''}`} aria-hidden="true">
        {role === 'assistant' ? (
          <Bot size={compact ? 20 : 28} strokeWidth={1.7} />
        ) : (
          <img src={`/assets/agents/${role}-128.png`} alt="" />
        )}
      </div>
      <div className="ai-activity-main">
        <div className="ai-activity-heading">
          <strong>{title}</strong>
          {running && <span className="ai-activity-pulse">執行中</span>}
          {elapsed && <time>已經過 {elapsed}</time>}
        </div>
        {message && <div className="ai-activity-message">{message}</div>}
        {errorMessage && <div className="ai-activity-error">{errorMessage}</div>}
        {steps}
      </div>
      {(primaryAction || secondaryAction) && (
        <div className="ai-activity-actions">
          {primaryAction && (
            <Button
              variant="secondary"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
            >
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="secondary"
              className={secondaryAction.danger ? 'ai-activity-danger-action' : undefined}
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
