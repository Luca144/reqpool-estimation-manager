/**
 * validation.js — UI-nahe Validierung der Wizard-Form-Felder.
 *
 * Scope: Diese Datei prüft Form-Inputs, BEVOR sie in die Schätzformel gehen.
 * Sie ersetzt NICHT die defensive Validation in estimation.js (Pure-Function-
 * Guard), sondern ist die Schicht, die in Step 1 und Step 2 des Wizards
 * dem User Inline-Feedback gibt.
 *
 * Bewusste Nicht-Anforderungen:
 *   - Keine Cross-Field-Validation (gehört zur Domain-Logic).
 *   - Keine i18n (App ist Deutsch only).
 *   - Keine Async-Validation.
 */

// ─────────────────────────────────────────────────────────────────────────────
// FIELD_SPECS — Single Source of Truth für alle Form-Felder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} StringSpec
 * @property {'string'} type
 * @property {boolean} required
 * @property {number} [maxLength]
 * @property {number} [minLength]
 *
 * @typedef {object} NumberSpec
 * @property {'number'} type
 * @property {boolean} required
 * @property {number} [min]
 * @property {number} [max]
 * @property {boolean} [integer]
 *
 * @typedef {object} EnumSpec
 * @property {'enum'} type
 * @property {boolean} required
 * @property {string[]} allowed
 *
 * @typedef {object} DateSpec
 * @property {'date'} type
 * @property {boolean} required
 *
 * @typedef {StringSpec | NumberSpec | EnumSpec | DateSpec} FieldSpec
 */

export const FIELD_SPECS = Object.freeze({
  projectName:           Object.freeze({ type: 'string', required: true,  maxLength: 200 }),
  customerName:          Object.freeze({ type: 'string', required: true,  maxLength: 200 }),
  projectDescription:    Object.freeze({ type: 'string', required: false, maxLength: 2000 }),
  projectType:           Object.freeze({ type: 'enum',   required: true,  allowed: Object.freeze(['Greenfield', 'Brownfield', 'Migration']) }),
  plannedStart:          Object.freeze({ type: 'date',   required: false }),
  plannedDurationMonths: Object.freeze({ type: 'number', required: false, min: 1, max: 120, integer: true }),
  pages:                 Object.freeze({ type: 'number', required: true,  min: 0, max: 1000, integer: true }),
  useCases:              Object.freeze({ type: 'number', required: true,  min: 0, max: 500, integer: true }),
  businessObjects:       Object.freeze({ type: 'number', required: true,  min: 0, max: 500, integer: true }),
  interfaces:            Object.freeze({ type: 'number', required: true,  min: 0, max: 100, integer: true }),
  batches:               Object.freeze({ type: 'number', required: true,  min: 0, max: 100, integer: true }),
  languages:             Object.freeze({ type: 'number', required: true,  min: 1, max: 20,  integer: true }),
  roles:                 Object.freeze({ type: 'number', required: true,  min: 1, max: 50,  integer: true }),
  users:                 Object.freeze({ type: 'number', required: true,  min: 1, max: 1000000, integer: true }),
});

/**
 * Anzeigelabels für Fehlermeldungen. Folgt der Briefing-Terminologie: Step-1-
 * Felder auf Deutsch, Systemparameter mit ihren englischen ReqPOOL-Domain-Namen.
 */
export const FIELD_LABELS = Object.freeze({
  projectName: 'Projektname',
  customerName: 'Kundenname',
  projectDescription: 'Projektbeschreibung',
  projectType: 'Projekttyp',
  plannedStart: 'Geplanter Start',
  plannedDurationMonths: 'Geplante Dauer (Monate)',
  pages: 'Pages',
  useCases: 'Use Cases',
  businessObjects: 'Business Objects',
  interfaces: 'Interfaces',
  batches: 'Batches',
  languages: 'Languages',
  roles: 'Roles',
  users: 'Users',
});

/**
 * Templates pro Fehler-Code. Platzhalter:
 *   {field}   — Anzeigelabel aus FIELD_LABELS
 *   {min}     — min bzw. minLength
 *   {max}     — max bzw. maxLength
 *   {allowed} — kommagetrennte Liste erlaubter Werte (Enum)
 */
export const ERROR_MESSAGES = Object.freeze({
  'required':            '{field} ist ein Pflichtfeld.',
  'too-short':           '{field} muss mindestens {min} Zeichen lang sein.',
  'too-long':            '{field} darf höchstens {max} Zeichen lang sein.',
  'not-a-number':        '{field} muss eine Zahl sein.',
  'below-min':           '{field} muss mindestens {min} sein.',
  'above-max':           '{field} darf höchstens {max} sein.',
  'not-integer':         '{field} muss eine ganze Zahl sein.',
  'not-in-allowed-list': '{field} muss einer der folgenden Werte sein: {allowed}.',
  'invalid-date':        '{field} muss ein gültiges Datum im Format JJJJ-MM-TT sein.',
});

const STEP_1_FIELDS = Object.freeze([
  'projectName',
  'customerName',
  'projectDescription',
  'projectType',
  'plannedStart',
  'plannedDurationMonths',
]);

