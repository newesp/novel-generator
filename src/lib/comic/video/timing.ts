export interface PanelTimingInput {
  audioDurationMs: number;
  durationSec: number;
  panelPauseMs: number;
}

export interface PanelTiming {
  audioDurationMs: number;
  manualDurationMs: number;
  baseDurationMs: number;
  effectiveDurationMs: number;
  trailingSilenceMs: number;
}

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function calculatePanelTiming(input: PanelTimingInput): PanelTiming {
  const audioDurationMs = Math.max(0, Math.round(finiteNumber(input.audioDurationMs, 0)));
  const durationSec = finiteNumber(input.durationSec, 0);
  const manualDurationMs = durationSec > 0 ? Math.round(durationSec * 1000) : 0;
  const panelPauseMs = Math.max(0, Math.round(finiteNumber(input.panelPauseMs, 0)));
  const baseDurationMs = Math.max(audioDurationMs, manualDurationMs);
  const effectiveDurationMs = baseDurationMs + panelPauseMs;

  return {
    audioDurationMs,
    manualDurationMs,
    baseDurationMs,
    effectiveDurationMs,
    trailingSilenceMs: Math.max(0, effectiveDurationMs - audioDurationMs),
  };
}

export function msToSeconds(ms: number): number {
  return Math.max(0, Math.round(ms) / 1000);
}
