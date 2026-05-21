/**
 * estimation.js — Single Source of Truth für die parametrische Aufwandsschätzung.
 *
 * Pure Module: jede exportierte Funktion ist deterministisch (gleiche Eingabe →
 * gleiche Ausgabe), ohne DOM-Zugriff und ohne Side Effects. Damit ist die Logik
 * isoliert testbar (siehe tests/estimation.test.js).
 *
 * Die Konstanten unten sind die Single Source of Truth für die Schätzformel. Bei
 * Änderung der Gewichte hier reichen die Tests in tests/estimation.test.js zur
 * Verifikation; keine andere Datei muss angepasst werden.
 *
 * Spezifikation siehe BRIEFING.md, Abschnitt "Schätzlogik".
 */

// ─────────────────────────────────────────────────────────────────────────────
// Konstanten (BRIEFING.md → "Parameter-Gewichte")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PT-Aufwand pro Einheit eines Parameters (Basis-RE-Aufwand).
 * @type {Readonly<{ pages: number, useCases: number, businessObjects: number, interfaces: number, batches: number, languages: number, roles: number }>}
 */
export const WEIGHTS = Object.freeze({
  pages: 0.8,
  useCases: 2.5,
  businessObjects: 1.2,
  interfaces: 3.0,
  batches: 1.5,
  // Languages: erste Sprache kostet nichts extra, jede weitere 0.5 PT
  languages: 0.5,
  roles: 1.8,
});

/**
 * Stufen-basierter User-Scaling-Faktor.
 * Jede Stufe gilt bis einschließlich `upTo` Usern. Die letzte Stufe (upTo: Infinity)
 * fängt alle größeren Werte ab.
 *
 * Grenzwert-Konvention (Briefing-Tests: "10/11, 50/51, 200/201"):
 *   users <= 10   → 1.00
 *   users <= 50   → 1.10
 *   users <= 200  → 1.25
 *   users <= 1000 → 1.40
 *   sonst         → 1.60
 *
 * @type {ReadonlyArray<Readonly<{ upTo: number, factor: number }>>}
 */
export const USER_SCALING_THRESHOLDS = Object.freeze([
  Object.freeze({ upTo: 10, factor: 1.0 }),
  Object.freeze({ upTo: 50, factor: 1.1 }),
  Object.freeze({ upTo: 200, factor: 1.25 }),
  Object.freeze({ upTo: 1000, factor: 1.4 }),
  Object.freeze({ upTo: Infinity, factor: 1.6 }),
]);

/**
 * Aufschlag-Multiplikator je Projekttyp.
 * @type {Readonly<Record<'Greenfield' | 'Brownfield' | 'Migration', number>>}
 */
export const PROJECT_TYPE_MULTIPLIERS = Object.freeze({
  Greenfield: 1.0,
  Brownfield: 1.2,
  Migration: 1.35,
});

/**
 * Komplexitäts-Puffer (15% für Unvorhergesehenes), multiplikativ auf typeEffort.
 */
export const COMPLEXITY_BUFFER = 1.15;

/**
 * Range-Faktoren für die Pessimistisch / Wahrscheinlich / Optimistisch-Bandbreite.
 *   min:    -15% gegenüber likely
 *   likely:  100% (Referenz)
 *   max:    +25% gegenüber likely
 */
export const RANGE_FACTORS = Object.freeze({
  min: 0.85,
  likely: 1.0,
  max: 1.25,
});

/**
 * Phasen-Aufteilung des Gesamtaufwands (Summe der Shares = 1.0).
 * Die Reihenfolge ist die Anzeigereihenfolge in Donut-Chart und PDF.
 * @type {ReadonlyArray<Readonly<{ key: string, name: string, share: number }>>}
 */
export const PHASE_DISTRIBUTION = Object.freeze([
  Object.freeze({ key: 'stakeholderAnalysis', name: 'Stakeholder-Analyse', share: 0.12 }),
  Object.freeze({ key: 'requirementsElicitation', name: 'Anforderungserhebung', share: 0.28 }),
  Object.freeze({ key: 'specification', name: 'Spezifikation', share: 0.35 }),
  Object.freeze({ key: 'reviewQa', name: 'Review & QA', share: 0.15 }),
  Object.freeze({ key: 'acceptanceHandover', name: 'Abnahme & Übergabe', share: 0.05 }),
  Object.freeze({ key: 'projectManagement', name: 'Projektmanagement', share: 0.05 }),
]);

/**
 * Tagessatz in EUR für die Umrechnung PT → EUR.
 * Quelle: BRIEFING.md ("TAGESSATZ_EUR = 1200").
 */
export const TAGESSATZ_EUR = 1200;

// ─────────────────────────────────────────────────────────────────────────────
// Interne Helfer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} EstimationParams
 * @property {number} pages
 * @property {number} useCases
 * @property {number} businessObjects
 * @property {number} interfaces
 * @property {number} batches
 * @property {number} languages
 * @property {number} roles
 * @property {number} users
 * @property {'Greenfield' | 'Brownfield' | 'Migration'} projectType
 */

/** Erlaubte Parameter-Keys für die Basis-Aufwandsberechnung. */
const BASE_EFFORT_KEYS = Object.freeze([
  'pages',
  'useCases',
  'businessObjects',
  'interfaces',
  'batches',
  'languages',
  'roles',
]);

/**
 * Wirft RangeError, wenn `value` kein endliche, nicht-negative Zahl ist.
 * @param {string} fieldName
 * @param {unknown} value
 */
