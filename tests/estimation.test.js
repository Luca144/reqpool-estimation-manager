import { describe, it, expect } from 'vitest';
import {
  WEIGHTS,
  USER_SCALING_THRESHOLDS,
  PROJECT_TYPE_MULTIPLIERS,
  COMPLEXITY_BUFFER,
  RANGE_FACTORS,
} from '../js/config.js';
import {
  PHASE_DISTRIBUTION,
  TAGESSATZ_EUR,
  calculateBaseEffort,
  getUserScalingFactor,
  getProjectTypeMultiplier,
  calculatePhases,
  calculateEstimation,
} from '../js/estimation.js';

/**
 * Hilfs-Factory für Basis-Parameter (alle Werte 0). Erlaubt isolierte Tests
 * eines einzelnen Parameters über Override.
 * @param {object} overrides
 */
function makeBaseParams(overrides = {}) {
  return {
    pages: 0,
    useCases: 0,
    businessObjects: 0,
    interfaces: 0,
    batches: 0,
    languages: 0,
    roles: 0,
    ...overrides,
  };
}

function makeFullParams(overrides = {}) {
  return {
    ...makeBaseParams(),
    users: 0,
    projectType: 'Greenfield',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Konstanten — Regressionsschutz, damit niemand Magic Numbers unbemerkt ändert
// ─────────────────────────────────────────────────────────────────────────────

describe('Konstanten', () => {
  it('WEIGHTS enthält exakt die Briefing-Gewichte', () => {
    expect(WEIGHTS).toEqual({
      pages: 0.8,
      useCases: 2.5,
      businessObjects: 1.2,
      interfaces: 3.0,
      batches: 1.5,
      languages: 0.5,
      roles: 1.8,
    });
  });

  it('PROJECT_TYPE_MULTIPLIERS enthält Greenfield/Brownfield/Migration mit korrekten Werten', () => {
    expect(PROJECT_TYPE_MULTIPLIERS).toEqual({
      Greenfield: 1.0,
      Brownfield: 1.2,
      Migration: 1.35,
    });
  });

  it('TAGESSATZ_EUR ist 1200', () => {
    expect(TAGESSATZ_EUR).toBe(1200);
  });

  it('COMPLEXITY_BUFFER ist 1.15', () => {
    expect(COMPLEXITY_BUFFER).toBe(1.15);
  });

  it('RANGE_FACTORS sind 0.85 / 1.0 / 1.25', () => {
    expect(RANGE_FACTORS).toEqual({ min: 0.85, likely: 1.0, max: 1.25 });
  });

  it('USER_SCALING_THRESHOLDS hat 5 Stufen mit aufsteigenden Faktoren', () => {
    expect(USER_SCALING_THRESHOLDS).toHaveLength(5);
    const factors = USER_SCALING_THRESHOLDS.map(s => s.factor);
    expect(factors).toEqual([1.0, 1.1, 1.25, 1.4, 1.6]);
    expect(USER_SCALING_THRESHOLDS[USER_SCALING_THRESHOLDS.length - 1].upTo).toBe(Infinity);
  });

  it('PHASE_DISTRIBUTION enthält 6 Phasen, deren Shares zu 1.0 summieren', () => {
    expect(PHASE_DISTRIBUTION).toHaveLength(6);
    const sum = PHASE_DISTRIBUTION.reduce((acc, p) => acc + p.share, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('PHASE_DISTRIBUTION-Reihenfolge entspricht Briefing', () => {
    expect(PHASE_DISTRIBUTION.map(p => p.key)).toEqual([
      'stakeholderAnalysis',
      'requirementsElicitation',
      'specification',
      'reviewQa',
      'acceptanceHandover',
      'projectManagement',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateBaseEffort
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateBaseEffort', () => {
  it('liefert 0 bei lauter Null-Werten', () => {
    expect(calculateBaseEffort(makeBaseParams())).toBe(0);
  });

  it('liefert 0.8 PT pro Page (1 Page → 0.8)', () => {
    expect(calculateBaseEffort(makeBaseParams({ pages: 1 }))).toBeCloseTo(0.8, 5);
  });

  it('liefert 2.5 PT pro Use Case (1 Use Case → 2.5)', () => {
    expect(calculateBaseEffort(makeBaseParams({ useCases: 1 }))).toBeCloseTo(2.5, 5);
  });

  it('liefert 25 PT für 10 Use Cases (Briefing-Beispiel)', () => {
    expect(calculateBaseEffort(makeBaseParams({ useCases: 10 }))).toBeCloseTo(25, 5);
  });

  it('liefert 1.2 PT pro Business Object', () => {
    expect(calculateBaseEffort(makeBaseParams({ businessObjects: 1 }))).toBeCloseTo(1.2, 5);
  });

  it('liefert 3.0 PT pro Interface', () => {
    expect(calculateBaseEffort(makeBaseParams({ interfaces: 1 }))).toBeCloseTo(3.0, 5);
  });

  it('liefert 1.5 PT pro Batch', () => {
    expect(calculateBaseEffort(makeBaseParams({ batches: 1 }))).toBeCloseTo(1.5, 5);
  });

  it('liefert 1.8 PT pro Rolle', () => {
    expect(calculateBaseEffort(makeBaseParams({ roles: 1 }))).toBeCloseTo(1.8, 5);
  });

  it('liefert korrekte Kombination (mittleres Demo-Projekt: 75.9 PT)', () => {
    const params = makeBaseParams({
      pages: 15,
      useCases: 10,
      businessObjects: 12,
      interfaces: 4,
      batches: 2,
      languages: 2,
      roles: 5,
    });
    // 12 + 25 + 14.4 + 12 + 3 + 0.5 + 9 = 75.9
    expect(calculateBaseEffort(params)).toBeCloseTo(75.9, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Languages-Edge-Case (erste Sprache kostet nichts extra)
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateBaseEffort — Languages-Edge-Case', () => {
  it('languages=0 ergibt 0 zusätzlichen Aufwand', () => {
    expect(calculateBaseEffort(makeBaseParams({ languages: 0 }))).toBe(0);
  });

  it('languages=1 ergibt 0 zusätzlichen Aufwand (erste Sprache frei)', () => {
    expect(calculateBaseEffort(makeBaseParams({ languages: 1 }))).toBe(0);
  });

  it('languages=2 ergibt 0.5 PT (eine zusätzliche Sprache)', () => {
    expect(calculateBaseEffort(makeBaseParams({ languages: 2 }))).toBeCloseTo(0.5, 5);
  });

  it('languages=3 ergibt 1.0 PT (zwei zusätzliche Sprachen)', () => {
    expect(calculateBaseEffort(makeBaseParams({ languages: 3 }))).toBeCloseTo(1.0, 5);
  });

  it('languages=5 ergibt 2.0 PT (vier zusätzliche Sprachen)', () => {
    expect(calculateBaseEffort(makeBaseParams({ languages: 5 }))).toBeCloseTo(2.0, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUserScalingFactor
// ─────────────────────────────────────────────────────────────────────────────

describe('getUserScalingFactor', () => {
  it('liefert 1.0 für users=0', () => {
    expect(getUserScalingFactor(0)).toBe(1.0);
  });

  it('liefert 1.0 für users=10 (oberer Rand Stufe 1)', () => {
    expect(getUserScalingFactor(10)).toBe(1.0);
  });

  it('liefert 1.1 für users=11 (unterer Rand Stufe 2)', () => {
    expect(getUserScalingFactor(11)).toBe(1.1);
  });

  it('liefert 1.1 für users=50 (oberer Rand Stufe 2)', () => {
    expect(getUserScalingFactor(50)).toBe(1.1);
  });

  it('liefert 1.25 für users=51 (unterer Rand Stufe 3)', () => {
    expect(getUserScalingFactor(51)).toBe(1.25);
  });

  it('liefert 1.25 für users=200 (oberer Rand Stufe 3)', () => {
    expect(getUserScalingFactor(200)).toBe(1.25);
  });

  it('liefert 1.4 für users=201 (unterer Rand Stufe 4)', () => {
    expect(getUserScalingFactor(201)).toBe(1.4);
  });

  it('liefert 1.4 für users=1000 (oberer Rand Stufe 4)', () => {
    expect(getUserScalingFactor(1000)).toBe(1.4);
  });

  it('liefert 1.6 für users=1001 (unterer Rand Stufe 5)', () => {
    expect(getUserScalingFactor(1001)).toBe(1.6);
  });

  it('liefert 1.6 für sehr große Nutzerzahlen (1.000.000)', () => {
    expect(getUserScalingFactor(1_000_000)).toBe(1.6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getProjectTypeMultiplier
// ─────────────────────────────────────────────────────────────────────────────

describe('getProjectTypeMultiplier', () => {
  it('liefert 1.0 für Greenfield', () => {
    expect(getProjectTypeMultiplier('Greenfield')).toBe(1.0);
  });

  it('liefert 1.2 für Brownfield', () => {
    expect(getProjectTypeMultiplier('Brownfield')).toBe(1.2);
  });

  it('liefert 1.35 für Migration', () => {
    expect(getProjectTypeMultiplier('Migration')).toBe(1.35);
  });

  it('wirft RangeError für unbekannten Projekttyp', () => {
    expect(() => getProjectTypeMultiplier('Unknown')).toThrow(RangeError);
  });

  it('wirft RangeError für null', () => {
    expect(() => getProjectTypeMultiplier(null)).toThrow(RangeError);
  });

  it('wirft RangeError für undefined', () => {
    expect(() => getProjectTypeMultiplier(undefined)).toThrow(RangeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculatePhases
// ─────────────────────────────────────────────────────────────────────────────

describe('calculatePhases', () => {
  it('liefert genau 6 Phasen', () => {
    expect(calculatePhases(100)).toHaveLength(6);
  });

  it('Summe aller phase.pt ergibt totalEffort (totalEffort=100)', () => {
    const phases = calculatePhases(100);
    const sum = phases.reduce((acc, p) => acc + p.pt, 0);
    expect(sum).toBeCloseTo(100, 5);
  });

  it('Summe aller phase.pt ergibt totalEffort (totalEffort=109.10625, mittleres Projekt)', () => {
    const phases = calculatePhases(109.10625);
    const sum = phases.reduce((acc, p) => acc + p.pt, 0);
    expect(sum).toBeCloseTo(109.10625, 5);
  });

  it('Stakeholder-Analyse macht 12% aus', () => {
    const phases = calculatePhases(100);
    const stakeholderPhase = phases.find(p => p.key === 'stakeholderAnalysis');
    expect(stakeholderPhase.pt).toBeCloseTo(12, 5);
    expect(stakeholderPhase.name).toBe('Stakeholder-Analyse');
  });

  it('Spezifikation ist die größte Phase mit 35%', () => {
    const phases = calculatePhases(100);
    const specPhase = phases.find(p => p.key === 'specification');
    expect(specPhase.pt).toBeCloseTo(35, 5);
  });

  it('liefert pt=0 für totalEffort=0', () => {
    const phases = calculatePhases(0);
    expect(phases.every(p => p.pt === 0)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateEstimation — Vollständige Integration für die Demo-Datenkombinationen
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateEstimation — Demo-Datenkombinationen', () => {
  /**
   * Kleines Projekt (Briefing):
   *   baseEffort = 5·0.8 + 3·2.5 + 4·1.2 + 1·3.0 + 0·1.5 + (1-1)·0.5 + 2·1.8
   *              = 4 + 7.5 + 4.8 + 3 + 0 + 0 + 3.6 = 22.9
   *   users=20  → factor 1.1   → scaled = 25.19
   *   Greenfield (1.0)         → typeEffort = 25.19
   *   buffer 1.15              → total = 28.9685
   */
  it('Kleines Projekt: likely ≈ 28.9685 PT (Greenfield)', () => {
    const params = makeFullParams({
      pages: 5, useCases: 3, businessObjects: 4, interfaces: 1,
      batches: 0, languages: 1, roles: 2, users: 20,
      projectType: 'Greenfield',
    });
    const result = calculateEstimation(params);
    expect(result.likely).toBeCloseTo(28.9685, 5);
    expect(result.min).toBeCloseTo(28.9685 * 0.85, 5);
    expect(result.max).toBeCloseTo(28.9685 * 1.25, 5);
  });

  /**
   * Mittleres Projekt:
   *   baseEffort = 12 + 25 + 14.4 + 12 + 3 + 0.5 + 9 = 75.9
   *   users=150 → factor 1.25  → scaled = 94.875
   *   Greenfield (1.0)         → typeEffort = 94.875
   *   buffer 1.15              → total = 109.10625
   */
  it('Mittleres Projekt: likely ≈ 109.10625 PT (Greenfield)', () => {
    const params = makeFullParams({
      pages: 15, useCases: 10, businessObjects: 12, interfaces: 4,
      batches: 2, languages: 2, roles: 5, users: 150,
      projectType: 'Greenfield',
    });
    const result = calculateEstimation(params);
    expect(result.likely).toBeCloseTo(109.10625, 5);
  });

  /**
   * Großes Projekt:
   *   baseEffort = 32 + 62.5 + 36 + 30 + 7.5 + 1.0 + 21.6 = 190.6
   *   users=800 → factor 1.4   → scaled = 266.84
   *   Greenfield (1.0)         → typeEffort = 266.84
   *   buffer 1.15              → total = 306.866
   */
  it('Großes Projekt: likely ≈ 306.866 PT (Greenfield)', () => {
    const params = makeFullParams({
      pages: 40, useCases: 25, businessObjects: 30, interfaces: 10,
      batches: 5, languages: 3, roles: 12, users: 800,
      projectType: 'Greenfield',
    });
    const result = calculateEstimation(params);
    expect(result.likely).toBeCloseTo(306.866, 5);
  });

  it('Projekttyp Brownfield erhöht den Aufwand um 20%', () => {
    const greenfield = calculateEstimation(makeFullParams({
      useCases: 10, users: 20, projectType: 'Greenfield',
    }));
    const brownfield = calculateEstimation(makeFullParams({
      useCases: 10, users: 20, projectType: 'Brownfield',
    }));
    expect(brownfield.likely).toBeCloseTo(greenfield.likely * 1.2, 5);
  });

  it('Projekttyp Migration erhöht den Aufwand um 35%', () => {
    const greenfield = calculateEstimation(makeFullParams({
      useCases: 10, users: 20, projectType: 'Greenfield',
    }));
    const migration = calculateEstimation(makeFullParams({
      useCases: 10, users: 20, projectType: 'Migration',
    }));
    expect(migration.likely).toBeCloseTo(greenfield.likely * 1.35, 5);
  });
});

describe('calculateEstimation — strukturelle Eigenschaften', () => {
  const sampleParams = makeFullParams({
    pages: 15, useCases: 10, businessObjects: 12, interfaces: 4,
    batches: 2, languages: 2, roles: 5, users: 150,
    projectType: 'Greenfield',
  });

  it('garantiert min < likely < max', () => {
    const result = calculateEstimation(sampleParams);
    expect(result.min).toBeLessThan(result.likely);
    expect(result.likely).toBeLessThan(result.max);
  });

  it('costs entsprechen PT × Tagessatz (1200 EUR)', () => {
    const result = calculateEstimation(sampleParams);
    expect(result.costs.min).toBeCloseTo(result.min * TAGESSATZ_EUR, 5);
    expect(result.costs.likely).toBeCloseTo(result.likely * TAGESSATZ_EUR, 5);
    expect(result.costs.max).toBeCloseTo(result.max * TAGESSATZ_EUR, 5);
  });

  it('Summe der phase.pt ergibt den likely-Wert (Phasen basieren auf totalEffort = likely)', () => {
    const result = calculateEstimation(sampleParams);
    const sum = result.phases.reduce((acc, p) => acc + p.pt, 0);
    expect(sum).toBeCloseTo(result.likely, 5);
  });

  it('liefert genau 6 Phasen', () => {
    const result = calculateEstimation(sampleParams);
    expect(result.phases).toHaveLength(6);
  });

  it('liefert Ergebnis mit den geforderten Top-Level-Keys', () => {
    const result = calculateEstimation(sampleParams);
    expect(result).toHaveProperty('min');
    expect(result).toHaveProperty('likely');
    expect(result).toHaveProperty('max');
    expect(result).toHaveProperty('phases');
    expect(result).toHaveProperty('costs');
  });

  it('alle Werte sind 0 bei lauter Null-Parametern', () => {
    const result = calculateEstimation(makeFullParams({ projectType: 'Greenfield' }));
    expect(result.likely).toBe(0);
    expect(result.min).toBe(0);
    expect(result.max).toBe(0);
    expect(result.costs.likely).toBe(0);
    expect(result.phases.every(p => p.pt === 0)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('Validation — calculateBaseEffort', () => {
  it('wirft RangeError bei negativem pages', () => {
    expect(() => calculateBaseEffort(makeBaseParams({ pages: -1 }))).toThrow(RangeError);
  });

  it('wirft RangeError bei negativem useCases', () => {
    expect(() => calculateBaseEffort(makeBaseParams({ useCases: -5 }))).toThrow(RangeError);
  });

  it('wirft TypeError bei NaN', () => {
    expect(() => calculateBaseEffort(makeBaseParams({ pages: NaN }))).toThrow(TypeError);
  });

  it('wirft TypeError bei undefined-Parameter', () => {
    const params = makeBaseParams();
    delete params.pages;
    expect(() => calculateBaseEffort(params)).toThrow(TypeError);
  });

  it('wirft TypeError bei null statt Parameter-Objekt', () => {
    expect(() => calculateBaseEffort(null)).toThrow(TypeError);
  });

  it('wirft TypeError bei String-Eingabe', () => {
    expect(() => calculateBaseEffort(makeBaseParams({ pages: '5' }))).toThrow(TypeError);
  });
});

describe('Validation — getUserScalingFactor', () => {
  it('wirft RangeError bei negativen Usern', () => {
    expect(() => getUserScalingFactor(-1)).toThrow(RangeError);
  });

  it('wirft TypeError bei NaN', () => {
    expect(() => getUserScalingFactor(NaN)).toThrow(TypeError);
  });

  it('wirft TypeError bei undefined', () => {
    expect(() => getUserScalingFactor(undefined)).toThrow(TypeError);
  });
});

describe('Validation — calculateEstimation', () => {
  it('wirft RangeError bei unbekanntem Projekttyp', () => {
    expect(() => calculateEstimation(makeFullParams({ projectType: 'Foobar' }))).toThrow(RangeError);
  });

  it('wirft RangeError bei negativen Parametern', () => {
    expect(() => calculateEstimation(makeFullParams({ pages: -1 }))).toThrow(RangeError);
  });

  it('wirft TypeError bei null statt Parameter-Objekt', () => {
    expect(() => calculateEstimation(null)).toThrow(TypeError);
  });
});
