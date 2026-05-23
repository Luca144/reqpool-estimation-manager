import { describe, it, expect } from 'vitest';
import { assessFeasibility } from '../js/feasibility.js';
import { WORKDAYS_PER_MONTH, FEASIBILITY_TOLERANCE } from '../js/config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Hilfs-Konstanten für die Tests
// ─────────────────────────────────────────────────────────────────────────────

// totalEffort = 200 PT, 2 Berater → realisticMonths = 200/2/20 = 5 Monate
// realisticMonthsMin = 5 * 0.8 = 4
// realisticMonthsMax = 5 * 1.2 = 6
const STD_PT = 200;
const STD_CONSULTANTS = 2;
const STD_REALISTIC = STD_PT / STD_CONSULTANTS / WORKDAYS_PER_MONTH; // 5
const STD_MIN = STD_REALISTIC * (1 - FEASIBILITY_TOLERANCE);          // 4
const STD_MAX = STD_REALISTIC * (1 + FEASIBILITY_TOLERANCE);          // 6

// ─────────────────────────────────────────────────────────────────────────────
// Status-Logik
// ─────────────────────────────────────────────────────────────────────────────

describe('assessFeasibility — Status', () => {
  it('plannedMonths exakt im Zentrum → green', () => {
    const r = assessFeasibility(STD_PT, STD_REALISTIC, STD_CONSULTANTS);
    expect(r.status).toBe('green');
  });

  it('plannedMonths am unteren Rand des Bands (min) → green', () => {
    const r = assessFeasibility(STD_PT, STD_MIN, STD_CONSULTANTS);
    expect(r.status).toBe('green');
  });

  it('plannedMonths am oberen Rand des Bands (max) → green', () => {
    const r = assessFeasibility(STD_PT, STD_MAX, STD_CONSULTANTS);
    expect(r.status).toBe('green');
  });

  it('plannedMonths knapp unter min → red (zu knapp)', () => {
    const r = assessFeasibility(STD_PT, STD_MIN - 0.0001, STD_CONSULTANTS);
    expect(r.status).toBe('red');
  });

  it('plannedMonths knapp über max → yellow (zu großzügig)', () => {
    const r = assessFeasibility(STD_PT, STD_MAX + 0.0001, STD_CONSULTANTS);
    expect(r.status).toBe('yellow');
  });

  it('plannedMonths deutlich unter min → red', () => {
    const r = assessFeasibility(STD_PT, 1, STD_CONSULTANTS);
    expect(r.status).toBe('red');
  });

  it('plannedMonths deutlich über max → yellow', () => {
    const r = assessFeasibility(STD_PT, 12, STD_CONSULTANTS);
    expect(r.status).toBe('yellow');
  });

  it('Boundary "genau 20% drunter" liefert green (Grenze inklusiv)', () => {
    const r = assessFeasibility(STD_PT, STD_REALISTIC * 0.8, STD_CONSULTANTS);
    expect(r.status).toBe('green');
  });

  it('Boundary "genau 20% drüber" liefert green (Grenze inklusiv)', () => {
    const r = assessFeasibility(STD_PT, STD_REALISTIC * 1.2, STD_CONSULTANTS);
    expect(r.status).toBe('green');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rückgabe-Struktur
// ─────────────────────────────────────────────────────────────────────────────

describe('assessFeasibility — Rückgabe-Struktur', () => {
  it('enthält alle erwarteten Top-Level-Keys', () => {
    const r = assessFeasibility(STD_PT, STD_REALISTIC, STD_CONSULTANTS);
    expect(r).toHaveProperty('status');
    expect(r).toHaveProperty('plannedMonths');
    expect(r).toHaveProperty('realisticMonthsMin');
    expect(r).toHaveProperty('realisticMonthsMax');
    expect(r).toHaveProperty('recommendation');
  });

  it('realisticMonthsMin und max sind korrekt berechnet', () => {
    const r = assessFeasibility(STD_PT, STD_REALISTIC, STD_CONSULTANTS);
    expect(r.realisticMonthsMin).toBeCloseTo(4, 5);
    expect(r.realisticMonthsMax).toBeCloseTo(6, 5);
  });

  it('plannedMonths wird unverändert echo-t', () => {
    const r = assessFeasibility(STD_PT, 7, STD_CONSULTANTS);
    expect(r.plannedMonths).toBe(7);
  });

  it('recommendation ist ein nicht-leerer String pro Status', () => {
    const green = assessFeasibility(STD_PT, 5, STD_CONSULTANTS);
    const yellow = assessFeasibility(STD_PT, 12, STD_CONSULTANTS);
    const red = assessFeasibility(STD_PT, 1, STD_CONSULTANTS);
    expect(green.recommendation).toBeTypeOf('string');
    expect(green.recommendation.length).toBeGreaterThan(10);
    expect(yellow.recommendation.length).toBeGreaterThan(10);
    expect(red.recommendation.length).toBeGreaterThan(10);
    // Empfehlungen sind unterschiedlich pro Status.
    expect(green.recommendation).not.toBe(yellow.recommendation);
    expect(red.recommendation).not.toBe(green.recommendation);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('assessFeasibility — Edge Cases', () => {
  it('totalEffortPT = 0 ist erlaubt (PT-Wert kann theoretisch 0 sein)', () => {
    // realisticMonths = 0/2/20 = 0; alle Grenzen sind 0; planned > 0 → yellow
    const r = assessFeasibility(0, 1, 2);
    expect(r.status).toBe('yellow');
    expect(r.realisticMonthsMin).toBe(0);
    expect(r.realisticMonthsMax).toBe(0);
  });

  it('hohe consultantCount führt zu kurzer realisticMonths', () => {
    // 200 PT / 10 / 20 = 1 Monat
    const r = assessFeasibility(200, 1, 10);
    expect(r.realisticMonthsMin).toBeCloseTo(0.8, 5);
    expect(r.realisticMonthsMax).toBeCloseTo(1.2, 5);
    expect(r.status).toBe('green');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('assessFeasibility — Validation', () => {
  it('wirft RangeError bei consultantCount = 0', () => {
    expect(() => assessFeasibility(STD_PT, 5, 0)).toThrow(RangeError);
  });

  it('wirft RangeError bei negativem consultantCount', () => {
    expect(() => assessFeasibility(STD_PT, 5, -1)).toThrow(RangeError);
  });

  it('wirft RangeError bei negativem totalEffortPT', () => {
    expect(() => assessFeasibility(-1, 5, 2)).toThrow(RangeError);
  });

  it('wirft RangeError bei plannedMonths = 0', () => {
    expect(() => assessFeasibility(STD_PT, 0, 2)).toThrow(RangeError);
  });

  it('wirft RangeError bei negativem plannedMonths', () => {
    expect(() => assessFeasibility(STD_PT, -1, 2)).toThrow(RangeError);
  });

  it('wirft TypeError bei NaN als totalEffortPT', () => {
    expect(() => assessFeasibility(NaN, 5, 2)).toThrow(TypeError);
  });

  it('wirft TypeError bei NaN als plannedMonths', () => {
    expect(() => assessFeasibility(STD_PT, NaN, 2)).toThrow(TypeError);
  });

  it('wirft TypeError bei NaN als consultantCount', () => {
    expect(() => assessFeasibility(STD_PT, 5, NaN)).toThrow(TypeError);
  });

  it('wirft TypeError bei String als Argument', () => {
    expect(() => assessFeasibility('200', 5, 2)).toThrow(TypeError);
  });

  it('wirft TypeError bei undefined als Argument', () => {
    expect(() => assessFeasibility(STD_PT, undefined, 2)).toThrow(TypeError);
  });

  it('wirft TypeError bei Infinity', () => {
    expect(() => assessFeasibility(Infinity, 5, 2)).toThrow(TypeError);
  });
});
