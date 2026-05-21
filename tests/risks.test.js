import { describe, it, expect } from 'vitest';
import { RISK_RULES, RISK_SEVERITIES, generateRisks } from '../js/risks.js';

// ─────────────────────────────────────────────────────────────────────────────
// Leeres Params-Objekt — keine Always-Risiken
// ─────────────────────────────────────────────────────────────────────────────

describe('Leeres Params-Objekt', () => {
  it('erzeugt ein leeres Array (Risiken haben keine Always-Regeln)', () => {
    expect(generateRisks({})).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Einfache Conditional-Regeln — pos/neg an den Grenzwerten verankert
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pro Regel ein positiver (Bedingung knapp erfüllt) und ein negativer Fall
 * (Bedingung knapp nicht erfüllt) — damit der Grenzwert "> X" nicht
 * unbemerkt zu "≥ X" rutscht.
 *
 * Die kombinatorischen Regeln interface-data-mismatch und pages-usecases-mismatch
 * werden separat unten getestet.
 */
const SIMPLE_CASES = [
  { id: 'many-interfaces',           positive: { interfaces: 6 },          negative: { interfaces: 5 } },
  { id: 'high-usecase-count',        positive: { useCases: 21 },           negative: { useCases: 20 } },
  { id: 'multilingual-overhead',     positive: { languages: 3 },           negative: { languages: 2 } },
  { id: 'migration-scope-exclusion', positive: { projectType: 'Migration' }, negative: { projectType: 'Greenfield' } },
  { id: 'change-management-scope',   positive: { users: 501 },             negative: { users: 500 } },
  { id: 'high-role-complexity',      positive: { roles: 9 },               negative: { roles: 8 } },
];

describe.each(SIMPLE_CASES)('Regel $id', ({ id, positive, negative }) => {
  it('erscheint, wenn die Bedingung erfüllt ist', () => {
    const ids = generateRisks(positive).map(r => r.id);
    expect(ids).toContain(id);
  });

  it('erscheint nicht, wenn die Bedingung knapp nicht erfüllt ist', () => {
    const ids = generateRisks(negative).map(r => r.id);
    expect(ids).not.toContain(id);
  });
});

// migration-scope-exclusion darf nicht für Brownfield matchen.
describe('Regel migration-scope-exclusion — weitere Negativ-Tests', () => {
  it('matcht NICHT für Brownfield', () => {
    const ids = generateRisks({ projectType: 'Brownfield' }).map(r => r.id);
    expect(ids).not.toContain('migration-scope-exclusion');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Kombinatorisch: interface-data-mismatch  (interfaces > 0 && businessObjects < interfaces)
// ─────────────────────────────────────────────────────────────────────────────

describe('Kombinatorische Regel interface-data-mismatch', () => {
  const cases = [
    { interfaces: 0, businessObjects: 0, expected: false, label: '0/0 — interfaces=0 hebelt Bedingung aus' },
    { interfaces: 3, businessObjects: 2, expected: true,  label: '3/2 — beide Teilbedingungen erfüllt' },
    { interfaces: 3, businessObjects: 3, expected: false, label: '3/3 — businessObjects < interfaces falsch (gleich)' },
    { interfaces: 3, businessObjects: 4, expected: false, label: '3/4 — businessObjects < interfaces falsch (mehr)' },
  ];

  it.each(cases)('$label', ({ interfaces, businessObjects, expected }) => {
    const ids = generateRisks({ interfaces, businessObjects }).map(r => r.id);
    expect(ids.includes('interface-data-mismatch')).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Kombinatorisch: pages-usecases-mismatch  (pages > 30 && useCases < 5)
// ─────────────────────────────────────────────────────────────────────────────

describe('Kombinatorische Regel pages-usecases-mismatch', () => {
  const cases = [
    { pages: 31, useCases: 4, expected: true,  label: '31/4 — beide Teilbedingungen erfüllt' },
    { pages: 30, useCases: 4, expected: false, label: '30/4 — pages > 30 falsch (gleich)' },
    { pages: 31, useCases: 5, expected: false, label: '31/5 — useCases < 5 falsch (gleich)' },
  ];

  it.each(cases)('$label', ({ pages, useCases, expected }) => {
    const ids = generateRisks({ pages, useCases }).map(r => r.id);
    expect(ids.includes('pages-usecases-mismatch')).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Severity-Sortierung
// ─────────────────────────────────────────────────────────────────────────────

describe('Severity-Sortierung', () => {
  it('sortiert high vor medium vor low (Params triggern alle drei Severities)', () => {
    // many-interfaces (high), high-usecase-count (medium), multilingual-overhead (low).
    // businessObjects=10 ist hoch genug, damit interface-data-mismatch NICHT triggert.
    const params = {
      interfaces: 6,
      businessObjects: 10,
      useCases: 21,
      languages: 3,
    };
    const severities = generateRisks(params).map(r => r.severity);
    expect(severities).toEqual(['high', 'medium', 'low']);
  });

  it('innerhalb gleicher Severity bleibt die Definitionsreihenfolge erhalten', () => {
    // Drei high-Regeln triggern (in Definitionsreihenfolge: #1, #5, #8).
    const params = {
      interfaces: 10,
      businessObjects: 15,   // verhindert interface-data-mismatch
      pages: 31,
      useCases: 4,           // triggert pages-usecases-mismatch, NICHT high-usecase-count
      projectType: 'Migration',
    };
    const ids = generateRisks(params).map(r => r.id);
    expect(ids).toEqual([
      'many-interfaces',           // def #1, high
      'migration-scope-exclusion', // def #5, high
      'pages-usecases-mismatch',   // def #8, high
    ]);
    expect(generateRisks(params).every(r => r.severity === 'high')).toBe(true);
  });

  it('mixed-Test: 7 Risiken über alle Severities — exakte Reihenfolge', () => {
    // Triggert (Definitionsreihenfolge):
    //   #1 many-interfaces       (high)    — interfaces=10
    //   #2 interface-data-mismatch (medium) — businessObjects=5 < interfaces=10
    //   #3 high-usecase-count    (medium)  — useCases=21
    //   #4 multilingual-overhead (low)     — languages=3
    //   #5 migration-scope-exclusion (high) — Migration
    //   #6 change-management-scope (medium) — users=501
    //   #7 high-role-complexity  (medium)  — roles=9
    //   #8 NICHT (pages=10, also pages>30 falsch)
    const params = {
      interfaces: 10,
      businessObjects: 5,
      useCases: 21,
      languages: 3,
      projectType: 'Migration',
      users: 501,
      roles: 9,
      pages: 10,
    };
    const ids = generateRisks(params).map(r => r.id);
    expect(ids).toEqual([
      // high (def #1, #5)
      'many-interfaces',
      'migration-scope-exclusion',
      // medium (def #2, #3, #6, #7)
      'interface-data-mismatch',
      'high-usecase-count',
      'change-management-scope',
      'high-role-complexity',
      // low (def #4)
      'multilingual-overhead',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Demo-Datenkombination "groß" (Migration)
// ─────────────────────────────────────────────────────────────────────────────

describe('Demo-Datenkombination groß (Migration)', () => {
  const params = {
    pages: 40,
    useCases: 25,
    businessObjects: 30,
    interfaces: 10,
    batches: 5,
    languages: 3,
    roles: 12,
    users: 800,
    projectType: 'Migration',
  };

  it('erzeugt exakt 6 Risiken mit den erwarteten IDs in Severity-Reihenfolge', () => {
    const ids = generateRisks(params).map(r => r.id);
    expect(ids).toEqual([
      'many-interfaces',           // high
      'migration-scope-exclusion', // high
      'high-usecase-count',        // medium
      'change-management-scope',   // medium
      'high-role-complexity',      // medium
      'multilingual-overhead',     // low
    ]);
  });

  it('Severity-Vektor stimmt: [high, high, medium, medium, medium, low]', () => {
    const severities = generateRisks(params).map(r => r.severity);
    expect(severities).toEqual(['high', 'high', 'medium', 'medium', 'medium', 'low']);
  });

  it('interface-data-mismatch matcht NICHT (businessObjects=30 ≥ interfaces=10)', () => {
    const ids = generateRisks(params).map(r => r.id);
    expect(ids).not.toContain('interface-data-mismatch');
  });

  it('pages-usecases-mismatch matcht NICHT (useCases=25, also useCases < 5 falsch)', () => {
    const ids = generateRisks(params).map(r => r.id);
    expect(ids).not.toContain('pages-usecases-mismatch');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('Validation', () => {
  it('wirft TypeError bei null', () => {
    expect(() => generateRisks(null)).toThrow(TypeError);
  });

  it('wirft TypeError bei undefined', () => {
    expect(() => generateRisks(undefined)).toThrow(TypeError);
  });

  it('wirft TypeError bei Array', () => {
    expect(() => generateRisks([])).toThrow(TypeError);
  });

  it('wirft TypeError bei String', () => {
    expect(() => generateRisks('not an object')).toThrow(TypeError);
  });

  it('wirft TypeError bei Number', () => {
    expect(() => generateRisks(42)).toThrow(TypeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Input-Mutation
// ─────────────────────────────────────────────────────────────────────────────

describe('Input-Mutation', () => {
  it('mutiert das Params-Objekt nicht', () => {
    const params = {
      pages: 40,
      useCases: 25,
      businessObjects: 30,
      interfaces: 10,
      batches: 5,
      languages: 3,
      roles: 12,
      users: 800,
      projectType: 'Migration',
    };
    const snapshot = structuredClone(params);
    generateRisks(params);
    expect(params).toEqual(snapshot);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Severity-Konsistenz — schützt gegen Tippfehler in RISK_RULES
// ─────────────────────────────────────────────────────────────────────────────

describe('Severity-Konsistenz', () => {
  it('jede Regel in RISK_RULES hat eine Severity in ["low","medium","high"]', () => {
    for (const rule of RISK_RULES) {
      expect(RISK_SEVERITIES).toContain(rule.severity);
    }
  });

  it('RISK_RULES enthält keine doppelten IDs', () => {
    const ids = RISK_RULES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
