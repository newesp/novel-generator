import { describe, expect, it } from 'vitest';
import { calculatePanelTiming } from './timing';

describe('calculatePanelTiming', () => {
  it('uses measured audio duration when durationSec is 0', () => {
    expect(calculatePanelTiming({ audioDurationMs: 3200, durationSec: 0, panelPauseMs: 400 })).toEqual({
      audioDurationMs: 3200,
      manualDurationMs: 0,
      baseDurationMs: 3200,
      effectiveDurationMs: 3600,
      trailingSilenceMs: 400,
    });
  });

  it('extends short audio when durationSec is longer', () => {
    expect(calculatePanelTiming({ audioDurationMs: 2100, durationSec: 5, panelPauseMs: 400 })).toMatchObject({
      manualDurationMs: 5000,
      baseDurationMs: 5000,
      effectiveDurationMs: 5400,
      trailingSilenceMs: 3300,
    });
  });

  it('does not truncate audio when durationSec is shorter', () => {
    expect(calculatePanelTiming({ audioDurationMs: 7200, durationSec: 3, panelPauseMs: 250 })).toMatchObject({
      manualDurationMs: 3000,
      baseDurationMs: 7200,
      effectiveDurationMs: 7450,
      trailingSilenceMs: 250,
    });
  });

  it('normalizes non-finite inputs to finite zeros', () => {
    expect(
      calculatePanelTiming({
        audioDurationMs: Number.NaN,
        durationSec: Number.POSITIVE_INFINITY,
        panelPauseMs: Number.NEGATIVE_INFINITY,
      }),
    ).toEqual({
      audioDurationMs: 0,
      manualDurationMs: 0,
      baseDurationMs: 0,
      effectiveDurationMs: 0,
      trailingSilenceMs: 0,
    });
  });
});
