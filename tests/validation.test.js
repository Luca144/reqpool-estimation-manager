import { describe, it, expect } from 'vitest';
import {
  FIELD_SPECS,
  FIELD_LABELS,
  ERROR_MESSAGES,
  validateField,
  validateStep1,
  validateStep2,
} from '../js/validation.js';

// ─────────────────────────────────────────────────────────────────────────────
// FIELD_SPECS — Snapshot der erwarteten Struktur
// ─────────────────────────────────────────────────────────────────────────────

describe('FIELD_SPECS', () => {
  const expectedKeys = [
    'projectName', 'customerName', 'projectDescription', 'projectType',
    'plannedStart', 'plannedDurationMonths',
    'pages', 'useCases', 'businessObjects', 'interfaces',
    'batches', 'languages', 'roles', 'users',
  ];

  it('enthält genau die erwarteten 14 Keys', () => {
    expect(Object.keys(FIELD_SPECS).sort()).toEqual([...expectedKeys].sort());
  });

  it('jede Spec hat einen gültigen type', () => {
    const validTypes = ['string', 'number', 'enum', 'date'];
    for (const [name, spec] of Object.entries(FIELD_SPECS)) {
      expect(validTypes, `Feld "${name}"`).toContain(spec.type);
    }
  });

  it('jede Spec hat ein boolesches required-Flag', () => {
    for (const [name, spec] of Object.entries(FIELD_SPECS)) {
      expect(typeof spec.required, `Feld "${name}"`).toBe('boolean');
    }
  });

  it('FIELD_LABELS enthält ein Label pro Spec-Key', () => {
    for (const key of Object.keys(FIELD_SPECS)) {
      expect(FIELD_LABELS[key], `Label für "${key}"`).toBeTypeOf('string');
      expect(FIELD_LABELS[key].length).toBeGreaterThan(0);
    }
  });

  it('languages, roles, users haben min: 1 (0 ist fachlich unsinnig)', () => {
    expect(FIELD_SPECS.languages.min).toBe(1);
    expect(FIELD_SPECS.roles.min).toBe(1);
    expect(FIELD_SPECS.users.min).toBe(1);
  });

  it('pages, useCases, businessObjects, interfaces, batches erlauben 0', () => {
    expect(FIELD_SPECS.pages.min).toBe(0);
    expect(FIELD_SPECS.useCases.min).toBe(0);
    expect(FIELD_SPECS.businessObjects.min).toBe(0);
    expect(FIELD_SPECS.interfaces.min).toBe(0);
    expect(FIELD_SPECS.batches.min).toBe(0);
  });

  it('projectType-Spec listet die drei Briefing-Werte', () => {
    expect(FIELD_SPECS.projectType.allowed).toEqual(['Greenfield', 'Brownfield', 'Migration']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ERROR_MESSAGES — Vollständigkeit
// ─────────────────────────────────────────────────────────────────────────────

describe('ERROR_MESSAGES', () => {
  const expectedCodes = [
    'required', 'too-short', 'too-long', 'not-a-number',
    'below-min', 'above-max', 'not-integer', 'not-in-allowed-list', 'invalid-date',
  ];

  it('enthält Einträge für alle 9 Codes', () => {
    for (const code of expectedCodes) {
      expect(ERROR_MESSAGES, `Code "${code}"`).toHaveProperty(code);
      expect(ERROR_MESSAGES[code]).toBeTypeOf('string');
      expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateField — Spec-Varianten
// ─────────────────────────────────────────────────────────────────────────────

describe('validateField — String-Spec', () => {
  it('positiv: gültiger projectName', () => {
    expect(validateField('projectName', 'Beispielprojekt')).toEqual({ valid: true });
  });

  it('negativ: leerer projectName → required', () => {
    const result = validateField('projectName', '');
    expect(result.valid).toBe(false);
    expect(result.code).toBe('required');
  });

  it('negativ: zu langer projectName → too-long', () => {
    const result = validateField('projectName', 'x'.repeat(201));
    expect(result.valid).toBe(false);
    expect(result.code).toBe('too-long');
  });
});

describe('validateField — Number-Spec', () => {
  it('positiv: pages=5', () => {
    expect(validateField('pages', 5)).toEqual({ valid: true });
  });

  it('positiv: pages="42" als String akzeptiert', () => {
    expect(validateField('pages', '42')).toEqual({ valid: true });
  });

  it('negativ: pages=-1 → below-min', () => {
    expect(validateField('pages', -1).code).toBe('below-min');
  });

  it('negativ: pages=1001 → above-max', () => {
    expect(validateField('pages', 1001).code).toBe('above-max');
  });

  it('negativ: pages=3.5 → not-integer', () => {
    expect(validateField('pages', 3.5).code).toBe('not-integer');
  });

  it('negativ: pages="42abc" → not-a-number', () => {
    expect(validateField('pages', '42abc').code).toBe('not-a-number');
  });
});

describe('validateField — Enum-Spec', () => {
  it('positiv: projectType=Greenfield', () => {
    expect(validateField('projectType', 'Greenfield')).toEqual({ valid: true });
  });

  it('positiv: projectType=Brownfield', () => {
    expect(validateField('projectType', 'Brownfield')).toEqual({ valid: true });
  });

  it('positiv: projectType=Migration', () => {
    expect(validateField('projectType', 'Migration')).toEqual({ valid: true });
  });

  it('negativ: projectType=Foobar → not-in-allowed-list', () => {
    const result = validateField('projectType', 'Foobar');
    expect(result.code).toBe('not-in-allowed-list');
  });

  it('Enum-Fehler enthält die erlaubten Werte in der Message', () => {
    const result = validateField('projectType', 'Foobar');
    expect(result.message).toContain('Greenfield');
    expect(result.message).toContain('Brownfield');
    expect(result.message).toContain('Migration');
  });
});

describe('validateField — Date-Spec', () => {
  it('positiv: ISO-Format YYYY-MM-DD', () => {
    expect(validateField('plannedStart', '2026-05-21')).toEqual({ valid: true });
  });

  it('negativ: DE-Format 31.12.2026 → invalid-date', () => {
    expect(validateField('plannedStart', '31.12.2026').code).toBe('invalid-date');
  });

  it('negativ: 2026-13-01 (ungültiger Monat) → invalid-date', () => {
    expect(validateField('plannedStart', '2026-13-01').code).toBe('invalid-date');
  });

  it('negativ: 2026-02-31 (Overflow-Datum) → invalid-date', () => {
    expect(validateField('plannedStart', '2026-02-31').code).toBe('invalid-date');
  });

  it('plannedStart=\'\' ist okay, weil das Feld optional ist', () => {
    expect(validateField('plannedStart', '')).toEqual({ valid: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Cases Strings
// ─────────────────────────────────────────────────────────────────────────────

describe('validateField — Edge Cases Strings', () => {
  it('leerer projectName → required', () => {
    expect(validateField('projectName', '').code).toBe('required');
  });

  it('whitespace-only projectName → required (Trim)', () => {
    expect(validateField('projectName', '   ').code).toBe('required');
  });

  it('Tab/Newline-only projectName → required', () => {
    expect(validateField('projectName', '\t\n  ').code).toBe('required');
  });

  it('projectName mit Länge = maxLength (200) ist gültig', () => {
    expect(validateField('projectName', 'x'.repeat(200))).toEqual({ valid: true });
  });

  it('projectName mit Länge = maxLength+1 (201) → too-long', () => {
    expect(validateField('projectName', 'x'.repeat(201)).code).toBe('too-long');
  });

  it('Whitespace zählt nicht zur Länge (trim vor Längenprüfung)', () => {
    // 198 x + 4 Leerzeichen = 202 Zeichen roh, getrimmt 198 → gültig.
    const value = `  ${'x'.repeat(198)}  `;
    expect(value.length).toBe(202);
    expect(validateField('projectName', value)).toEqual({ valid: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Cases Numerics
// ─────────────────────────────────────────────────────────────────────────────

describe('validateField — Edge Cases Numerics', () => {
  it('"42" String → ok', () => {
    expect(validateField('pages', '42')).toEqual({ valid: true });
  });

  it('"42abc" → not-a-number', () => {
    expect(validateField('pages', '42abc').code).toBe('not-a-number');
  });

  it('"" → required-fail bei required Feld', () => {
    expect(validateField('pages', '').code).toBe('required');
  });

  it('"abc" → not-a-number (parseFloat liefert NaN)', () => {
    expect(validateField('pages', 'abc').code).toBe('not-a-number');
  });

  it('pages=0 ist gültig (Min-Grenze exakt)', () => {
    expect(validateField('pages', 0)).toEqual({ valid: true });
  });

  it('pages=1000 ist gültig (Max-Grenze exakt)', () => {
    expect(validateField('pages', 1000)).toEqual({ valid: true });
  });

  it('pages=-1 → below-min', () => {
    expect(validateField('pages', -1).code).toBe('below-min');
  });

  it('pages=1001 → above-max', () => {
    expect(validateField('pages', 1001).code).toBe('above-max');
  });

  it('languages=0 → below-min (Min-Grenze ist 1)', () => {
    expect(validateField('languages', 0).code).toBe('below-min');
  });

  it('languages=1 ist gültig', () => {
    expect(validateField('languages', 1)).toEqual({ valid: true });
  });

  it('pages=3.5 → not-integer (Integer-Spec verletzt)', () => {
    expect(validateField('pages', 3.5).code).toBe('not-integer');
  });

  it('pages=true → not-a-number', () => {
    expect(validateField('pages', true).code).toBe('not-a-number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Optional-Felder
// ─────────────────────────────────────────────────────────────────────────────

describe('validateField — Optional-Felder', () => {
  it('projectDescription="" ist gültig', () => {
    expect(validateField('projectDescription', '')).toEqual({ valid: true });
  });

  it('projectDescription mit gültigem Text ist gültig', () => {
    expect(validateField('projectDescription', 'Eine kurze Beschreibung.')).toEqual({ valid: true });
  });

  it('projectDescription > 2000 Zeichen → too-long', () => {
    expect(validateField('projectDescription', 'x'.repeat(2001)).code).toBe('too-long');
  });

  it('plannedStart="" ist gültig (optional)', () => {
    expect(validateField('plannedStart', '')).toEqual({ valid: true });
  });

  it('plannedDurationMonths="" ist gültig (optional)', () => {
    expect(validateField('plannedDurationMonths', '')).toEqual({ valid: true });
  });

  it('plannedDurationMonths=0 → below-min (min ist 1)', () => {
    expect(validateField('plannedDurationMonths', 0).code).toBe('below-min');
  });

  it('plannedDurationMonths=121 → above-max', () => {
    expect(validateField('plannedDurationMonths', 121).code).toBe('above-max');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Platzhalter — verankerte Strings
// ─────────────────────────────────────────────────────────────────────────────

describe('validateField — Platzhalter-Rendering', () => {
  it('{field} wird durch das Anzeigelabel ersetzt', () => {
    const result = validateField('projectName', '');
    expect(result.message).toBe('Projektname ist ein Pflichtfeld.');
  });

  it('{max} wird durch spec.max ersetzt (above-max)', () => {
    const result = validateField('pages', 1001);
    expect(result.message).toBe('Pages darf höchstens 1000 sein.');
  });

  it('{min} wird durch spec.min ersetzt (below-min)', () => {
    const result = validateField('pages', -1);
    expect(result.message).toBe('Pages muss mindestens 0 sein.');
  });

  it('{max} wird durch spec.maxLength ersetzt (too-long)', () => {
    const result = validateField('projectName', 'x'.repeat(201));
    expect(result.message).toBe('Projektname darf höchstens 200 Zeichen lang sein.');
  });

  it('{allowed} wird durch die kommagetrennte Liste ersetzt (not-in-allowed-list)', () => {
    const result = validateField('projectType', 'Foobar');
    expect(result.message).toBe('Projekttyp muss einer der folgenden Werte sein: Greenfield, Brownfield, Migration.');
  });

  it('Use-Cases-Label kommt korrekt im Fehler an', () => {
    const result = validateField('useCases', '');
    expect(result.message).toBe('Use Cases ist ein Pflichtfeld.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateField — Sonstige
// ─────────────────────────────────────────────────────────────────────────────

describe('validateField — Sonstige', () => {
  it('wirft RangeError bei unbekanntem Feld', () => {
    expect(() => validateField('thereIsNoSuchField', 'foo')).toThrow(RangeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateStep1
// ─────────────────────────────────────────────────────────────────────────────

describe('validateStep1', () => {
  const validValues = {
    projectName: 'Demo-Projekt',
    customerName: 'Demo-Kunde GmbH',
    projectDescription: 'Eine Beispielbeschreibung.',
    projectType: 'Greenfield',
    plannedStart: '2026-06-01',
    plannedDurationMonths: 12,
  };

  it('komplett gültiges Set → { valid: true, errors: {} }', () => {
    expect(validateStep1(validValues)).toEqual({ valid: true, errors: {} });
  });

  it('optionale Felder dürfen leer sein', () => {
    const values = {
      projectName: 'X',
      customerName: 'Y',
      projectDescription: '',
      projectType: 'Brownfield',
      plannedStart: '',
      plannedDurationMonths: '',
    };
    expect(validateStep1(values)).toEqual({ valid: true, errors: {} });
  });

  it('zwei kaputte Felder → errors enthält genau diese zwei Keys', () => {
    const values = {
      ...validValues,
      projectName: '',         // → required
      projectType: 'Foobar',   // → not-in-allowed-list
    };
    const result = validateStep1(values);
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(['projectName', 'projectType']);
    expect(result.errors.projectName.code).toBe('required');
    expect(result.errors.projectType.code).toBe('not-in-allowed-list');
  });

  it('fehlende Keys werden als undefined behandelt → required-Fehler wo gefordert', () => {
    const result = validateStep1({});
    expect(result.valid).toBe(false);
    // projectName, customerName, projectType sind required.
    expect(result.errors.projectName.code).toBe('required');
    expect(result.errors.customerName.code).toBe('required');
    expect(result.errors.projectType.code).toBe('required');
    // Optionale Felder dürfen fehlen.
    expect(result.errors.projectDescription).toBeUndefined();
    expect(result.errors.plannedStart).toBeUndefined();
    expect(result.errors.plannedDurationMonths).toBeUndefined();
  });

  it('wirft TypeError bei null', () => {
    expect(() => validateStep1(null)).toThrow(TypeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateStep2
// ─────────────────────────────────────────────────────────────────────────────

describe('validateStep2', () => {
  const validValues = {
    pages: 10,
    useCases: 5,
    businessObjects: 6,
    interfaces: 2,
    batches: 1,
    languages: 1,
    roles: 3,
    users: 50,
  };

  it('komplett gültiges Set → { valid: true, errors: {} }', () => {
    expect(validateStep2(validValues)).toEqual({ valid: true, errors: {} });
  });

  it('zwei kaputte Felder → genau diese Keys in errors', () => {
    const values = {
      ...validValues,
      pages: -1,            // → below-min
      languages: 0,         // → below-min (min ist 1)
    };
    const result = validateStep2(values);
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(['languages', 'pages']);
    expect(result.errors.pages.code).toBe('below-min');
    expect(result.errors.languages.code).toBe('below-min');
  });

  it('akzeptiert numerische Strings (HTML-Inputs liefern Strings)', () => {
    const stringValues = Object.fromEntries(
      Object.entries(validValues).map(([k, v]) => [k, String(v)]),
    );
    expect(validateStep2(stringValues)).toEqual({ valid: true, errors: {} });
  });

  it('alle Felder leer → 8 required-Fehler', () => {
    const result = validateStep2({});
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors)).toHaveLength(8);
    for (const code of Object.values(result.errors).map(e => e.code)) {
      expect(code).toBe('required');
    }
  });

  it('wirft TypeError bei Array', () => {
    expect(() => validateStep2([])).toThrow(TypeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Demo-Datenkombinationen aus dem Briefing
// ─────────────────────────────────────────────────────────────────────────────

describe('Demo-Datenkombinationen für validateStep2', () => {
  const demos = {
    klein: { pages: 5,  useCases: 3,  businessObjects: 4,  interfaces: 1,  batches: 0, languages: 1, roles: 2,  users: 20 },
    mittel:{ pages: 15, useCases: 10, businessObjects: 12, interfaces: 4,  batches: 2, languages: 2, roles: 5,  users: 150 },
    groß:  { pages: 40, useCases: 25, businessObjects: 30, interfaces: 10, batches: 5, languages: 3, roles: 12, users: 800 },
  };

  for (const [label, values] of Object.entries(demos)) {
    it(`${label}: validateStep2 → { valid: true, errors: {} }`, () => {
      expect(validateStep2(values)).toEqual({ valid: true, errors: {} });
    });
  }
});
