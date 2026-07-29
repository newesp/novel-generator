import { useEffect, useRef, useState } from 'react';
import { t, type InterfaceLocale } from '../lib/language-policy';

export type LocalAIActivityPhase = 'idle' | 'running' | 'success' | 'failed' | 'cancelled';

export interface LocalAIActivityState {
  phase: LocalAIActivityPhase;
  startedAt?: number;
  message?: string;
  errorMessage?: string;
}

const IDLE_ACTIVITY: LocalAIActivityState = { phase: 'idle' };

export function useLocalAIActivity(interfaceLocale: InterfaceLocale = 'zh-TW') {
  const [activity, setActivity] = useState<LocalAIActivityState>(IDLE_ACTIVITY);
  const controllerRef = useRef<AbortController | null>(null);
  const lastSignalRef = useRef<AbortSignal | null>(null);
  const clearTimerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (clearTimerRef.current != null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  };

  useEffect(() => () => {
    controllerRef.current?.abort('Component unmounted');
    clearTimer();
  }, []);

  const start = (message?: string): AbortSignal => {
    clearTimer();
    controllerRef.current?.abort('Superseded by a new request');
    const controller = new AbortController();
    controllerRef.current = controller;
    lastSignalRef.current = controller.signal;
    setActivity({ phase: 'running', startedAt: Date.now(), message });
    return controller.signal;
  };

  const scheduleClear = () => {
    clearTimer();
    clearTimerRef.current = window.setTimeout(() => {
      setActivity(IDLE_ACTIVITY);
      clearTimerRef.current = null;
    }, 2400);
  };

  const succeed = (message?: string) => {
    controllerRef.current = null;
    lastSignalRef.current = null;
    setActivity((current) => ({ ...current, phase: 'success', message, errorMessage: undefined }));
    scheduleClear();
  };

  const fail = (error: unknown) => {
    const controller = controllerRef.current;
    controllerRef.current = null;
    if (
      controller?.signal.aborted
      || lastSignalRef.current?.aborted
      || (error instanceof DOMException && error.name === 'AbortError')
      || (error instanceof Error && error.name === 'AbortError')
    ) return;
    lastSignalRef.current = null;
    setActivity((current) => ({
      ...current,
      phase: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
  };

  const cancel = () => {
    clearTimer();
    controllerRef.current?.abort('User cancelled AI request');
    controllerRef.current = null;
    setActivity((current) => ({
      ...current,
      phase: 'cancelled',
      message: t('localAi.cancelled', undefined, interfaceLocale),
      errorMessage: undefined,
    }));
    scheduleClear();
  };

  const reset = () => {
    clearTimer();
    controllerRef.current = null;
    lastSignalRef.current = null;
    setActivity(IDLE_ACTIVITY);
  };

  return { activity, start, succeed, fail, cancel, reset };
}
