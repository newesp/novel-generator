import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_MULTI_AGENT_PREFS,
  clampMaxRevisions,
  useSettingsStore,
  validateCriticThresholds,
  validateCriticWeights,
} from '../stores/settingsStore';
import { exportSettingsSnapshot, importSettingsSnapshot } from './settings-backup';

describe('Multi-Agent Preferences & Validation', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      multiAgentPrefs: { ...DEFAULT_MULTI_AGENT_PREFS },
    });
  });

  describe('Default Configuration & Validation Helpers', () => {
    it('has valid default Multi-Agent preferences', () => {
      expect(DEFAULT_MULTI_AGENT_PREFS.maxRevisions).toBe(3);
      expect(DEFAULT_MULTI_AGENT_PREFS.criticThresholds).toEqual({
        humanReviewFloor: 80,
        passScore: 85,
      });

      const threshVal = validateCriticThresholds(
        DEFAULT_MULTI_AGENT_PREFS.criticThresholds.humanReviewFloor,
        DEFAULT_MULTI_AGENT_PREFS.criticThresholds.passScore,
      );
      expect(threshVal.valid).toBe(true);

      const weightVal = validateCriticWeights(DEFAULT_MULTI_AGENT_PREFS.criticRubricWeights);
      expect(weightVal.valid).toBe(true);
      expect(weightVal.total).toBe(100);
    });

    it('validates critic threshold ordering (0 <= humanReviewFloor < passScore <= 100)', () => {
      expect(validateCriticThresholds(80, 85).valid).toBe(true);
      expect(validateCriticThresholds(0, 100).valid).toBe(true);

      // Invalid cases
      expect(validateCriticThresholds(85, 85).valid).toBe(false);
      expect(validateCriticThresholds(90, 85).valid).toBe(false);
      expect(validateCriticThresholds(-5, 85).valid).toBe(false);
      expect(validateCriticThresholds(80, 105).valid).toBe(false);
    });

    it('validates critic rubric weights sum === 100 and all non-negative', () => {
      const validWeights = {
        instructionAndBeat: 20,
        plotLogic: 20,
        characterConsistency: 20,
        contextAndWorld: 15,
        styleAndQuality: 15,
        pacingAndStructure: 10,
      };
      expect(validateCriticWeights(validWeights).valid).toBe(true);

      // Invalid sum !== 100
      expect(
        validateCriticWeights({ ...validWeights, instructionAndBeat: 10 }).valid,
      ).toBe(false);

      // Invalid negative weight
      expect(
        validateCriticWeights({ ...validWeights, instructionAndBeat: -10, plotLogic: 50 }).valid,
      ).toBe(false);
    });

    it('clamps maxRevisions within [1, 5]', () => {
      expect(clampMaxRevisions(3)).toBe(3);
      expect(clampMaxRevisions(0)).toBe(1);
      expect(clampMaxRevisions(-2)).toBe(1);
      expect(clampMaxRevisions(10)).toBe(5);
      expect(clampMaxRevisions(4.8)).toBe(4);
    });
  });

  describe('Settings Store Integration', () => {
    it('updates multiAgentPrefs partially and clamps maxRevisions', () => {
      const store = useSettingsStore.getState();
      store.setMultiAgentPrefs({
        maxRevisions: 5,
        agents: {
          writer: {
            profileId: 'prof-writer-custom',
            roleGuidance: 'Custom Writer Guidance',
          },
        },
      });

      const updated = useSettingsStore.getState().multiAgentPrefs;
      expect(updated.maxRevisions).toBe(5);
      expect(updated.agents.writer.profileId).toBe('prof-writer-custom');
      expect(updated.agents.writer.roleGuidance).toBe('Custom Writer Guidance');
      // Unchanged role defaults remain intact
      expect(updated.agents.planner.roleGuidance).toBe(DEFAULT_MULTI_AGENT_PREFS.agents.planner.roleGuidance);
    });
  });

  describe('Backup Export & Import Integration', () => {
    it('exports and imports multiAgentPrefs in settings snapshot', () => {
      const store = useSettingsStore.getState();
      store.setMultiAgentPrefs({
        maxRevisions: 4,
        criticThresholds: { humanReviewFloor: 75, passScore: 90 },
        costEstimate: {
          inputCostPerMillion: 2.5,
          outputCostPerMillion: 10,
          currency: 'TWD',
          showTokenAndCost: false,
        },
      });

      const snapshot = exportSettingsSnapshot(false);
      expect(snapshot.settings.multiAgentPrefs?.maxRevisions).toBe(4);
      expect(snapshot.settings.multiAgentPrefs?.criticThresholds).toEqual({
        humanReviewFloor: 75,
        passScore: 90,
      });
      expect(snapshot.settings.multiAgentPrefs?.costEstimate.currency).toBe('TWD');

      // Reset store to defaults and import snapshot
      store.setMultiAgentPrefs(DEFAULT_MULTI_AGENT_PREFS);
      importSettingsSnapshot(snapshot);

      const restored = useSettingsStore.getState().multiAgentPrefs;
      expect(restored.maxRevisions).toBe(4);
      expect(restored.criticThresholds).toEqual({ humanReviewFloor: 75, passScore: 90 });
      expect(restored.costEstimate.currency).toBe('TWD');
      expect(restored.costEstimate.showTokenAndCost).toBe(false);
    });
  });
});