const STEP_2_FIELDS = Object.freeze([
  'pages',
  'useCases',
  'businessObjects',
  'interfaces',
  'batches',
  'languages',
  'roles',
  'users',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Type-spezifische Validatoren (intern, ohne Message-Rendering)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {StringSpec} spec
 * @param {unknown} value
 * @returns {{ valid: true } | { valid: false, code: string }}
 */
function checkString(spec, value) {
  const str = value === null || value === undefined ? '' : String(value);
  const trimmed = str.trim();

  if (trimmed.length === 0) {
    return spec.required ? { valid: false, code: 'required' } : { valid: true };
  }
  if (spec.minLength != null && trimmed.length < spec.minLength) {
    return { valid: false, code: 'too-short' };
  }
  if (spec.maxLength != null && trimmed.length > spec.maxLength) {
    return { valid: false, code: 'too-long' };
  }
  return { valid: true };
}

/**
 * @param {NumberSpec} spec
 * @param {unknown} value
 * @returns {{ valid: true } | { valid: false, code: string }}
 */
function checkNumber(spec, value) {
  if (value === '' || value === null || value === undefined) {
    return spec.required ? { valid: false, code: 'required' } : { valid: true };
  }

  // Strikte Number-Konvertierung: parseFloat parst "42abc" zu 42, Number("42abc")
  // ergibt NaN. Beides muss übereinstimmen, sonst ist die Eingabe nicht sauber
  // numerisch.
  const parsed = Number.parseFloat(value);
  const coerced = Number(value);
  if (!Number.isFinite(parsed) || parsed !== coerced) {
    return { valid: false, code: 'not-a-number' };
  }

  if (spec.integer && !Number.isInteger(parsed)) {
    return { valid: false, code: 'not-integer' };
  }
  if (spec.min != null && parsed < spec.min) {
    return { valid: false, code: 'below-min' };
  }
  if (spec.max != null && parsed > spec.max) {
    return { valid: false, code: 'above-max' };
  }
  return { valid: true };
}

/**
 * @param {EnumSpec} spec
 * @param {unknown} value
 * @returns {{ valid: true } | { valid: false, code: string }}
 */
function checkEnum(spec, value) {
  if (value === '' || value === null || value === undefined) {
    return spec.required ? { valid: false, code: 'required' } : { valid: true };
  }
  if (!spec.allowed.includes(value)) {
    return { valid: false, code: 'not-in-allowed-list' };
  }
  return { valid: true };
}

/**
 * @param {DateSpec} spec
 * @param {unknown} value
 * @returns {{ valid: true } | { valid: false, code: string }}
 */
function checkDate(spec, value) {
  if (value === '' || value === null || value === undefined) {
    return spec.required ? { valid: false, code: 'required' } : { valid: true };
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { valid: false, code: 'invalid-date' };
  }
  // Round-Trip-Check: fängt Overflow wie "2026-02-31" ab.
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    return { valid: false, code: 'invalid-date' };
  }
  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Message-Rendering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Setzt Platzhalter im Template ein.
 * @param {string} template
 * @param {Record<string, unknown>} context
 * @returns {string}
 */
function renderMessage(template, context) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return context[key] != null ? String(context[key]) : match;
  });
}

/**
 * Baut den Platzhalter-Kontext für ein Feld zusammen. Eine String-Spec hat
 * `minLength`/`maxLength`, eine Number-Spec hat `min`/`max` — beide werden auf
 * `{min}`/`{max}` gemappt, weil ein Feld immer nur einen Typ hat.
 * @param {string} fieldName
 * @param {FieldSpec} spec
 */
function buildContext(fieldName, spec) {
  return {
    field: FIELD_LABELS[fieldName] ?? fieldName,
    min: spec.min ?? spec.minLength,
    max: spec.max ?? spec.maxLength,
    allowed: spec.allowed ? spec.allowed.join(', ') : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Öffentliche API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validiert ein einzelnes Feld gegen seine Spec.
 *
 * @param {string} fieldName  Key aus FIELD_SPECS.
 * @param {unknown} value     Roher Form-Wert (String, Number, null, ...).
 * @returns {{ valid: true } | { valid: false, code: string, message: string }}
 * @throws {RangeError} bei unbekanntem fieldName.
 */
export function validateField(fieldName, value) {
  const spec = FIELD_SPECS[fieldName];
  if (!spec) {
    throw new RangeError(`Unbekanntes Feld "${String(fieldName)}".`);
  }

  let result;
  switch (spec.type) {
    case 'string': result = checkString(spec, value); break;
    case 'number': result = checkNumber(spec, value); break;
    case 'enum':   result = checkEnum(spec, value); break;
    case 'date':   result = checkDate(spec, value); break;
    /* istanbul ignore next — schützt vor Tippfehlern in FIELD_SPECS */
    default: throw new RangeError(`Unbekannter Spec-Type "${spec.type}" für Feld "${fieldName}".`);
  }

  if (result.valid) {
    return { valid: true };
  }

  const template = ERROR_MESSAGES[result.code] ?? '{field} ist ungültig.';
  const message = renderMessage(template, buildContext(fieldName, spec));
  return { valid: false, code: result.code, message };
}

/**
 * Validiert eine Gruppe von Feldern.
 * @param {ReadonlyArray<string>} fieldNames
 * @param {Record<string, unknown>} values
 * @returns {{ valid: boolean, errors: Record<string, { code: string, message: string }> }}
 */
function validateGroup(fieldNames, values) {
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    throw new TypeError(`validateGroup erwartet ein Values-Objekt (erhalten: ${describe(values)}).`);
  }

  const errors = {};
  for (const fieldName of fieldNames) {
    const result = validateField(fieldName, values[fieldName]);
    if (!result.valid) {
      errors[fieldName] = { code: result.code, message: result.message };
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validiert alle Step-1-Felder (Projektkontext).
 * @param {Record<string, unknown>} values
 */
export function validateStep1(values) {
  return validateGroup(STEP_1_FIELDS, values);
}

/**
 * Validiert alle Step-2-Felder (Systemparameter).
 * @param {Record<string, unknown>} values
 */
export function validateStep2(values) {
  return validateGroup(STEP_2_FIELDS, values);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'Array';
  return typeof value;
}
