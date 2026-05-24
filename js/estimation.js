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

import {
  WEIGHTS,
  USER_SCALING_THRESHOLDS,
  PROJECT_TYPE_MULTIPLIERS,
  COMPLEXITY_BUFFER,
  RANGE_FACTORS,
  PHASE_DISTRIBUTION,
  DEFAULT_TAGESSATZ,
} from './config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Konstanten (BRIEFING.md → "Parameter-Gewichte")
// Alle Schätzformel-Konstanten und der Default-Tagessatz leben zentral in
// config.js (siehe import oben).
// ─────────────────────────────────────────────────────────────────────────────

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
 * estimation.js bleibt pur: der Tagessatz wird als Parameter reingereicht
 * (Default = {@link DEFAULT_TAGESSATZ}). Der UI-Layer (wizard.js) ruft
 * `getTagessatz()` aus config.js auf und übergibt den Wert hier — so liest
 * estimation.js selbst keinen localStorage.
 *
 * @param {EstimationParams} params
 * @param {number} [tagessatz=DEFAULT_TAGESSATZ] Tagessatz in EUR (> 0).
 * @returns {{
 *   min: number,
 *   likely: number,
 *   max: number,
 *   phases: Array<{ key: string, name: string, share: number, pt: number }>,
 *   costs: { min: number, likely: number, max: number }
 * }}
 */
export function calculateEstimation(params, tagessatz = DEFAULT_TAGESSATZ) {
  if (params === null || typeof params !== 'object') {
    throw new TypeError('calculateEstimation erwartet ein Parameter-Objekt.');
  }
  if (typeof tagessatz !== 'number' || !Number.isFinite(tagessatz)) {
    throw new TypeError(`calculateEstimation: Tagessatz muss eine endliche Zahl sein (erhalten: ${String(tagessatz)}).`);
  }
  if (tagessatz <= 0) {
    throw new RangeError(`calculateEstimation: Tagessatz muss größer als 0 sein (erhalten: ${tagessatz}).`);
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
    min: min * tagessatz,
    likely: likely * tagessatz,
    max: max * tagessatz,
  };

  return { min, likely, max, phases, costs };
}
