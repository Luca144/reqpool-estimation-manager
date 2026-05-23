/**
 * feasibility.js — Machbarkeits-Analyse (Pure Logic).
 *
 * Bewertet, ob die geplante Projektdauer aus Step 1 zur kalkulierten
 * Aufwandsmenge und der gewünschten Berater-Anzahl passt. Ergibt eine
 * Ampel (grün / gelb / rot) plus einen beratungs-sinnvollen Empfehlungstext.
 *
 * Asymmetrie der Logik: zu wenig Zeit ist beratungsseitig gefährlicher als
 * zu viel Zeit. Daher ist „rot" reserviert für „plan < realistisch − Toleranz",
 * während „gelb" für „plan > realistisch + Toleranz" steht (Zeit großzügig).
 *
 * Konstanten WORKDAYS_PER_MONTH und FEASIBILITY_TOLERANCE leben in config.js.
 */

import { WORKDAYS_PER_MONTH, FEASIBILITY_TOLERANCE } from './config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Konstanten — Empfehlungstexte
// ─────────────────────────────────────────────────────────────────────────────

const RECOMMENDATION_TEXTS = Object.freeze({
  green:
    'Die geplante Dauer ist realistisch für diesen Aufwand und die ' +
    'eingesetzte Berater-Anzahl.',
  yellow:
    'Die geplante Dauer ist großzügig — sie ist machbar, lässt aber ' +
    'Effizienz-Potential offen. Mit weniger Beratern oder kürzerer ' +
    'Laufzeit umsetzbar.',
  red:
    'Die geplante Dauer ist zu knapp für diesen Aufwand. Höheres Risiko ' +
    'für Termin- und Budgetüberschreitung. Empfehlung: mehr Berater ' +
    'einplanen oder Laufzeit anpassen.',
});

// ─────────────────────────────────────────────────────────────────────────────
// Helfer (intern)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wirft TypeError / RangeError für ungültige numerische Argumente.
 * @param {string} name
 * @param {unknown} value
 * @param {{ allowZero?: boolean }} [opts]
 */
function assertPositiveNumber(name, value, opts = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(
      `assessFeasibility: Parameter "${name}" muss eine endliche Zahl sein (erhalten: ${String(value)}).`,
    );
  }
  if (opts.allowZero ? value < 0 : value <= 0) {
    const bound = opts.allowZero ? 'darf nicht negativ sein' : 'muss größer als 0 sein';
    throw new RangeError(`assessFeasibility: Parameter "${name}" ${bound} (erhalten: ${value}).`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} FeasibilityResult
 * @property {'green' | 'yellow' | 'red'} status
 * @property {number} plannedMonths           Echo des Eingabewerts.
 * @property {number} realisticMonthsMin      Untere Grenze des Toleranzbands.
 * @property {number} realisticMonthsMax      Obere Grenze des Toleranzbands.
 * @property {string} recommendation          Beratungs-Empfehlung (Deutsch).
 */

/**
 * Bewertet die Machbarkeit eines Projekts aus PT, geplanter Dauer und
 * Berater-Anzahl.
 *
 * Berechnung:
 *   - realisticMonths  = (totalEffortPT / consultantCount) / WORKDAYS_PER_MONTH
 *   - realisticMonthsMin = realisticMonths × (1 − FEASIBILITY_TOLERANCE)
 *   - realisticMonthsMax = realisticMonths × (1 + FEASIBILITY_TOLERANCE)
 *
 * Status-Mapping:
 *   - plannedMonths < realisticMonthsMin → 'red'
 *   - plannedMonths > realisticMonthsMax → 'yellow'
 *   - sonst                              → 'green'
 *
 * Edge-Cases:
 *   - totalEffortPT < 0          → RangeError
 *   - consultantCount ≤ 0        → RangeError
 *   - plannedMonths ≤ 0          → RangeError
 *   - NaN / Infinity bei irgendeinem Argument → TypeError
 *
 * @param {number} totalEffortPT
 * @param {number} plannedMonths
 * @param {number} consultantCount
 * @returns {FeasibilityResult}
 */
export function assessFeasibility(totalEffortPT, plannedMonths, consultantCount) {
  assertPositiveNumber('totalEffortPT', totalEffortPT, { allowZero: true });
  assertPositiveNumber('plannedMonths', plannedMonths);
  assertPositiveNumber('consultantCount', consultantCount);

  const realisticMonths = (totalEffortPT / consultantCount) / WORKDAYS_PER_MONTH;
  const realisticMonthsMin = realisticMonths * (1 - FEASIBILITY_TOLERANCE);
  const realisticMonthsMax = realisticMonths * (1 + FEASIBILITY_TOLERANCE);

  let status;
  if (plannedMonths < realisticMonthsMin) {
    status = 'red';
  } else if (plannedMonths > realisticMonthsMax) {
    status = 'yellow';
  } else {
    status = 'green';
  }

  return {
    status,
    plannedMonths,
    realisticMonthsMin,
    realisticMonthsMax,
    recommendation: RECOMMENDATION_TEXTS[status],
  };
}
