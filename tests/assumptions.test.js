import { describe, it, expect } from 'vitest';
import { ASSUMPTION_RULES, generateAssumptions } from '../js/assumptions.js';

// IDs der Always-Regeln in definierter Reihenfolge (Briefing).
const ALWAYS_IDS = [
  'stakeholders-workshops',
  'review-cycle-5-days',
  'existing-documentation',
];

const ALL_CONDITIONAL_IDS = [
  'interface-descriptions',
  'interface-contacts',
  'codebase-access',
  'translations-by-customer',
  'batch-workshops',
  'end-user-reps',
];

// ─────────────────────────────────────────────────────────────────────────────
// Always-Regeln
// ─────────────────────────────────────────────────────────────────────────────

describe('Always-Regeln', () => {
  it('erscheinen auch bei leerem Params-Objekt', () => {
    const result = generateAssumptions({});
    const ids = result.map(a => a.id);
    expect(ids).toEqual(ALWAYS_IDS);
    expect(result).toHaveLength(3);
  });

  it('haben die korrekten Texte aus dem Briefing', () => {
    const result = generateAssumptions({});
    expect(result[0].text).toBe('Stakeholder sind in maximal 2 Workshop-Runden je Use Case verfügbar');
    expect(result[1].text).toBe('Reviewzyklen werden in maximal 5 Werktagen abgeschlossen');
    expect(result[2].text).toBe('Bestehende Systemdokumentation wird zur Verfügung gestellt');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Conditional-Regeln — pro Regel ein positiver + ein negativer Test
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pro Regel ein Paar { positive, negative } an Beispiel-Params. Die positiven
 * Params erfüllen genau die jeweilige Bedingung (und keine andere Conditional,
 * damit der Test isoliert ist), die negativen erfüllen sie knapp nicht.
 */
const CONDITIONAL_CASES = [
  {
    id: 'interface-descriptions',
    positive: { interfaces: 1 },
    negative: { interfaces: 0 },
  },
  {
    id: 'interface-contacts',
    positive: { interfaces: 4 },     // > 3
    negative: { interfaces: 3 },     // Grenze: 3 darf NICHT triggern
  },
  {
    id: 'codebase-access',
    positive: { projectType: 'Brownfield' },
    negative: { projectType: 'Greenfield' },
  },
  {
    id: 'translations-by-customer',
    positive: { languages: 2 },
    negative: { languages: 1 },
  },
  {
    id: 'batch-workshops',
    positive: { batches: 1 },
    negative: { batches: 0 },
  },
  {
    id: 'end-user-reps',
    positive: { users: 51 },         // > 50
    negative: { users: 50 },         // Grenze: 50 darf NICHT triggern
  },
];

describe.each(CONDITIONAL_CASES)('Conditional-Regel $id', ({ id, positive, negative }) => {
  it('erscheint, wenn die Bedingung erfüllt ist', () => {
    const ids = generateAssumptions(positive).map(a => a.id);
    expect(ids).toContain(id);
  });

  it('erscheint nicht, wenn die Bedingung nicht erfüllt ist', () => {
    const ids = generateAssumptions(negative).map(a => a.id);
    expect(ids).not.toContain(id);
  });
});

// Sonderfall: codebase-access matcht auch für Migration.
describe('Conditional-Regel codebase-access — Migration', () => {
  it('erscheint auch bei projectType=Migration', () => {
    const ids = generateAssumptions({ projectType: 'Migration' }).map(a => a.id);
    expect(ids).toContain('codebase-access');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reihenfolge: Always vor Conditionals
// ─────────────────────────────────────────────────────────────────────────────

describe('Reihenfolge', () => {
  it('Always-Regeln stehen immer vor Conditionals', () => {
    const params = {
      interfaces: 5,
      languages: 3,
      batches: 2,
      users: 1000,
      projectType: 'Brownfield',
    };
    const ids = generateAssumptions(params).map(a => a.id);
    const firstConditionalIndex = ids.findIndex(id => !ALWAYS_IDS.includes(id));
    const lastAlwaysIndex = ids
      .map((id, i) => (ALWAYS_IDS.includes(id) ? i : -1))
      .reduce((acc, i) => Math.max(acc, i), -1);
    expect(lastAlwaysIndex).toBeLessThan(firstConditionalIndex);
  });

  it('die ersten drei Annahmen entsprechen exakt der Always-Reihenfolge — auch wenn viele Conditionals matchen', () => {
    const params = {
      interfaces: 10,
      languages: 5,
      batches: 3,
      users: 5000,
      projectType: 'Migration',
    };
    const ids = generateAssumptions(params).map(a => a.id);
    expect(ids.slice(0, 3)).toEqual(ALWAYS_IDS);
  });

  it('Conditional-Regeln erscheinen in Definitionsreihenfolge', () => {
    const params = {
      interfaces: 5,           // matcht interface-descriptions + interface-contacts
      languages: 2,            // matcht translations-by-customer
      batches: 1,              // matcht batch-workshops
      users: 200,              // matcht end-user-reps
      projectType: 'Brownfield', // matcht codebase-access
    };
    const ids = generateAssumptions(params).map(a => a.id);
    // Expected: alle Always + alle Conditionals in Definitionsreihenfolge.
    expect(ids).toEqual([...ALWAYS_IDS, ...ALL_CONDITIONAL_IDS]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Keine Duplikate
// ─────────────────────────────────────────────────────────────────────────────

describe('Keine Duplikate', () => {
  it('Output enthält jede ID maximal einmal — auch bei Params, die alle Regeln matchen', () => {
    const params = {
      interfaces: 10,
      languages: 5,
      batches: 3,
      users: 5000,
      projectType: 'Migration',
    };
    const ids = generateAssumptions(params).map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ASSUMPTION_RULES selbst enthält keine doppelten IDs', () => {
    const ids = ASSUMPTION_RULES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Demo-Datenkombination "mittel" (Brownfield)
// ─────────────────────────────────────────────────────────────────────────────

describe('Demo-Datenkombination mittel (Brownfield)', () => {
  const params = {
    pages: 15,
    useCases: 10,
    businessObjects: 12,
    interfaces: 4,
    batches: 2,
    languages: 2,
    roles: 5,
    users: 150,
    projectType: 'Brownfield',
  };

  it('erzeugt exakt 9 Annahmen mit den erwarteten IDs in korrekter Reihenfolge', () => {
    const ids = generateAssumptions(params).map(a => a.id);
    expect(ids).toEqual([
      // Always
      'stakeholders-workshops',
      'review-cycle-5-days',
      'existing-documentation',
      // Conditionals
      'interface-descriptions',  // interfaces=4 > 0
      'interface-contacts',      // interfaces=4 > 3
      'codebase-access',         // Brownfield
      'translations-by-customer',// languages=2 > 1
      'batch-workshops',         // batches=2 > 0
      'end-user-reps',           // users=150 > 50
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('Validation', () => {
  it('wirft TypeError bei null', () => {
    expect(() => generateAssumptions(null)).toThrow(TypeError);
  });

  it('wirft TypeError bei undefined', () => {
    expect(() => generateAssumptions(undefined)).toThrow(TypeError);
  });

  it('wirft TypeError bei Array', () => {
    expect(() => generateAssumptions([])).toThrow(TypeError);
  });

  it('wirft TypeError bei String', () => {
    expect(() => generateAssumptions('not an object')).toThrow(TypeError);
  });

  it('wirft TypeError bei Number', () => {
    expect(() => generateAssumptions(42)).toThrow(TypeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Robustheit gegen Teilbefüllung
// ─────────────────────────────────────────────────────────────────────────────

describe('Robustheit', () => {
  it('behandelt fehlende numerische Felder als 0 (Live-Preview-Szenario)', () => {
    // Nur projectType gesetzt, alle anderen Felder fehlen.
    const result = generateAssumptions({ projectType: 'Greenfield' });
    const ids = result.map(a => a.id);
    expect(ids).toEqual(ALWAYS_IDS); // keine Conditional matcht
  });

  it('ignoriert die codebase-access-Regel, wenn projectType fehlt', () => {
    const ids = generateAssumptions({ interfaces: 5 }).map(a => a.id);
    expect(ids).not.toContain('codebase-access');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Input-Mutation
// ─────────────────────────────────────────────────────────────────────────────

describe('Input-Mutation', () => {
  it('mutiert das Params-Objekt nicht', () => {
    const params = {
      pages: 15,
      useCases: 10,
      businessObjects: 12,
      interfaces: 4,
      batches: 2,
      languages: 2,
      roles: 5,
      users: 150,
      projectType: 'Brownfield',
    };
    const snapshot = structuredClone(params);
    generateAssumptions(params);
    expect(params).toEqual(snapshot);
  });
});