function assertNonNegativeNumber(fieldName, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Parameter "${fieldName}" muss eine endliche Zahl sein (erhalten: ${String(value)}).`);
  }
  if (value < 0) {
    throw new RangeError(`Parameter "${fieldName}" darf nicht negativ sein (erhalten: ${value}).`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exportierte Funktionen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Berechnet den Basis-RE-Aufwand (vor User-Scaling, Projekttyp-Aufschlag und
 * Komplexitäts-Puffer). Wirft bei negativen oder nicht-numerischen Eingaben.
 *
 * @param {Pick<EstimationParams, 'pages' | 'useCases' | 'businessObjects' | 'interfaces' | 'batches' | 'languages' | 'roles'>} params
 * @returns {number} Basis-Aufwand in Personentagen (PT).
 */
export function calculateBaseEffort(params) {
  if (params === null || typeof params !== 'object') {
    throw new TypeError('calculateBaseEffort erwartet ein Parameter-Objekt.');
  }

  for (const key of BASE_EFFORT_KEYS) {
    assertNonNegativeNumber(key, params[key]);
  }

  const { pages, useCases, businessObjects, interfaces, batches, languages, roles } = params;

  // Languages: erste Sprache kostet keinen zusätzlichen Aufwand.
  const additionalLanguages = Math.max(0, languages - 1);

  return (
    pages * WEIGHTS.pages +
    useCases * WEIGHTS.useCases +
    businessObjects * WEIGHTS.businessObjects +
    interfaces * WEIGHTS.interfaces +
    batches * WEIGHTS.batches +
    additionalLanguages * WEIGHTS.languages +
    roles * WEIGHTS.roles
  );
}

/**
 * Liefert den User-Scaling-Faktor für die gegebene Nutzerzahl.
 * Grenzwert-Konvention: Stufen sind inklusive ihres Upper-Bounds (siehe
 * {@link USER_SCALING_THRESHOLDS}).
 *
 * @param {number} users Anzahl der erwarteten Nutzer (≥ 0).
 * @returns {number} Multiplikator (1.0 … 1.6).
 */
export function getUserScalingFactor(users) {
  assertNonNegativeNumber('users', users);

  for (const stage of USER_SCALING_THRESHOLDS) {
    if (users <= stage.upTo) {
      return stage.factor;
    }
  }

  // Unreachable: die letzte Stufe hat upTo === Infinity. Defensive Fallback.
  return USER_SCALING_THRESHOLDS[USER_SCALING_THRESHOLDS.length - 1].factor;
}

/**
 * Liefert den Projekttyp-Aufschlag-Multiplikator.
 *
 * @param {'Greenfield' | 'Brownfield' | 'Migration'} projectType
 * @returns {number} Multiplikator (1.0 / 1.2 / 1.35).
 */
export function getProjectTypeMultiplier(projectType) {
  if (!Object.prototype.hasOwnProperty.call(PROJECT_TYPE_MULTIPLIERS, projectType)) {
    const allowed = Object.keys(PROJECT_TYPE_MULTIPLIERS).join(', ');
    throw new RangeError(`Unbekannter Projekttyp "${String(projectType)}". Erlaubt: ${allowed}.`);
  }
  return PROJECT_TYPE_MULTIPLIERS[projectType];
}

/**
 * Verteilt einen Gesamtaufwand (in PT) auf die in {@link PHASE_DISTRIBUTION}
 * definierten Phasen.
 *
 * @param {number} totalEffort Gesamtaufwand in PT (≥ 0).
 * @returns {Array<{ key: string, name: string, share: number, pt: number }>}
 */
export function calculatePhases(totalEffort) {
  assertNonNegativeNumber('totalEffort', totalEffort);

  return PHASE_DISTRIBUTION.map(phase => ({
    key: phase.key,
    name: phase.name,
    share: phase.share,
    pt: totalEffort * phase.share,
  }));
}

/**
 * Vollständige Schätzung: Basis-Effort → User-Scaling → Projekttyp-Aufschlag →
 * Komplexitäts-Puffer → Range (min/likely/max) → Phasen-Aufteilung → Kosten.
 *
 * @param {EstimationParams} params
 * @returns {{
 *   min: number,
 *   likely: number,
 *   max: number,
 *   phases: Array<{ key: string, name: string, share: number, pt: number }>,
 *   costs: { min: number, likely: number, max: number }
 * }}
 */
export function calculateEstimation(params) {
  if (params === null || typeof params !== 'object') {
    throw new TypeError('calculateEstimation erwartet ein Parameter-Objekt.');
  }

  const baseEffort = calculateBaseEffort(params);
  const userFactor = getUserScalingFactor(params.users);
  const typeFactor = getProjectTypeMultiplier(params.projectType);

  const scaledEffort = baseEffort * userFactor;
  const typeEffort = scaledEffort * typeFactor;
  const totalEffort = typeEffort * COMPLEXITY_BUFFER;

  const min = totalEffort * RANGE_FACTORS.min;
  const likely = totalEffort * RANGE_FACTORS.likely;
  const max = totalEffort * RANGE_FACTORS.max;

  const phases = calculatePhases(totalEffort);

  const costs = {
    min: min * TAGESSATZ_EUR,
    likely: likely * TAGESSATZ_EUR,
    max: max * TAGESSATZ_EUR,
  };

  return { min, likely, max, phases, costs };
}
