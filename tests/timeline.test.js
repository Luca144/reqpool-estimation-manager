import { describe, it, expect } from 'vitest';
import { computeTimeline } from '../js/timeline.js';

// ─────────────────────────────────────────────────────────────────────────────
// Hilfs-Funktionen für die Tests
// ─────────────────────────────────────────────────────────────────────────────

/** ISO-Datum YYYY-MM-DD aus einem Date-Objekt. */
function isoOf(date) {
  return date.toISOString().slice(0, 10);
}

const MO_2026_05_25 = '2026-05-25'; // Montag
const FR_2026_05_29 = '2026-05-29'; // Freitag
const SA_2026_05_30 = '2026-05-30'; // Samstag

// ─────────────────────────────────────────────────────────────────────────────
// Basics
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTimeline — Basics', () => {
  it('eine Phase, 10 PT, 2 Berater → 5 Werktage', () => {
    const phases = [{ key: 'a', name: 'A', pt: 10 }];
    const rows = computeTimeline(phases, MO_2026_05_25, 2);
    expect(rows).toHaveLength(1);
    expect(rows[0].durationDays).toBe(5);
    expect(isoOf(rows[0].startDate)).toBe('2026-05-25'); // Montag
    expect(isoOf(rows[0].endDate)).toBe('2026-05-29');   // Freitag
  });

  it('eine Phase, 20 PT, 2 Berater → 10 Werktage (mit Wochenend-Skip)', () => {
    // 10 Werktage ab Mo 25.05.2026 → Mo 25.05, Di 26, Mi 27, Do 28, Fr 29,
    // Mo 01.06, Di 02, Mi 03, Do 04, Fr 05. Ende = Fr 05.06.2026.
    const phases = [{ key: 'a', name: 'A', pt: 20 }];
    const rows = computeTimeline(phases, MO_2026_05_25, 2);
    expect(rows[0].durationDays).toBe(10);
    expect(isoOf(rows[0].startDate)).toBe('2026-05-25');
    expect(isoOf(rows[0].endDate)).toBe('2026-06-05');
  });

  it('mehrere Phasen seriell — Phase 2 startet am Werktag nach Phase 1', () => {
    const phases = [
      { key: 'a', name: 'A', pt: 10 }, // 5 Tage: Mo–Fr (25.–29.05)
      { key: 'b', name: 'B', pt: 6 },  // 3 Tage: Mo–Mi (01.–03.06)
    ];
    const rows = computeTimeline(phases, MO_2026_05_25, 2);
    expect(rows).toHaveLength(2);
    expect(isoOf(rows[0].endDate)).toBe('2026-05-29');
    expect(isoOf(rows[1].startDate)).toBe('2026-06-01'); // nächster Werktag
    expect(rows[1].durationDays).toBe(3);
    expect(isoOf(rows[1].endDate)).toBe('2026-06-03');
  });

  it('Phasen-Reihenfolge entspricht der Eingabe-Reihenfolge', () => {
    const phases = [
      { key: 'x', name: 'X', pt: 4 },
      { key: 'y', name: 'Y', pt: 2 },
      { key: 'z', name: 'Z', pt: 6 },
    ];
    const rows = computeTimeline(phases, MO_2026_05_25, 2);
    expect(rows.map(r => r.phaseKey)).toEqual(['x', 'y', 'z']);
    expect(rows.map(r => r.phaseName)).toEqual(['X', 'Y', 'Z']);
  });

  it('Echo der pt-Werte unverändert', () => {
    const phases = [
      { key: 'a', name: 'A', pt: 13.5 },
      { key: 'b', name: 'B', pt: 0 },
    ];
    const rows = computeTimeline(phases, MO_2026_05_25, 2);
    expect(rows[0].pt).toBe(13.5);
    expect(rows[1].pt).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wochenend-Skip
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTimeline — Wochenend-Skip', () => {
  it('Start am Freitag, 3 Werktage → endet am Dienstag (Wochenende übersprungen)', () => {
    const phases = [{ key: 'a', name: 'A', pt: 6 }]; // 3 Tage bei 2 Beratern
    const rows = computeTimeline(phases, FR_2026_05_29, 2);
    expect(rows[0].durationDays).toBe(3);
    expect(isoOf(rows[0].startDate)).toBe('2026-05-29'); // Freitag
    expect(isoOf(rows[0].endDate)).toBe('2026-06-02');   // Dienstag (Fr+Mo+Di)
  });

  it('Start an einem Samstag wird auf Montag verschoben', () => {
    const phases = [{ key: 'a', name: 'A', pt: 4 }]; // 2 Tage bei 2 Beratern
    const rows = computeTimeline(phases, SA_2026_05_30, 2);
    expect(isoOf(rows[0].startDate)).toBe('2026-06-01'); // Montag
    expect(isoOf(rows[0].endDate)).toBe('2026-06-02');   // Dienstag
  });

  it('zwischen zwei Phasen werden Wochenenden übersprungen', () => {
    // Phase A: 5 Tage ab Mo 25.05 → endet Fr 29.05.
    // Phase B: 1 Tag → soll Mo 01.06 starten (nicht Sa 30.05).
    const phases = [
      { key: 'a', name: 'A', pt: 10 },
      { key: 'b', name: 'B', pt: 2 },
    ];
    const rows = computeTimeline(phases, MO_2026_05_25, 2);
    expect(isoOf(rows[0].endDate)).toBe('2026-05-29');
    expect(isoOf(rows[1].startDate)).toBe('2026-06-01');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Verschiedene Berater-Anzahlen
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTimeline — Berater-Variationen', () => {
  it('1 Berater verdoppelt die Dauer (vs 2 Berater)', () => {
    const phases = [{ key: 'a', name: 'A', pt: 20 }];
    const r1 = computeTimeline(phases, MO_2026_05_25, 1);
    const r2 = computeTimeline(phases, MO_2026_05_25, 2);
    expect(r1[0].durationDays).toBe(20);
    expect(r2[0].durationDays).toBe(10);
  });

  it('sehr viele Berater → minimaler 1 Werktag pro Phase', () => {
    const phases = [{ key: 'a', name: 'A', pt: 5 }];
    const rows = computeTimeline(phases, MO_2026_05_25, 100);
    expect(rows[0].durationDays).toBe(1);
    expect(isoOf(rows[0].startDate)).toBe('2026-05-25');
    expect(isoOf(rows[0].endDate)).toBe('2026-05-25');
  });

  it('Berater-Anzahl 3 mit PT=10 → ceil(10/3) = 4 Werktage', () => {
    const phases = [{ key: 'a', name: 'A', pt: 10 }];
    const rows = computeTimeline(phases, MO_2026_05_25, 3);
    expect(rows[0].durationDays).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTimeline — Edge Cases', () => {
  it('0 PT in einer Phase → trotzdem 1 Werktag Mindest-Dauer', () => {
    const phases = [{ key: 'a', name: 'A', pt: 0 }];
    const rows = computeTimeline(phases, MO_2026_05_25, 2);
    expect(rows[0].durationDays).toBe(1);
  });

  it('leeres Phasen-Array → leere Timeline', () => {
    const rows = computeTimeline([], MO_2026_05_25, 2);
    expect(rows).toEqual([]);
  });

  it('akzeptiert Date-Objekt statt ISO-String', () => {
    const startDate = new Date('2026-05-25T12:00:00Z');
    const phases = [{ key: 'a', name: 'A', pt: 4 }];
    const rows = computeTimeline(phases, startDate, 2);
    expect(isoOf(rows[0].startDate)).toBe('2026-05-25');
  });

  it('mutiert den übergebenen startDate-Date nicht', () => {
    const startDate = new Date('2026-05-25T12:00:00Z');
    const snapshot = startDate.getTime();
    computeTimeline([{ key: 'a', name: 'A', pt: 10 }], startDate, 2);
    expect(startDate.getTime()).toBe(snapshot);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTimeline — Validation', () => {
  it('wirft TypeError bei phases = null', () => {
    expect(() => computeTimeline(null, MO_2026_05_25, 2)).toThrow(TypeError);
  });

  it('wirft TypeError bei phases = Objekt', () => {
    expect(() => computeTimeline({}, MO_2026_05_25, 2)).toThrow(TypeError);
  });

  it('wirft TypeError bei ungültigem startDate-String', () => {
    expect(() => computeTimeline([], 'tomorrow', 2)).toThrow(TypeError);
    expect(() => computeTimeline([], '25.05.2026', 2)).toThrow(TypeError);
  });

  it('wirft TypeError bei startDate = null/undefined', () => {
    expect(() => computeTimeline([], null, 2)).toThrow(TypeError);
    expect(() => computeTimeline([], undefined, 2)).toThrow(TypeError);
  });

  it('wirft RangeError bei consultantCount < 1', () => {
    expect(() => computeTimeline([], MO_2026_05_25, 0)).toThrow(RangeError);
    expect(() => computeTimeline([], MO_2026_05_25, -2)).toThrow(RangeError);
  });

  it('wirft TypeError bei consultantCount = NaN', () => {
    expect(() => computeTimeline([], MO_2026_05_25, NaN)).toThrow(TypeError);
  });

  it('wirft RangeError bei negativer PT in einer Phase', () => {
    const phases = [{ key: 'a', name: 'A', pt: -5 }];
    expect(() => computeTimeline(phases, MO_2026_05_25, 2)).toThrow(RangeError);
  });

  it('wirft TypeError bei Nicht-Objekt-Phase', () => {
    expect(() => computeTimeline([null], MO_2026_05_25, 2)).toThrow(TypeError);
    expect(() => computeTimeline(['nope'], MO_2026_05_25, 2)).toThrow(TypeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Realistisches Mittel-Demo-Szenario
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTimeline — realistisches Szenario', () => {
  it('Mittel-Demo-Phasen (likely=109,1 PT) auf 6 Phasen bei 2 Beratern', () => {
    // Phasen-PT: 12% von 109,1 etc.
    const phases = [
      { key: 'stakeholderAnalysis', name: 'Stakeholder-Analyse', pt: 13.09 },
      { key: 'requirementsElicitation', name: 'Anforderungserhebung', pt: 30.55 },
      { key: 'specification', name: 'Spezifikation', pt: 38.19 },
      { key: 'reviewQa', name: 'Review & QA', pt: 16.37 },
      { key: 'acceptanceHandover', name: 'Abnahme & Übergabe', pt: 5.46 },
      { key: 'projectManagement', name: 'Projektmanagement', pt: 5.46 },
    ];
    const rows = computeTimeline(phases, MO_2026_05_25, 2);
    expect(rows).toHaveLength(6);

    // Summe der Werktage = ceil(13.09/2) + ceil(30.55/2) + ceil(38.19/2)
    //                    + ceil(16.37/2) + ceil(5.46/2) + ceil(5.46/2)
    //                    = 7 + 16 + 20 + 9 + 3 + 3 = 58
    const totalDays = rows.reduce((s, r) => s + r.durationDays, 0);
    expect(totalDays).toBe(58);

    // Erste Phase beginnt Mo 25.05.
    expect(isoOf(rows[0].startDate)).toBe('2026-05-25');
    // Letzte Phase endet nach 58 Werktagen — gehen wir ca. 12 Wochen weiter.
    // Wir prüfen nur, dass die Reihenfolge konsistent ist.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].startDate.getTime()).toBeGreaterThan(rows[i - 1].endDate.getTime());
    }
  });
});
